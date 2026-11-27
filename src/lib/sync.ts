import type { NuvemUser } from "./supabase";
import { getSupabase } from "./supabase";
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
import {
  atividadeFromRow,
  atividadeToRow,
  cobrancaFromRow,
  cobrancaToRow,
  configFromRow,
  configToRow,
  encomendaFromRow,
  encomendaToRow,
  entregaFromRow,
  entregaToRow,
  membroFromRow,
  produtoFromRow,
  produtoToRow,
  reabastecimentoFromRow,
  reabastecimentoToRow,
  rowDe,
  vendaFromRow,
  vendaToRow,
  type ColecaoDados,
} from "./mapeamentoNuvem";
export { mensagemErroSync };

const LOTE = 200;
const TABELAS: ColecaoDados[] = ["vendas", "produtos", "entregas", "encomendas", "cobrancas", "reabastecimentos"];

async function cacheEstado(estado: EstadoEquipe): Promise<void> {
  await setMeta("equipe", estado);
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

async function persistirAutoriaCorrigida(colecao: string, row: Record<string, unknown>): Promise<void> {
  if (colecao === "vendas") await upsertVenda(row as unknown as Venda, false);
  else if (colecao === "produtos") await upsertProduto(row as unknown as Produto, false);
  else if (colecao === "entregas") await upsertEntrega(row as unknown as Entrega, false);
  else if (colecao === "encomendas") await upsertEncomenda(row as unknown as Encomenda, false);
  else if (colecao === "cobrancas") await upsertCobranca(row as unknown as Cobranca, false);
  else if (colecao === "reabastecimentos") await upsertReabastecimento(row as unknown as Reabastecimento, false);
}

async function aplicarRemoto(colecao: ColecaoDados, r: Record<string, unknown>, loja: string): Promise<void> {
  if (colecao === "vendas") await upsertVenda(vendaFromRow(r), false);
  else if (colecao === "produtos") {
    const barras = await barrasDeProduto(loja, String(r.id));
    await upsertProduto(produtoFromRow(r, barras), false);
  } else if (colecao === "entregas") await upsertEntrega(entregaFromRow(r), false);
  else if (colecao === "encomendas") await upsertEncomenda(encomendaFromRow(r), false);
  else if (colecao === "cobrancas") await upsertCobranca(cobrancaFromRow(r), false);
  else await upsertReabastecimento(reabastecimentoFromRow(r), false);
}

async function obterLocal(colecao: ColecaoDados, id: string): Promise<{ atualizado_em: string } | undefined> {
  if (colecao === "vendas") return obterVenda(id);
  if (colecao === "produtos") return obterProduto(id);
  if (colecao === "entregas") return obterEntrega(id);
  if (colecao === "encomendas") return obterEncomenda(id);
  if (colecao === "cobrancas") return obterCobranca(id);
  return obterReabastecimento(id);
}

async function barrasDeProduto(loja: string, produtoId: string): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("codigos_barras")
    .select("codigo")
    .eq("loja_id", loja)
    .eq("produto_id", produtoId);
  if (error) return [];
  return (data ?? []).map((r) => String((r as { codigo: string }).codigo)).filter(Boolean);
}

async function gravarBarras(loja: string, produto: Produto): Promise<void> {
  const sb = getSupabase();
  const lista = (produto.codigos_barras ?? []).map((c) => String(c).trim()).filter(Boolean);
  await sb.from("codigos_barras").delete().eq("loja_id", loja).eq("produto_id", produto.id);
  if (!lista.length) return;
  const { error } = await sb.from("codigos_barras").upsert(
    lista.map((codigo) => ({ loja_id: loja, produto_id: produto.id, codigo })),
    { onConflict: "loja_id,codigo" },
  );
  if (error) throw error;
}

async function upsertLinhas(tabela: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  if (!rows.length) return;
  const sb = getSupabase();
  for (let i = 0; i < rows.length; i += LOTE) {
    const fatia = rows.slice(i, i + LOTE);
    const { error } = await sb.from(tabela).upsert(fatia, { onConflict });
    if (!error) continue;
    // A single rejected row used to fail the whole batch (and block new sales).
    if (fatia.length === 1) throw error;
    for (const row of fatia) {
      const { error: um } = await sb.from(tabela).upsert(row, { onConflict });
      if (um) throw um;
    }
  }
}

