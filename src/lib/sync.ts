import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebase } from "./firebase";
import {
  getMeta,
  listarAtividades,
  listarCobrancas,
  listarEncomendas,
  listarEntregas,
  listarMembros,
  listarPendentes, obterPendenteRegistro, obterVenda, obterProduto, obterEntrega, obterEncomenda, obterCobranca, obterReabastecimento,
  listarProdutos,
  listarReabastecimentos,
  listarVendas,
  limparPendente,
  obterConfig,
  removerMembroLocal,
  setMeta,
  upsertAtividade,
  upsertCobranca,
  upsertEncomenda,
  upsertEntrega,
  upsertMembro,
  upsertProduto,
  upsertReabastecimento,
  upsertVenda,
  salvarConfig,
} from "./db";
import type { Atividade, Cobranca, Encomenda, Entrega, EstadoEquipe, MembroLoja, Produto, Reabastecimento, Venda } from "./types";
export type { EstadoEquipe } from "./types";
import { agoraIso } from "./datas";
import { podeEnviarRegistro, corrigirAutoriaLocalParaEnvio, registroImportado } from "./autoria";
import { NaoEMembroError, verificarParticipacao } from "./acesso";
import { isPermissionDenied, mensagemErroSync, rotuloOperacao } from "./errosSync";
export { mensagemErroSync };

const LOTE = 400;


/** Firestore rejects `undefined` field values. */
function semUndefined(data: Record<string, unknown> | DocumentData): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

async function persistirAutoriaCorrigida(colecao: string, row: Record<string, unknown>): Promise<void> {
  if (colecao === "vendas") await upsertVenda(row as unknown as Venda, false);
  else if (colecao === "produtos") await upsertProduto(row as unknown as Produto, false);
  else if (colecao === "entregas") await upsertEntrega(row as unknown as Entrega, false);
  else if (colecao === "encomendas") await upsertEncomenda(row as unknown as Encomenda, false);
  else if (colecao === "cobrancas") await upsertCobranca(row as unknown as Cobranca, false);
  else if (colecao === "reabastecimentos") await upsertReabastecimento(row as unknown as Reabastecimento, false);
}

export const META_CURSOR_SYNC = "cursor_sync";

export async function obterCursorSync(): Promise<string | undefined> {
  const c = await getMeta<string>(META_CURSOR_SYNC);
  if (c) return c;
  const ult = await getMeta<string>("ultimo_sync");
  if (ult) return ult;
  return undefined;
}

export async function gravarCursorSync(iso: string): Promise<void> {
  const atual = await obterCursorSync();
  const next = atual && atual > iso ? atual : iso;
  await setMeta(META_CURSOR_SYNC, next);
  await setMeta("ultimo_sync", next);
}

export type MudancaNuvem = {
  colecao: string;
  registros: Array<{ id: string; excluido?: boolean; atualizado_em?: string }>;
};

export interface ProgressoSync {

  fase: string;
  feito: number;
  total: number;
}

export async function garantirMembro(loja: string, user: User): Promise<EstadoEquipe> {
  const { db } = getFirebase();
  const participacao = await verificarParticipacao(user.uid);
  if (participacao === "ausente") throw new NaoEMembroError();
  if (participacao === "bloqueado") {
    const estado: EstadoEquipe = { ehDono: false, ehLider: false, bloqueado: true, liderUid: "", meuNome: "" };
    await cacheEstado(estado);
    throw new Error("Este aparelho foi bloqueado. Fale com o Admin.");
  }
  const lojaRef = doc(db, "lojas", loja);
  let snap;
  try {
    snap = await getDoc(lojaRef);
  } catch (e) {
    if (isPermissionDenied(e)) throw new NaoEMembroError();
    throw e;
  }
  if (!snap.exists()) {
    throw new NaoEMembroError("A loja ainda não existe na nuvem. Entre com o seu nome e o PIN na tela de entrada.");
  }
  const liderUid = (snap.data() as { liderUid?: string }).liderUid ?? "";
  const membroRef = doc(db, "lojas", loja, "membros", user.uid);
  const membroSnap = await getDoc(membroRef);
  if (!membroSnap.exists()) {
    throw new NaoEMembroError();
  }
  const atual = membroSnap.data() as MembroLoja;
  if (atual.bloqueado) {
    const estado: EstadoEquipe = { ehDono: false, ehLider: false, bloqueado: true, liderUid, meuNome: atual.nome ?? "" };
    await cacheEstado(estado);
    throw new Error("Este aparelho foi bloqueado. Fale com o Admin.");
  }
  const agora = agoraIso();
  await setDoc(membroRef, { ultimoAcesso: agora }, { merge: true });
  await upsertMembro({ ...atual, ultimoAcesso: agora, nome: atual.nome ?? "", papel: atual.papel ?? (liderUid === user.uid ? "lider" : "membro") });
  const ehLider = liderUid === user.uid;
  const estado: EstadoEquipe = { ehDono: ehLider, ehLider, bloqueado: false, liderUid, meuNome: atual.nome ?? "" };
  await cacheEstado(estado);
  return estado;
}

