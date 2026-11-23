import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { signInAnonymously, updateProfile, type User } from "firebase/auth";
import { getFirebase } from "./firebase";
import { LOJA_NUVEM_ID } from "./firebasePadrao";
import { agoraIso } from "./datas";
import { setMeta } from "./db";
import type { EstadoEquipe, MembroLoja, PapelMembro } from "./types";
import { upsertMembro } from "./db";

export function pinValido(pin: string): boolean {
  return /^[0-9]{4,8}$/.test(pin);
}

export function nomeValido(nome: string): boolean {
  const n = nome.trim();
  return n.length >= 2 && n.length <= 40;
}

export function gerarCodigoRecuperacao(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

function esperaMs(falhas: number): number {
  if (falhas <= 1) return 1_000;
  if (falhas === 2) return 2_000;
  if (falhas === 3) return 4_000;
  if (falhas === 4) return 8_000;
  if (falhas === 5) return 16_000;
  return 30_000;
}

function refs(uid: string) {
  const { db } = getFirebase();
  const loja = LOJA_NUVEM_ID;
  return {
    db,
    loja,
    lojaRef: doc(db, "lojas", loja),
    acessoRef: doc(db, "lojas", loja, "privado", "acesso"),
    tentativasRef: doc(db, "lojas", loja, "tentativas", uid),
    ingressoRef: doc(db, "lojas", loja, "ingressos", uid),
    recuperacaoRef: doc(db, "lojas", loja, "recuperacao", uid),
    membroRef: doc(db, "lojas", loja, "membros", uid),
  };
}

async function garantirAuth(): Promise<User> {
  const { auth } = getFirebase();
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

async function registrarTentativa(uid: string): Promise<void> {
  const { tentativasRef } = refs(uid);
  const snap = await getDoc(tentativasRef);
  if (!snap.exists()) {
    const liberadaEm = Date.now() + 2_500;
    await setDoc(tentativasRef, {
      falhas: 1,
      proximaTentativa: Timestamp.fromMillis(liberadaEm),
    });
    await esperarAte(liberadaEm + 200);
    return;
  }
  const d = snap.data() as { falhas: number; proximaTentativa: Timestamp; bloqueadoAte?: Timestamp };
  const proxima = d.proximaTentativa.toMillis();
  const bloqueadoAte = d.bloqueadoAte?.toMillis() ?? 0;
  const agora = Date.now();
  if (d.falhas >= 15 && bloqueadoAte > agora) {
    const s = Math.ceil((bloqueadoAte - agora) / 1000);
    throw new Error(`Muitas tentativas. Espere ${s} segundos e tente de novo.`);
  }
  if (proxima > agora) await esperarAte(proxima + 200);
  if (d.falhas >= 15 && bloqueadoAte <= Date.now()) {
    const liberadaEm = Date.now() + 2_500;
    await setDoc(tentativasRef, {
      falhas: 1,
      proximaTentativa: Timestamp.fromMillis(liberadaEm),
    });
    await esperarAte(liberadaEm + 200);
    return;
  }
  const falhas = d.falhas + 1;
  const payload: Record<string, unknown> = {
    falhas,
    proximaTentativa: Timestamp.fromMillis(Math.max(Date.now(), proxima) + esperaMs(falhas)),
  };
  if (falhas >= 15) {
    payload.bloqueadoAte = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
  }
  await setDoc(tentativasRef, payload);
  const espera = (payload.proximaTentativa as Timestamp).toMillis();
  if (espera > Date.now()) await esperarAte(espera + 200);
}

function esperarAte(ts: number): Promise<void> {
  const ms = Math.max(0, ts - Date.now());
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cacheEquipe(estado: EstadoEquipe, membro: MembroLoja, codigo?: string): Promise<EstadoEquipe> {
  await upsertMembro(membro);
  await setMeta("equipe", estado);
  await setMeta("meu_nome", membro.nome);
  if (codigo) await setMeta("codigo_recuperacao", codigo);
  return estado;
}

async function lerSePermitido(ref: ReturnType<typeof doc>) {
  try {
    return await getDoc(ref);
  } catch (e) {
    // Non-members cannot read the store or the member list; treat as "not found".
    if ((e as { code?: string }).code === "permission-denied") return null;
    throw e;
  }
}


export class NaoEMembroError extends Error {
  constructor(message = "Este aparelho não está reconhecido na loja da nuvem. Entre de novo com o mesmo nome e o PIN.") {
    super(message);
    this.name = "NaoEMembroError";
  }
}

export function isNaoEMembroError(e: unknown): boolean {
  return e instanceof NaoEMembroError || (e instanceof Error && e.name === "NaoEMembroError");
}

/** Uses current rules (permission-denied ⇒ not a member) and the self-read rule when published. */
export async function verificarParticipacao(uid: string): Promise<"membro" | "ausente" | "bloqueado"> {
  const { membroRef } = refs(uid);
  const snap = await lerSePermitido(membroRef);
  if (!snap?.exists()) return "ausente";
  if ((snap.data() as MembroLoja).bloqueado) return "bloqueado";
  return "membro";
}

export async function entrarComPin(nomeBruto: string, pin: string): Promise<EstadoEquipe & { codigoRecuperacao?: string; primeiraVez: boolean }> {
  const nome = nomeBruto.trim();
  if (!nomeValido(nome)) throw new Error("Informe um nome de 2 a 40 letras.");
  if (!pinValido(pin)) throw new Error("O PIN deve ter de 4 a 8 números.");
  const user = await garantirAuth();
  try { await updateProfile(user, { displayName: nome }); } catch { /* ignore */ }
  const { loja, lojaRef, acessoRef, ingressoRef, membroRef, tentativasRef } = refs(user.uid);
  const agora = agoraIso();
  void loja;

  // Already in the team (same anonymous account): the rules allow reading.
  const membroSnap = await lerSePermitido(membroRef);
  if (membroSnap?.exists()) {
    const atual = membroSnap.data() as MembroLoja;
    if (atual.bloqueado) throw new Error("Este aparelho foi bloqueado. Fale com o Admin.");
    const lojaSnap = await getDoc(lojaRef);
    const liderUid = (lojaSnap.data() as { liderUid?: string } | undefined)?.liderUid ?? "";
    const membro: MembroLoja = { ...atual, nome, ultimoAcesso: agora };
    await setDoc(membroRef, { nome, ultimoAcesso: agora }, { merge: true });
    const estado: EstadoEquipe = {
      ehDono: liderUid === user.uid, ehLider: liderUid === user.uid, bloqueado: false, liderUid, meuNome: nome,
    };
    await cacheEquipe(estado, membro);
    return { ...estado, primeiraVez: false };
  }

  // First device: create the store in one batch. Do not getDoc the store first —
  // the rules hide it from anyone who is not a member, even when it does not exist.
  const codigo = gerarCodigoRecuperacao();
  const membroLider: MembroLoja = {
    uid: user.uid, nome, papel: "lider", bloqueado: false, ultimoAcesso: agora, criado_em: agora,
  };
  const batch = writeBatch(refs(user.uid).db);
  batch.set(lojaRef, { liderUid: user.uid, criado_em: agora });
  batch.set(acessoRef, { pin, codigoRecuperacao: codigo, atualizado_em: agora });
  batch.set(membroRef, membroLider);
  try {
    await batch.commit();
    const estado: EstadoEquipe = {
      ehDono: true, ehLider: true, bloqueado: false, liderUid: user.uid, meuNome: nome,
    };
    await cacheEquipe(estado, membroLider, codigo);
    return { ...estado, codigoRecuperacao: codigo, primeiraVez: true };
  } catch (e) {
    // If the store already exists, create is denied (not already-exists) because
    // non-members cannot read or update the loja document. Fall through and join
    // with the PIN. If the store really is missing, the ticket write fails next.
    void e;
  }

  // Join an existing store by presenting the PIN as a ticket. Rules compare it
  // to the private PIN; the client never reads that document.
  await registrarTentativa(user.uid);
  try {
    await setDoc(ingressoRef, { pin, nome, em: agoraIso() });
  } catch {
    throw new Error("PIN incorreto ou muitas tentativas. Espere um pouco e tente de novo.");
  }
  const membro: MembroLoja = {
    uid: user.uid, nome, papel: "membro", bloqueado: false, ultimoAcesso: agoraIso(), criado_em: agora,
  };
  await setDoc(membroRef, membro);
  const lojaSnap = await getDoc(lojaRef);
  const liderUid = (lojaSnap.data() as { liderUid?: string } | undefined)?.liderUid ?? "";
  try { await deleteDoc(ingressoRef); } catch { /* ignore */ }
  try { await setDoc(tentativasRef, { falhas: 0, proximaTentativa: Timestamp.now() }); } catch { /* ignore */ }
  const ehLider = liderUid === user.uid;
  const estado: EstadoEquipe = {
    ehDono: ehLider, ehLider, bloqueado: false, liderUid, meuNome: nome,
  };
  await cacheEquipe(estado, { ...membro, papel: ehLider ? "lider" : "membro" });
  return { ...estado, primeiraVez: false };
}

export async function recuperarLideranca(nomeBruto: string, pin: string, codigoBruto: string): Promise<EstadoEquipe> {
  const nome = nomeBruto.trim();
  const codigo = codigoBruto.trim().toUpperCase();
  if (!nomeValido(nome)) throw new Error("Informe um nome de 2 a 40 letras.");
  if (!pinValido(pin)) throw new Error("O PIN deve ter de 4 a 8 números.");
  if (!/^[A-Z0-9]{8}$/.test(codigo)) throw new Error("O código de recuperação tem 8 letras ou números.");
  const user = await garantirAuth();
  try { await updateProfile(user, { displayName: nome }); } catch { /* ignore */ }
  const { lojaRef, recuperacaoRef, membroRef } = refs(user.uid);
  // Do not read the store first: non-members are not allowed to. The recovery
  // ticket and the leadership update are authorized by the rules themselves.
  await registrarTentativa(user.uid);
  try {
    await setDoc(recuperacaoRef, { pin, codigo, em: agoraIso() });
  } catch {
    throw new Error("PIN ou código de recuperação incorretos, ou a loja ainda não existe na nuvem.");
  }
  const agora = agoraIso();
  try {
    await setDoc(lojaRef, { liderUid: user.uid, atualizado_em: agora }, { merge: true });
  } catch {
    throw new Error("A loja ainda não existe na nuvem. Entre com o PIN no primeiro aparelho.");
  }
  const membro: MembroLoja = {
    uid: user.uid, nome, papel: "lider", bloqueado: false, ultimoAcesso: agora, criado_em: agora,
  };
  const existente = await getDoc(membroRef);
  if (existente.exists()) {
    await setDoc(membroRef, { nome, papel: "lider", ultimoAcesso: agora, bloqueado: false }, { merge: true });
    membro.criado_em = (existente.data() as MembroLoja).criado_em ?? agora;
  } else {
    await setDoc(membroRef, membro);
  }
  try { await deleteDoc(recuperacaoRef); } catch { /* ignore */ }
  const estado: EstadoEquipe = {
    ehDono: true, ehLider: true, bloqueado: false, liderUid: user.uid, meuNome: nome,
  };
  await cacheEquipe(estado, membro, codigo);
  return estado;
}

export async function alterarPin(pinNovo: string, codigoAtual?: string): Promise<string> {
  if (!pinValido(pinNovo)) throw new Error("O novo PIN deve ter de 4 a 8 números.");
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Entre com o PIN primeiro.");
  const { acessoRef } = refs(user.uid);
  const codigo = (codigoAtual && /^[A-Z0-9]{8}$/.test(codigoAtual)) ? codigoAtual : gerarCodigoRecuperacao();
  await setDoc(acessoRef, { pin: pinNovo, codigoRecuperacao: codigo, atualizado_em: agoraIso() }, { merge: true });
  await setMeta("codigo_recuperacao", codigo);
  return codigo;
}

export async function renovarCodigoRecuperacao(pin: string, codigoAtual: string): Promise<string> {
  if (!pinValido(pin)) throw new Error("Informe o PIN atual.");
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Entre com o PIN primeiro.");
  const novo = gerarCodigoRecuperacao();
  const { acessoRef } = refs(user.uid);
  await setDoc(acessoRef, { pin, codigoRecuperacao: novo, atualizado_em: agoraIso() }, { merge: true });
  await setMeta("codigo_recuperacao", novo);
  void codigoAtual;
  return novo;
}

export async function transferirLideranca(novoLiderUid: string): Promise<void> {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Entre com o PIN primeiro.");
  if (novoLiderUid === user.uid) return;
  const { loja, lojaRef, db } = refs(user.uid);
  const alvo = doc(db, "lojas", loja, "membros", novoLiderUid);
  const snap = await getDoc(alvo);
  if (!snap.exists()) throw new Error("Essa pessoa não está na equipe.");
  const agora = agoraIso();
  const batch = writeBatch(db);
  batch.set(lojaRef, { liderUid: novoLiderUid, atualizado_em: agora }, { merge: true });
  batch.set(alvo, { papel: "lider" }, { merge: true });
  batch.set(doc(db, "lojas", loja, "membros", user.uid), { papel: "membro" }, { merge: true });
  await batch.commit();
}

export async function alterarNomeMembro(uid: string, nomeBruto: string): Promise<void> {
  const nome = nomeBruto.trim();
  if (!nomeValido(nome)) throw new Error("Informe um nome de 2 a 40 letras.");
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Entre com o PIN primeiro.");
  const { db } = getFirebase();
  const ref = doc(db, "lojas", LOJA_NUVEM_ID, "membros", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Essa pessoa não está na equipe.");
  await setDoc(ref, { nome }, { merge: true });
  const atual = snap.data() as MembroLoja;
  await upsertMembro({ ...atual, nome });
}
