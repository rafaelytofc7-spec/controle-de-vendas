import { getSupabase, userDe, type NuvemUser } from "./supabase";
import { LOJA_NUVEM_ID } from "./supabasePadrao";
import { agoraIso } from "./datas";
import { setMeta, upsertMembro } from "./db";
import type { EstadoEquipe, MembroLoja } from "./types";
import { membroFromRow } from "./mapeamentoNuvem";
import { isPermissionDenied } from "./errosSync";

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

function msgRpc(e: { message?: string } | null | undefined, fallback: string): string {
  const m = (e?.message || "").trim();
  if (!m) return fallback;
  // PostgREST wraps: "Esse texto"
  return m.replace(/^.*error:\s*/i, "").replace(/\s+\(SQLSTATE.*$/i, "") || fallback;
}

async function garantirAuth(): Promise<NuvemUser> {
  const sb = getSupabase();
  const { data: atual } = await sb.auth.getUser();
  if (atual.user) {
    const u = userDe(atual.user);
    if (u) return u;
  }
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.user) {
    const m = error?.message || "";
    if (/anonymous/i.test(m) && /disabled|not enabled|not been/i.test(m)) {
      throw new Error("O login anônimo ainda não foi ligado neste projeto. Abra Authentication > Providers no painel do Supabase e ative Anonymous.");
    }
    throw new Error(m || "Não foi possível entrar na nuvem.");
  }
  const u = userDe(data.user);
  if (!u) throw new Error("Não foi possível entrar na nuvem.");
  return u;
}

async function gravarNomeAuth(nome: string): Promise<void> {
  const sb = getSupabase();
  try { await sb.auth.updateUser({ data: { display_name: nome } }); } catch { /* ignore */ }
}

async function cacheEquipe(estado: EstadoEquipe, membro: MembroLoja, codigo?: string): Promise<EstadoEquipe> {
  await upsertMembro(membro);
  await setMeta("equipe", estado);
  await setMeta("meu_nome", membro.nome);
  if (codigo) await setMeta("codigo_recuperacao", codigo);
  return estado;
}

export class NaoEMembroError extends Error {
  constructor(message = "Este aparelho não está reconhecido na loja da nuvem. Entre de novo com o mesmo nome.") {
    super(message);
    this.name = "NaoEMembroError";
  }
}

export function isNaoEMembroError(e: unknown): boolean {
  return e instanceof NaoEMembroError || (e instanceof Error && e.name === "NaoEMembroError");
}

export async function verificarParticipacao(uid: string): Promise<"membro" | "ausente" | "bloqueado"> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("membros")
    .select("uid, bloqueado")
    .eq("loja_id", LOJA_NUVEM_ID)
    .eq("uid", uid)
    .maybeSingle();
  if (error) {
    if (isPermissionDenied(error)) return "ausente";
    throw new Error(error.message);
  }
  if (!data) return "ausente";
  if ((data as { bloqueado?: boolean }).bloqueado) return "bloqueado";
  return "membro";
}

function estadoDeRpc(row: Record<string, unknown>, nome: string, uid: string): EstadoEquipe {
  const liderUid = String(row.liderUid ?? row.lider_uid ?? "");
  const ehLider = Boolean(row.ehLider ?? row.eh_lider ?? (liderUid && liderUid === uid));
  return {
    ehDono: ehLider,
    ehLider,
    bloqueado: Boolean(row.bloqueado),
    liderUid,
    meuNome: String(row.meuNome ?? row.meu_nome ?? nome),
  };
}

export async function entrarComNome(nomeBruto: string): Promise<EstadoEquipe & { codigoRecuperacao?: string; primeiraVez: boolean }> {
  const nome = nomeBruto.trim();
  if (!nomeValido(nome)) throw new Error("Informe um nome de 2 a 40 letras.");
  const user = await garantirAuth();
  await gravarNomeAuth(nome);
  const sb = getSupabase();
  const { data, error } = await sb.rpc("entrar_na_loja", { p_nome: nome, p_loja: LOJA_NUVEM_ID });
  if (error) throw new Error(msgRpc(error, "Não foi possível entrar na loja."));
  const row = (data ?? {}) as Record<string, unknown>;
  const estado = estadoDeRpc(row, nome, user.uid);
  const agora = agoraIso();
  const membro: MembroLoja = {
    uid: user.uid,
    nome,
    papel: estado.ehLider ? "lider" : "membro",
    bloqueado: false,
    ultimoAcesso: agora,
    criado_em: agora,
  };
  const codigo = typeof row.codigoRecuperacao === "string" ? row.codigoRecuperacao : undefined;
  await cacheEquipe(estado, membro, codigo);
  return { ...estado, codigoRecuperacao: codigo, primeiraVez: Boolean(row.primeiraVez) };
}