async function cacheEstado(estado: EstadoEquipe): Promise<void> {
  await setMeta("equipe", estado);
}

export async function estadoEquipeLocal(): Promise<EstadoEquipe | undefined> {
  return getMeta<EstadoEquipe>("equipe");
}

export async function bloquearMembro(loja: string, uid: string, bloqueado: boolean): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "lojas", loja, "membros", uid);
  await setDoc(ref, { bloqueado }, { merge: true });
  const locais = await listarMembros();
  const atual = locais.find((m) => m.uid === uid);
  if (atual) await upsertMembro({ ...atual, bloqueado });
}

export async function removerMembro(loja: string, uid: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "lojas", loja, "membros", uid));
  await removerMembroLocal(uid);
}


async function escreverLote(itens: Array<{ path: string[]; data: DocumentData }>) {
  const { db } = getFirebase();
  for (let i = 0; i < itens.length; i += LOTE) {
    const fatia = itens.slice(i, i + LOTE);
    const batch = writeBatch(db);
    for (const it of fatia) {
      batch.set(doc(db, ...(it.path as [string, ...string[]])), semUndefined(it.data), { merge: true });
    }
    await batch.commit();
  }
}

export async function uploadInicial(
  loja: string,
  user: User,
  onProg?: (p: ProgressoSync) => void,
): Promise<void> {
  const estado = await estadoEquipeLocal();
  const ehAdmin = Boolean(estado?.ehDono || estado?.ehLider);
  const vendas = await listarVendas();
  const produtos = await listarProdutos();
  const entregas = await listarEntregas();
  const encomendas = await listarEncomendas();
  const cobrancas = await listarCobrancas(10_000);
  const reab = await listarReabastecimentos();
  const cfg = await obterConfig();
  const itens: Array<{ path: string[]; data: DocumentData }> = [];
  if (cfg && ehAdmin) itens.push({ path: ["lojas", loja, "configuracao", "atual"], data: cfg });
  for (const v of vendas) if (podeEnviarRegistro(v, ehAdmin)) itens.push({ path: ["lojas", loja, "vendas", v.id], data: v });
  for (const p of produtos) if (podeEnviarRegistro(p, ehAdmin)) itens.push({ path: ["lojas", loja, "produtos", p.id], data: p });
  for (const e of entregas) if (podeEnviarRegistro(e, ehAdmin)) itens.push({ path: ["lojas", loja, "entregas", e.id], data: e });
  for (const e of encomendas) if (podeEnviarRegistro(e, ehAdmin)) itens.push({ path: ["lojas", loja, "encomendas", e.id], data: e });
  for (const c of cobrancas) if (podeEnviarRegistro(c, ehAdmin)) itens.push({ path: ["lojas", loja, "cobrancas", c.id], data: c });
  for (const r of reab) if (podeEnviarRegistro(r, ehAdmin)) itens.push({ path: ["lojas", loja, "reabastecimentos", r.id], data: r });

  const total = itens.length;
  onProg?.({ fase: "enviando", feito: 0, total });
  for (let i = 0; i < itens.length; i += LOTE) {
    await escreverLote(itens.slice(i, i + LOTE));
    onProg?.({ fase: "enviando", feito: Math.min(i + LOTE, total), total });
  }
  await setMeta("precisa_upload_inicial", false);
  await setMeta("ultimo_sync", new Date().toISOString());
  void user;
}