async function barrasDeLoja(loja: string): Promise<Map<string, string[]>> {
  const sb = getSupabase();
  const mapa = new Map<string, string[]>();
  const { data, error } = await sb.from("codigos_barras").select("produto_id, codigo").eq("loja_id", loja);
  if (error) return mapa;
  for (const r of data ?? []) {
    const id = String((r as { produto_id: string }).produto_id);
    const codigo = String((r as { codigo: string }).codigo);
    const arr = mapa.get(id) ?? [];
    arr.push(codigo);
    mapa.set(id, arr);
  }
  return mapa;
}

export async function garantirMembro(loja: string, user: NuvemUser): Promise<EstadoEquipe> {
  const sb = getSupabase();
  const participacao = await verificarParticipacao(user.uid);
  if (participacao === "ausente") throw new NaoEMembroError();
  if (participacao === "bloqueado") {
    const estado: EstadoEquipe = { ehDono: false, ehLider: false, bloqueado: true, liderUid: "", meuNome: "" };
    await cacheEstado(estado);
    throw new Error("Este aparelho foi bloqueado. Fale com o Admin.");
  }
  const { data: lojaRow, error: lojaErr } = await sb.from("lojas").select("id, lider_uid").eq("id", loja).maybeSingle();
  if (lojaErr) {
    if (isPermissionDenied(lojaErr)) throw new NaoEMembroError();
    throw new Error(lojaErr.message);
  }
  if (!lojaRow) throw new NaoEMembroError("A loja ainda não existe na nuvem. Entre com o seu nome na tela de entrada.");
  const liderUid = String((lojaRow as { lider_uid?: string }).lider_uid ?? "");
  const { data: membroRow, error: memErr } = await sb
    .from("membros")
    .select("*")
    .eq("loja_id", loja)
    .eq("uid", user.uid)
    .maybeSingle();
  if (memErr) {
    if (isPermissionDenied(memErr)) throw new NaoEMembroError();
    throw new Error(memErr.message);
  }
  if (!membroRow) throw new NaoEMembroError();
  const atual = membroFromRow(membroRow as Record<string, unknown>);
  if (atual.bloqueado) {
    const estado: EstadoEquipe = { ehDono: false, ehLider: false, bloqueado: true, liderUid, meuNome: atual.nome ?? "" };
    await cacheEstado(estado);
    throw new Error("Este aparelho foi bloqueado. Fale com o Admin.");
  }
  const agora = agoraIso();
  await sb.from("membros").update({ ultimo_acesso: agora }).eq("loja_id", loja).eq("uid", user.uid);
  await upsertMembro({ ...atual, ultimoAcesso: agora, nome: atual.nome ?? "", papel: atual.papel ?? (liderUid === user.uid ? "lider" : "membro") });
  const ehLider = liderUid === user.uid;
  const estado: EstadoEquipe = { ehDono: ehLider, ehLider, bloqueado: false, liderUid, meuNome: atual.nome ?? "" };
  await cacheEstado(estado);
  return estado;
}

export async function estadoEquipeLocal(): Promise<EstadoEquipe | undefined> {
  return getMeta<EstadoEquipe>("equipe");
}

export async function bloquearMembro(loja: string, uid: string, bloqueado: boolean): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("membros").update({ bloqueado }).eq("loja_id", loja).eq("uid", uid);
  if (error) throw new Error(error.message);
  const locais = await listarMembros();
  const atual = locais.find((m) => m.uid === uid);
  if (atual) await upsertMembro({ ...atual, bloqueado });
}

export async function removerMembro(loja: string, uid: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("membros").delete().eq("loja_id", loja).eq("uid", uid);
  if (error) throw new Error(error.message);
  await removerMembroLocal(uid);
}