export async function recuperarLideranca(nomeBruto: string, codigoBruto: string): Promise<EstadoEquipe> {
  const nome = nomeBruto.trim();
  const codigo = codigoBruto.trim().toUpperCase();
  if (!nomeValido(nome)) throw new Error("Informe um nome de 2 a 40 letras.");
  if (!/^[A-Z0-9]{8}$/.test(codigo)) throw new Error("O código de recuperação tem 8 letras ou números.");
  const user = await garantirAuth();
  await gravarNomeAuth(nome);
  const sb = getSupabase();
  const { data, error } = await sb.rpc("recuperar_lideranca", { p_nome: nome, p_codigo: codigo, p_loja: LOJA_NUVEM_ID });
  if (error) throw new Error(msgRpc(error, "Código de recuperação incorreto, ou a loja ainda não existe na nuvem."));
  const row = (data ?? {}) as Record<string, unknown>;
  const estado = estadoDeRpc({ ...row, ehLider: true, liderUid: user.uid }, nome, user.uid);
  const agora = agoraIso();
  await cacheEquipe(estado, {
    uid: user.uid, nome, papel: "lider", bloqueado: false, ultimoAcesso: agora, criado_em: agora,
  }, codigo);
  return estado;
}

export async function alterarPin(_pinNovo: string, _codigoAtual?: string): Promise<string> {
  void _pinNovo; void _codigoAtual;
  throw new Error("O PIN não é mais usado. Use o código de recuperação se precisar do papel de Admin.");
}

export async function renovarCodigoRecuperacao(): Promise<string> {
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getUser();
  if (!sess.user) throw new Error("Entre na loja primeiro.");
  const { data, error } = await sb.rpc("renovar_codigo_recuperacao", { p_loja: LOJA_NUVEM_ID });
  if (error) throw new Error(msgRpc(error, "Só o Admin renova o código de recuperação."));
  const novo = String(data ?? "");
  if (!/^[A-Z0-9]{8}$/.test(novo)) throw new Error("Não foi possível renovar o código.");
  await setMeta("codigo_recuperacao", novo);
  return novo;
}

export async function transferirLideranca(novoLiderUid: string): Promise<void> {
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getUser();
  if (!sess.user) throw new Error("Entre na loja primeiro.");
  if (novoLiderUid === sess.user.id) return;
  const { error } = await sb.rpc("transferir_lideranca", { p_novo_uid: novoLiderUid, p_loja: LOJA_NUVEM_ID });
  if (error) throw new Error(msgRpc(error, "Não foi possível transferir o papel de Admin."));
}

export async function alterarNomeMembro(uid: string, nomeBruto: string): Promise<void> {
  const nome = nomeBruto.trim();
  if (!nomeValido(nome)) throw new Error("Informe um nome de 2 a 40 letras.");
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getUser();
  if (!sess.user) throw new Error("Entre na loja primeiro.");
  const { data, error } = await sb
    .from("membros")
    .update({ nome })
    .eq("loja_id", LOJA_NUVEM_ID)
    .eq("uid", uid)
    .select()
    .maybeSingle();
  if (error) throw new Error(msgRpc(error, "Não foi possível alterar o nome."));
  if (!data) throw new Error("Essa pessoa não está na equipe.");
  await upsertMembro(membroFromRow(data as Record<string, unknown>));
}

/** Nome padrão do aparelho, ex.: "Caixa SM-A305GT". Editável depois em Ajustes. */
export function nomePadraoAparelho(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const m = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/i);
  const modelo = (m?.[1] || "").replace(/\bwv\b/i, "").trim();
  const nome = modelo && !/^linux|^u$|^k$/i.test(modelo) ? `Caixa ${modelo}` : "Caixa";
  return nome.slice(0, 40);
}