async function puxarColecao(loja: string, colecao: string, desde?: string) {
  const { db } = getFirebase();
  const col = collection(db, "lojas", loja, colecao);
  const out: DocumentData[] = [];
  let ultimo: QueryDocumentSnapshot | undefined;
  for (;;) {
    const q = desde
      ? (ultimo
        ? query(col, where("atualizado_em", ">", desde), orderBy("atualizado_em"), startAfter(ultimo), limit(LOTE))
        : query(col, where("atualizado_em", ">", desde), orderBy("atualizado_em"), limit(LOTE)))
      : (ultimo
        ? query(col, orderBy(documentId()), startAfter(ultimo), limit(LOTE))
        : query(col, orderBy(documentId()), limit(LOTE)));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const docu of snap.docs) out.push({ id: docu.id, ...docu.data() });
    ultimo = snap.docs[snap.docs.length - 1];
    if (snap.size < LOTE) break;
  }
  return out;
}

function avancarMax(atual: string, iso?: string | null): string {
  if (!iso) return atual;
  return iso > atual ? iso : atual;
}

function maisNovo(local?: string | null, remoto?: string | null): "local" | "remoto" | "igual" {
  if (!remoto && !local) return "igual";
  if (!remoto) return "local";
  if (!local) return "remoto";
  if (remoto > local) return "remoto";
  if (local > remoto) return "local";
  return "igual";
}