async function puxarColecao(loja: string, colecao: string, desde?: string): Promise<Record<string, unknown>[]> {
  const sb = getSupabase();
  const out: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    let q = sb.from(colecao).select("*").eq("loja_id", loja).range(from, from + LOTE - 1);
    if (desde && colecao !== "membros" && colecao !== "atividades") {
      q = q.gt("atualizado_em", desde).order("atualizado_em", { ascending: true });
    } else if (colecao === "atividades") {
      q = q.order("em", { ascending: true });
    } else if (colecao === "membros") {
      q = q.order("uid", { ascending: true });
    } else if (colecao === "codigos_barras") {
      q = q.order("codigo", { ascending: true });
    } else {
      q = q.order("id", { ascending: true });
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < LOTE) break;
    from += LOTE;
  }
  return out;
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
  const barras = await barrasDeLoja(loja);

  const mesclar = async (colecao: ColecaoDados) => {
    const rows = await puxarColecao(loja, colecao, cursor);
    for (const r of rows) {
      maxEm = avancarMax(maxEm, typeof r.atualizado_em === "string" ? r.atualizado_em : undefined);
      const id = String(r.id);
      const local = await obterLocal(colecao, id);
      const em = typeof r.atualizado_em === "string" ? r.atualizado_em : undefined;
      if (!local || maisNovo(local.atualizado_em, em) === "remoto") {
        if (colecao === "produtos") await upsertProduto(produtoFromRow(r, barras.get(id)), false);
        else await aplicarRemoto(colecao, r, loja);
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
  const sb = getSupabase();
  const { data: cfgSnap } = await sb.from("configuracao").select("*").eq("loja_id", loja).maybeSingle();
  if (cfgSnap) {
    const remoto = configFromRow(cfgSnap as Record<string, unknown>);
    const local = await obterConfig();
    const eq = await estadoEquipeLocal();
    const forcarRemoto = eq && !eq.ehDono;
    if (forcarRemoto || maisNovo(local?.atualizado_em, remoto.atualizado_em) === "remoto" || !local) {
      await salvarConfig(remoto, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 6, total: 8 });

  const membrosR = await puxarColecao(loja, "membros");
  const vistos = new Set<string>();
  for (const r of membrosR) {
    const m = membroFromRow(r);
    vistos.add(m.uid);
    await upsertMembro(m);
  }
  for (const local of await listarMembros()) {
    if (!vistos.has(local.uid)) await removerMembroLocal(local.uid);
  }
  onProg?.({ fase: "baixando", feito: 7, total: 8 });

  try {
    const atividadesR = await puxarColecao(loja, "atividades");
    for (const r of atividadesR) {
      await upsertAtividade(atividadeFromRow(r, loja), false);
    }
  } catch {
    // only the owner can read the activity log
  }
  onProg?.({ fase: "baixando", feito: 8, total: 8 });
  await gravarCursorSync(maxEm || new Date().toISOString());
}

async function enviarLinha(loja: string, colecao: string, data: Record<string, unknown> | undefined, acao?: string): Promise<void> {
  if (colecao === "configuracao") {
    if (!data) return;
    await upsertLinhas("configuracao", [configToRow(data as unknown as import("./types").ConfiguracaoLoja, loja)], "loja_id");
    return;
  }
  const payload = data
    ? (acao === "delete" || data.excluido
      ? rowDe(colecao, { ...data, excluido: true, atualizado_em: new Date().toISOString() }, loja)
      : rowDe(colecao, data, loja))
    : rowDe(colecao, { id: "", excluido: true, atualizado_em: new Date().toISOString() } as unknown as Record<string, unknown>, loja);
  await upsertLinhas(colecao, [payload], "loja_id,id");
  if (colecao === "produtos" && data) {
    await gravarBarras(loja, data as unknown as Produto);
  }
}

export type RecusaEnvio = { colecao: string; id: string; motivo: string };

export async function enviarPendentes(loja: string, ehDono: boolean): Promise<{ enviados: number; recusados: RecusaEnvio[] }> {
  const sb = getSupabase();
  const pendentes = await listarPendentes();
  if (!pendentes.length) return { enviados: 0, recusados: [] };
  const cfg = await obterConfig();
  const { data: sess } = await sb.auth.getUser();
  const uid = sess.user?.id ?? "";
  const nome = String((sess.user?.user_metadata as { display_name?: string } | undefined)?.display_name || sess.user?.email || "").trim();
  const cache = new Map<string, Map<string, unknown>>();
  const obter = async (colecao: string, id: string): Promise<unknown> => {
    if (colecao === "configuracao") return cfg;
    let m = cache.get(colecao);
    if (!m) { m = new Map(); cache.set(colecao, m); }
    if (!m.has(id)) m.set(id, await obterPendenteRegistro(colecao, id));
    return m.get(id);
  };

  const gravarUm = async (p: (typeof pendentes)[number]): Promise<"enviado" | "recusado" | "ignorado"> => {
    try {
      if (p.colecao === "configuracao") {
        if (!cfg) return "ignorado";
        await enviarLinha(loja, "configuracao", cfg as unknown as Record<string, unknown>);
        await limparPendente(p.id);
        return "enviado";
      }
      let data = await obter(p.colecao, p.id) as Record<string, unknown> | undefined;
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
        await enviarLinha(loja, p.colecao, { ...(data ?? { id: p.id }), excluido: true } as Record<string, unknown>, "delete");
      } else if (data) {
        await enviarLinha(loja, p.colecao, data);
      } else {
        return "ignorado";
      }
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
  const lote: typeof pendentes = [];
  const loteRows: Array<{ colecao: string; row: Record<string, unknown> }> = [];

  for (const p of pendentes) {
    if (p.colecao === "configuracao") {
      if (cfg) {
        lote.push(p);
        loteRows.push({ colecao: "configuracao", row: configToRow(cfg, loja) });
      }
      continue;
    }
    let data = await obter(p.colecao, p.id) as Record<string, unknown> | undefined;
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
      lote.push(p);
      loteRows.push({ colecao: p.colecao, row: rowDe(p.colecao, { ...(data ?? { id: p.id }), excluido: true, atualizado_em: new Date().toISOString() }, loja) });
    } else if (data) {
      lote.push(p);
      loteRows.push({ colecao: p.colecao, row: rowDe(p.colecao, data, loja) });
    }
  }

  const porTabela = new Map<string, { pend: typeof pendentes; rows: Record<string, unknown>[] }>();
  for (let i = 0; i < lote.length; i++) {
    const col = loteRows[i].colecao;
    let g = porTabela.get(col);
    if (!g) { g = { pend: [], rows: [] }; porTabela.set(col, g); }
    g.pend.push(lote[i]);
    g.rows.push(loteRows[i].row);
  }

  for (const [col, g] of porTabela) {
    try {
      const conflict = col === "configuracao" ? "loja_id" : "loja_id,id";
      await upsertLinhas(col, g.rows, conflict);
      if (col === "produtos") {
        for (const p of g.pend) {
          const data = await obter(p.colecao, p.id) as Produto | undefined;
          if (data) await gravarBarras(loja, data);
        }
      }
      for (const p of g.pend) await limparPendente(p.id);
      enviadosTotal += g.pend.length;
    } catch (e) {
      const resumo = g.pend.map((p) => `${p.colecao}/${p.id}`).join("; ");
      console.error("envio pendentes lote", uid || "?", resumo, e);
      if (!isPermissionDenied(e)) throw new Error(mensagemErroSync(e, "enviar as alterações"));
      for (const p of g.pend) {
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
  user: NuvemUser,
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
  const porCol = new Map<string, Record<string, unknown>[]>();
  let retidos = 0;
  const acum = <T extends { id: string; criadoPor?: string; atualizadoPor?: string }>(col: string, rows: T[]) => {
    for (const row of rows) {
      if (!podeEnviarRegistro(row, admin)) { retidos += 1; continue; }
      const arr = porCol.get(col) ?? [];
      arr.push(rowDe(col, row as unknown as Record<string, unknown>, loja));
      porCol.set(col, arr);
    }
  };
  if (cfg) porCol.set("configuracao", [configToRow(cfg, loja)]);
  acum("vendas", vendas);
  acum("produtos", produtos);
  acum("entregas", entregas);
  acum("encomendas", encomendas);
  acum("cobrancas", cobrancas);
  acum("reabastecimentos", reab);
  const total = [...porCol.values()].reduce((a, r) => a + r.length, 0);
  onProg?.({ fase: "enviando", feito: 0, total });
  let feito = 0;
  for (const [col, rows] of porCol) {
    const conflict = col === "configuracao" ? "loja_id" : "loja_id,id";
    await upsertLinhas(col, rows, conflict);
    if (col === "produtos") {
      for (const p of produtos) {
        if (podeEnviarRegistro(p, admin)) await gravarBarras(loja, p);
      }
    }
    feito += rows.length;
    onProg?.({ fase: "enviando", feito, total });
  }
  await setMeta("precisa_upload_inicial", false);
  await setMeta("nuvem_merge_feito", true);
  await setMeta("ultimo_sync", new Date().toISOString());
  return { enviados: total, retidos, jaFeito: false };
}

export async function uploadInicial(
  loja: string,
  user: NuvemUser,
  onProg?: (p: ProgressoSync) => void,
): Promise<void> {
  const estado = await estadoEquipeLocal();
  const ehAdmin = Boolean(estado?.ehDono || estado?.ehLider);
  await mesclarLocalNaNuvem(loja, ehAdmin, onProg);
  void user;
}

function registroLocalDe(colecao: ColecaoDados, rec: Record<string, unknown>, loja: string): Record<string, unknown> {
  if (colecao === "vendas") return vendaFromRow(rec) as unknown as Record<string, unknown>;
  if (colecao === "produtos") return produtoFromRow(rec) as unknown as Record<string, unknown>;
  if (colecao === "entregas") return entregaFromRow(rec) as unknown as Record<string, unknown>;
  if (colecao === "encomendas") return encomendaFromRow(rec) as unknown as Record<string, unknown>;
  if (colecao === "cobrancas") return cobrancaFromRow(rec) as unknown as Record<string, unknown>;
  return reabastecimentoFromRow(rec) as unknown as Record<string, unknown>;
}

export type OuvirLoja = {
  parar: () => void;
  religar: () => void;
};

export function ouvirLoja(
  loja: string,
  aoMudar: (mudanca?: MudancaNuvem) => void,
  onErro?: (e: Error) => void,
  onStatus?: (inscrito: boolean) => void,
): OuvirLoja {
  const sb = getSupabase();
  const canais: ReturnType<typeof sb.channel>[] = [];
  let morto = false;
  let geracao = 0;
  let religarTimer: ReturnType<typeof setTimeout> | undefined;
  const inscritos = new Set<string>();
  const total = TABELAS.length + 1;

  const processar = (col: ColecaoDados, payload: { eventType?: string; new?: unknown; old?: unknown }) => {
    void (async () => {
      try {
        const rec = ((payload.new ?? payload.old ?? {}) as Record<string, unknown>);
        if (!rec || !rec.id) return;
        const emRaw = rec.atualizado_em;
        const em = typeof emRaw === "string" ? emRaw : (emRaw ? new Date(emRaw as string).toISOString() : undefined);
        const local = await obterLocal(col, String(rec.id));
        if (!local || maisNovo(local.atualizado_em, em) === "remoto" || payload.eventType === "DELETE") {
          if (payload.eventType === "DELETE") {
            const marked = { ...rec, excluido: true, atualizado_em: em || new Date().toISOString() };
            await aplicarRemoto(col, marked, loja);
            aoMudar({ colecao: col, registros: [registroLocalDe(col, marked, loja) as { id: string; excluido?: boolean; atualizado_em?: string }] });
          } else {
            await aplicarRemoto(col, rec, loja);
            aoMudar({ colecao: col, registros: [registroLocalDe(col, rec, loja) as { id: string; excluido?: boolean; atualizado_em?: string }] });
          }
        }
      } catch (e) {
        onErro?.(e instanceof Error ? e : new Error(mensagemErroSync(e)));
      }
    })();
  };

  const limparCanais = () => {
    for (const c of canais) void sb.removeChannel(c);
    canais.length = 0;
    inscritos.clear();
  };

  const ligar = () => {
    if (morto) return;
    if (religarTimer) { clearTimeout(religarTimer); religarTimer = undefined; }
    geracao += 1;
    const g = geracao;
    limparCanais();
    onStatus?.(false);

    const aoStatus = (topic: string, status: string) => {
      if (morto || g !== geracao) return;
      if (status === "SUBSCRIBED") {
        inscritos.add(topic);
        if (inscritos.size >= total) onStatus?.(true);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        inscritos.delete(topic);
        onStatus?.(false);
        if (status === "CHANNEL_ERROR") {
          onErro?.(new Error(mensagemErroSync(new Error("canal"), "ouvir as alterações da loja")));
        }
        if (!religarTimer) {
          religarTimer = setTimeout(() => { religarTimer = undefined; ligar(); }, 2000);
        }
      }
    };

    for (const col of TABELAS) {
      const topic = `loja:${loja}:${col}:${g}`;
      const ch = sb
        .channel(topic)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: col, filter: `loja_id=eq.${loja}` },
          (payload) => processar(col, payload),
        )
        .subscribe((status) => aoStatus(topic, status));
      canais.push(ch);
    }
    const topicCfg = `loja:${loja}:configuracao:${g}`;
    const canalCfg = sb
      .channel(topicCfg)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "configuracao", filter: `loja_id=eq.${loja}` },
        (payload) => {
          void (async () => {
            const rec = payload.new as Record<string, unknown> | null;
            if (!rec) return;
            const remoto = configFromRow(rec);
            const local = await obterConfig();
            const eq = await estadoEquipeLocal();
            const forcarRemoto = eq && !eq.ehDono && !eq.ehLider;
            if (forcarRemoto || maisNovo(local?.atualizado_em, remoto.atualizado_em) === "remoto" || !local) {
              await salvarConfig(remoto, false);
              aoMudar();
            }
          })();
        },
      )
      .subscribe((status) => aoStatus(topicCfg, status));
    canais.push(canalCfg);
  };

  ligar();
  return {
    parar: () => {
      morto = true;
      if (religarTimer) clearTimeout(religarTimer);
      limparCanais();
      onStatus?.(false);
    },
    religar: () => ligar(),
  };
}

void registroImportado;
void listarAtividades;