export async function puxarRemoto(loja: string, onProg?: (p: ProgressoSync) => void): Promise<void> {
  onProg?.({ fase: "baixando", feito: 0, total: 8 });
  let cursor = await obterCursorSync();
  if (!cursor) {
    const locais = await listarVendas();
    let maxLocal = "";
    for (const v of locais) {
      if (v.atualizado_em && v.atualizado_em > maxLocal) maxLocal = v.atualizado_em;
    }
    if (maxLocal) {
      cursor = maxLocal;
      await gravarCursorSync(maxLocal);
    }
  }
  let maxEm = cursor || "";

  const mesclar = async (
    colecao: "vendas" | "produtos" | "entregas" | "encomendas" | "cobrancas" | "reabastecimentos",
  ) => {
    const rows = await puxarColecao(loja, colecao, cursor);
    for (const r of rows) {
      maxEm = avancarMax(maxEm, typeof r.atualizado_em === "string" ? r.atualizado_em : undefined);
      const id = String(r.id);
      if (colecao === "vendas") {
        const local = await obterVenda(id);
        if (!local || maisNovo(local.atualizado_em, r.atualizado_em as string) === "remoto") await upsertVenda(r as Venda, false);
      } else if (colecao === "produtos") {
        const local = await obterProduto(id);
        if (!local || maisNovo(local.atualizado_em, r.atualizado_em as string) === "remoto") await upsertProduto(r as Produto, false);
      } else if (colecao === "entregas") {
        const local = await obterEntrega(id);
        if (!local || maisNovo(local.atualizado_em, r.atualizado_em as string) === "remoto") await upsertEntrega(r as Entrega, false);
      } else if (colecao === "encomendas") {
        const local = await obterEncomenda(id);
        if (!local || maisNovo(local.atualizado_em, r.atualizado_em as string) === "remoto") await upsertEncomenda(r as Encomenda, false);
      } else if (colecao === "cobrancas") {
        const local = await obterCobranca(id);
        if (!local || maisNovo(local.atualizado_em, r.atualizado_em as string) === "remoto") await upsertCobranca(r as Cobranca, false);
      } else {
        const local = await obterReabastecimento(id);
        if (!local || maisNovo(local.atualizado_em, r.atualizado_em as string) === "remoto") await upsertReabastecimento(r as Reabastecimento, false);
      }
    }
  };

  await mesclar("vendas");
  onProg?.({ fase: "baixando", feito: 1, total: 8 });
  await mesclar("produtos");
  onProg?.({ fase: "baixando", feito: 2, total: 8 });
  await mesclar("entregas");
  onProg?.({ fase: "baixando", feito: 3, total: 8 });
  await mesclar("encomendas");
  onProg?.({ fase: "baixando", feito: 4, total: 8 });
  await mesclar("cobrancas");
  onProg?.({ fase: "baixando", feito: 5, total: 8 });
  await mesclar("reabastecimentos");
  const { db } = getFirebase();
  const cfgSnap = await getDoc(doc(db, "lojas", loja, "configuracao", "atual"));
  if (cfgSnap.exists()) {
    const remoto = cfgSnap.data();
    const local = await obterConfig();
    const eq = await estadoEquipeLocal();
    const forcarRemoto = eq && !eq.ehDono;
    if (forcarRemoto || maisNovo(local?.atualizado_em, remoto.atualizado_em) === "remoto" || !local) {
      await salvarConfig(remoto as never, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 6, total: 8 });

  const membrosR = await puxarColecao(loja, "membros");
  const vistos = new Set<string>();
  for (const r of membrosR) {
    const uid = String(r.uid || r.id);
    vistos.add(uid);
    await upsertMembro({
      uid,
      nome: String(r.nome ?? r.email ?? uid),
      papel: r.papel === "lider" ? "lider" : "membro",
      email: r.email ? String(r.email) : undefined,
      bloqueado: Boolean(r.bloqueado),
      ultimoAcesso: r.ultimoAcesso ?? null,
      criado_em: r.criado_em || agoraIso(),
    });
  }
  for (const local of await listarMembros()) {
    if (!vistos.has(local.uid)) await removerMembroLocal(local.uid);
  }
  onProg?.({ fase: "baixando", feito: 7, total: 8 });

  try {
    const atividadesR = await puxarColecao(loja, "atividades");
    for (const r of atividadesR) {
      await upsertAtividade({
        id: String(r.id),
        loja,
        uid: String(r.uid ?? ""),
        email: String(r.email ?? ""),
        acao: r.acao,
        colecao: String(r.colecao ?? ""),
        registroId: String(r.registroId ?? ""),
        resumo: String(r.resumo ?? ""),
        em: String(r.em ?? ""),
      } as Atividade, false);
    }
  } catch {
    // only the owner can read the activity log
  }
  onProg?.({ fase: "baixando", feito: 8, total: 8 });
  await gravarCursorSync(maxEm || new Date().toISOString());
}

export type RecusaEnvio = { colecao: string; id: string; motivo: string };

export async function enviarPendentes(loja: string, ehDono: boolean): Promise<{ enviados: number; recusados: RecusaEnvio[] }> {
  const { db, auth } = getFirebase();
  const pendentes = await listarPendentes();
  if (!pendentes.length) return { enviados: 0, recusados: [] };
  const cfg = await obterConfig();
  const uid = auth.currentUser?.uid ?? "";
  const nome = (auth.currentUser?.displayName || auth.currentUser?.email || "").trim();
  const cache = new Map<string, Map<string, unknown>>();
  const obter = async (colecao: string, id: string): Promise<unknown> => {
    if (colecao === "configuracao") return cfg;
    let m = cache.get(colecao);
    if (!m) { m = new Map(); cache.set(colecao, m); }
    if (!m.has(id)) m.set(id, await obterPendenteRegistro(colecao, id));
    return m.get(id);
  };

  const gravarUm = async (p: (typeof pendentes)[number]): Promise<"enviado" | "recusado" | "ignorado"> => {
    const batch = writeBatch(db);
    if (p.colecao === "configuracao") {
      if (!(ehDono && cfg)) return "ignorado";
      batch.set(doc(db, "lojas", loja, "configuracao", "atual"), semUndefined(cfg as unknown as Record<string, unknown>), { merge: true });
    } else {
      let data = await obter(p.colecao, p.id) as Record<string, unknown> | undefined;
      const ref = doc(db, "lojas", loja, p.colecao, p.id);
      if (data) {
        const corr = corrigirAutoriaLocalParaEnvio(data, uid, nome);
        if (corr.alterou) {
          data = corr.data;
          cache.get(p.colecao)?.set(p.id, data);
          await persistirAutoriaCorrigida(p.colecao, data);
        }
        if (!podeEnviarRegistro(data as { criadoPor?: string; atualizadoPor?: string }, ehDono)) {
          return "ignorado";
        }
      }
      if (p.acao === "delete" || data?.excluido) {
        batch.set(ref, semUndefined({ ...(data ?? { id: p.id }), excluido: true, atualizado_em: new Date().toISOString() }), { merge: true });
      } else if (data) {
        batch.set(ref, semUndefined(data), { merge: true });
      } else {
        return "ignorado";
      }
    }
    try {
      await batch.commit();
      await limparPendente(p.id);
      return "enviado";
    } catch (e) {
      if (isPermissionDenied(e)) {
        console.error("envio recusado", uid || "?", p.colecao, p.id, e);
        return "recusado";
      }
      throw e;
    }
  };

  let enviadosTotal = 0;
  const recusados: RecusaEnvio[] = [];

  for (let i = 0; i < pendentes.length; i += LOTE) {
    const fatia = pendentes.slice(i, i + LOTE);
    const batch = writeBatch(db);
    const enviados: typeof fatia = [];
    for (const p of fatia) {
      if (p.colecao === "configuracao") {
        if (ehDono && cfg) {
          batch.set(doc(db, "lojas", loja, "configuracao", "atual"), semUndefined(cfg as unknown as Record<string, unknown>), { merge: true });
          enviados.push(p);
        }
        continue;
      }
      let data = await obter(p.colecao, p.id) as Record<string, unknown> | undefined;
      const ref = doc(db, "lojas", loja, p.colecao, p.id);
      if (data) {
        const corr = corrigirAutoriaLocalParaEnvio(data, uid, nome);
        if (corr.alterou) {
          data = corr.data;
          cache.get(p.colecao)?.set(p.id, data);
          await persistirAutoriaCorrigida(p.colecao, data);
        }
        if (!podeEnviarRegistro(data as { criadoPor?: string; atualizadoPor?: string }, ehDono)) {
          continue;
        }
      }
      if (p.acao === "delete" || data?.excluido) {
        batch.set(ref, semUndefined({ ...(data ?? { id: p.id }), excluido: true, atualizado_em: new Date().toISOString() }), { merge: true });
        enviados.push(p);
      } else if (data) {
        batch.set(ref, semUndefined(data), { merge: true });
        enviados.push(p);
      }
    }
    if (!enviados.length) continue;
    try {
      await batch.commit();
      for (const p of enviados) await limparPendente(p.id);
      enviadosTotal += enviados.length;
    } catch (e) {
      const resumo = enviados.map((p) => `${p.colecao}/${p.id}`).join("; ");
      console.error("envio pendentes lote", uid || "?", resumo, e);
      if (!isPermissionDenied(e)) throw new Error(mensagemErroSync(e, "enviar as alterações"));
      // One denied item must not stall the rest of the queue.
      for (const p of enviados) {
        const r = await gravarUm(p);
        if (r === "enviado") enviadosTotal += 1;
        else if (r === "recusado") {
          recusados.push({
            colecao: p.colecao,
            id: p.id,
            motivo: mensagemErroSync(e, rotuloOperacao(p.colecao, p.id)),
          });
        }
      }
    }
  }
  return { enviados: enviadosTotal, recusados };
}

export async function sincronizar(
  loja: string,
  user: User,
  onProg?: (p: ProgressoSync) => void,
): Promise<EstadoEquipe & { retidosImportados: number; enviadosMerge: number }> {
  const estado = await garantirMembro(loja, user);
  const ehAdmin = Boolean(estado.ehDono || estado.ehLider);
  const resultado = await mesclarLocalNaNuvem(loja, ehAdmin, onProg);
  await enviarPendentes(loja, ehAdmin);
  await setMeta("ultimo_sync", new Date().toISOString());
  return { ...estado, retidosImportados: resultado.retidos, enviadosMerge: resultado.enviados };
}


export interface ResultadoMerge {
  enviados: number;
  retidos: number;
  jaFeito: boolean;
}

export async function precisaMesclarLocal(): Promise<boolean> {
  const feito = await getMeta<boolean>("nuvem_merge_feito");
  if (feito) return false;
  const precisa = await getMeta<boolean>("precisa_upload_inicial");
  if (precisa) return true;
  const vendas = await listarVendas();
  const produtos = await listarProdutos();
  return vendas.length + produtos.length > 0;
}

export async function mesclarLocalNaNuvem(
  loja: string,
  ehAdmin: boolean,
  onProg?: (p: ProgressoSync) => void,
): Promise<ResultadoMerge> {
  const precisa = await precisaMesclarLocal();
  if (!precisa) {
    await enviarPendentes(loja, ehAdmin);
    await puxarRemoto(loja, onProg);
    await enviarPendentes(loja, ehAdmin);
    return { enviados: 0, retidos: 0, jaFeito: true };
  }
  await puxarRemoto(loja, onProg);
  const estado = await estadoEquipeLocal();
  const admin = ehAdmin || Boolean(estado?.ehDono || estado?.ehLider);
  const vendas = await listarVendas();
  const produtos = await listarProdutos();
  const entregas = await listarEntregas();
  const encomendas = await listarEncomendas();
  const cobrancas = await listarCobrancas(10_000);
  const reab = await listarReabastecimentos();
  const cfg = await obterConfig();
  const itens: Array<{ path: string[]; data: DocumentData }> = [];
  let retidos = 0;
  const acum = <T extends { id: string; criadoPor?: string; atualizadoPor?: string }>(col: string, rows: T[]) => {
    for (const row of rows) {
      if (!podeEnviarRegistro(row, admin)) { retidos += 1; continue; }
      itens.push({ path: ["lojas", loja, col, row.id], data: row });
    }
  };
  if (cfg && admin) itens.push({ path: ["lojas", loja, "configuracao", "atual"], data: cfg });
  acum("vendas", vendas);
  acum("produtos", produtos);
  acum("entregas", entregas);
  acum("encomendas", encomendas);
  acum("cobrancas", cobrancas);
  acum("reabastecimentos", reab);
  const total = itens.length;
  onProg?.({ fase: "enviando", feito: 0, total });
  for (let i = 0; i < itens.length; i += LOTE) {
    await escreverLote(itens.slice(i, i + LOTE));
    onProg?.({ fase: "enviando", feito: Math.min(i + LOTE, total), total });
  }
  await setMeta("precisa_upload_inicial", false);
  await setMeta("nuvem_merge_feito", true);
  await setMeta("ultimo_sync", new Date().toISOString());
  return { enviados: total, retidos, jaFeito: false };
}

const COLECOES_VIVO = ["vendas", "produtos", "entregas", "encomendas", "cobrancas", "reabastecimentos"] as const;

export function ouvirLoja(
  loja: string,
  aoMudar: (mudanca?: MudancaNuvem) => void,
  onErro?: (e: Error) => void,
  cursor?: string,
): () => void {
  const { db } = getFirebase();
  const uns = COLECOES_VIVO.map((col) => {
    const base = collection(db, "lojas", loja, col);
    // Without a cursor, skip the full-collection snapshot (it would download the entire history).
    if (!cursor) return () => {};
    const q = query(base, where("atualizado_em", ">", cursor), orderBy("atualizado_em"));
    return onSnapshot(
      q,
      async (snap) => {
        const aplicados: Array<{ id: string; excluido?: boolean; atualizado_em?: string }> = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === "removed") continue;
          const r = { id: ch.doc.id, ...ch.doc.data() } as { id: string; atualizado_em: string; excluido?: boolean };
          let local: { atualizado_em: string } | undefined;
          if (col === "vendas") local = await obterVenda(r.id);
          else if (col === "produtos") local = await obterProduto(r.id);
          else if (col === "entregas") local = await obterEntrega(r.id);
          else if (col === "encomendas") local = await obterEncomenda(r.id);
          else if (col === "cobrancas") local = await obterCobranca(r.id);
          else if (col === "reabastecimentos") local = await obterReabastecimento(r.id);
          if (!local || maisNovo(local.atualizado_em, r.atualizado_em) === "remoto") {
            if (col === "vendas") await upsertVenda(r as Venda, false);
            else if (col === "produtos") await upsertProduto(r as Produto, false);
            else if (col === "entregas") await upsertEntrega(r as Entrega, false);
            else if (col === "encomendas") await upsertEncomenda(r as Encomenda, false);
            else if (col === "cobrancas") await upsertCobranca(r as Cobranca, false);
            else if (col === "reabastecimentos") await upsertReabastecimento(r as Reabastecimento, false);
            aplicados.push(r);
          }
        }
        if (aplicados.length) aoMudar({ colecao: col, registros: aplicados });
      },
      (e) => onErro?.(e instanceof Error ? e : new Error(mensagemErroSync(e))),
    );
  });
  const unCfg = onSnapshot(doc(db, "lojas", loja, "configuracao", "atual"), async (snap) => {
    if (!snap.exists()) return;
    const remoto = snap.data();
    const local = await obterConfig();
    const eq = await estadoEquipeLocal();
    const forcarRemoto = eq && !eq.ehDono && !eq.ehLider;
    if (forcarRemoto || maisNovo(local?.atualizado_em, remoto.atualizado_em) === "remoto" || !local) {
      await salvarConfig(remoto as never, false);
      aoMudar();
    }
  }, () => { /* config pode falhar se ainda não for membro */ });
  return () => { uns.forEach((u) => u()); unCfg(); };
}

void registroImportado;

void query;
void where;
void limit;
