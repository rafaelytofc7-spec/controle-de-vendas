import { deleteDB, openDB, type IDBPDatabase } from "idb";
import { PREFS_NOTIFICACAO_PADRAO } from "./types";
import type {
  Atividade,
  Cobranca,
  ConfiguracaoLoja,
  Encomenda,
  Entrega,
  FirebaseWebConfig,
  MembroLoja,
  Produto,
  Reabastecimento,
  Venda,
} from "./types";
import type { DadosNormalizados } from "./importacao";
import { agoraIso } from "./datas";

const DB_NAME = "controle-de-vendas";
const DB_VERSION = 2;

export interface MetaSync {
  chave: string;
  valor: unknown;
}

export interface PendenteSync {
  colecao: string;
  id: string;
  acao: "upsert" | "delete";
  em: string;
}

type Schema = {
  vendas: { key: string; value: Venda; indexes: { "por-criado": string } };
  produtos: { key: string; value: Produto; indexes: { "por-ordem": number } };
  entregas: { key: string; value: Entrega; indexes: { "por-criado": string } };
  encomendas: { key: string; value: Encomenda; indexes: { "por-criado": string } };
  cobrancas: { key: string; value: Cobranca; indexes: { "por-criado": string } };
  reabastecimentos: { key: string; value: Reabastecimento; indexes: { "por-criado": string } };
  configuracao: { key: string; value: ConfiguracaoLoja };
  meta: { key: string; value: { chave: string; valor: unknown } };
  pendentes: { key: string; value: PendenteSync };
  membros: { key: string; value: MembroLoja };
  atividades: { key: string; value: Atividade; indexes: { "por-em": string } };
};

let _db: IDBPDatabase<Schema> | null = null;

export async function db(): Promise<IDBPDatabase<Schema>> {
  if (_db) return _db;
  _db = await openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("vendas")) {
        const s = database.createObjectStore("vendas", { keyPath: "id" });
        s.createIndex("por-criado", "criado_em");
      }
      if (!database.objectStoreNames.contains("produtos")) {
        const s = database.createObjectStore("produtos", { keyPath: "id" });
        s.createIndex("por-ordem", "ordem");
      }
      if (!database.objectStoreNames.contains("entregas")) {
        const s = database.createObjectStore("entregas", { keyPath: "id" });
        s.createIndex("por-criado", "criado_em");
      }
      if (!database.objectStoreNames.contains("encomendas")) {
        const s = database.createObjectStore("encomendas", { keyPath: "id" });
        s.createIndex("por-criado", "criado_em");
      }
      if (!database.objectStoreNames.contains("cobrancas")) {
        const s = database.createObjectStore("cobrancas", { keyPath: "id" });
        s.createIndex("por-criado", "criado_em");
      }
      if (!database.objectStoreNames.contains("reabastecimentos")) {
        const s = database.createObjectStore("reabastecimentos", { keyPath: "id" });
        s.createIndex("por-criado", "criado_em");
      }
      if (!database.objectStoreNames.contains("configuracao")) {
        database.createObjectStore("configuracao", { keyPath: "loja" });
      }
      if (!database.objectStoreNames.contains("meta")) {
        database.createObjectStore("meta", { keyPath: "chave" });
      }
      if (!database.objectStoreNames.contains("pendentes")) {
        database.createObjectStore("pendentes", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("membros")) {
        database.createObjectStore("membros", { keyPath: "uid" });
      }
      if (!database.objectStoreNames.contains("atividades")) {
        const s = database.createObjectStore("atividades", { keyPath: "id" });
        s.createIndex("por-em", "em");
      }
    },
  });
  return _db;
}

export async function resetarBanco(): Promise<void> {
  if (_db) {
    _db.close();
    _db = null;
  }
  await deleteDB(DB_NAME);
}

async function marcarPendente(colecao: string, id: string, acao: "upsert" | "delete") {
  const d = await db();
  await d.put("pendentes", { colecao, id, acao, em: agoraIso() });
}

export async function listarVendas(): Promise<Venda[]> {
  const d = await db();
  const all = await d.getAll("vendas");
  return all.filter((v) => !v.excluido).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

export async function listarProdutos(): Promise<Produto[]> {
  const d = await db();
  const all = await d.getAll("produtos");
  return all.filter((p) => !p.excluido).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function listarEntregas(): Promise<Entrega[]> {
  const d = await db();
  return (await d.getAll("entregas")).filter((e) => !e.excluido).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

export async function listarEncomendas(): Promise<Encomenda[]> {
  const d = await db();
  return (await d.getAll("encomendas")).filter((e) => !e.excluido).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

export async function listarCobrancas(limite = 20): Promise<Cobranca[]> {
  const d = await db();
  return (await d.getAll("cobrancas"))
    .filter((c) => !c.excluido)
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, limite);
}

export async function listarReabastecimentos(): Promise<Reabastecimento[]> {
  const d = await db();
  return (await d.getAll("reabastecimentos"))
    .filter((r) => !r.excluido)
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

export function completarConfig(cfg: ConfiguracaoLoja): ConfiguracaoLoja {
  return {
    ...cfg,
    hora_lembrete_padrao: cfg.hora_lembrete_padrao || "12:00",
    notificacoes_padrao: { ...PREFS_NOTIFICACAO_PADRAO, ...(cfg.notificacoes_padrao ?? {}) },
  };
}

export async function obterConfig(): Promise<ConfiguracaoLoja | undefined> {
  const d = await db();
  const all = await d.getAll("configuracao");
  const cfg = all[0];
  return cfg ? completarConfig(cfg) : undefined;
}

export async function salvarConfig(cfg: ConfiguracaoLoja, sync = true): Promise<void> {
  const d = await db();
  const row = { ...cfg, atualizado_em: agoraIso() };
  await d.put("configuracao", row);
  if (sync) await marcarPendente("configuracao", row.loja, "upsert");
}

export async function upsertVenda(v: Venda, sync = true): Promise<void> {
  const d = await db();
  await d.put("vendas", { ...v, atualizado_em: v.atualizado_em || agoraIso() });
  if (sync) await marcarPendente("vendas", v.id, v.excluido ? "delete" : "upsert");
}

export async function upsertProduto(p: Produto, sync = true): Promise<void> {
  const d = await db();
  await d.put("produtos", { ...p, atualizado_em: p.atualizado_em || agoraIso() });
  if (sync) await marcarPendente("produtos", p.id, p.excluido ? "delete" : "upsert");
}

export async function upsertEntrega(e: Entrega, sync = true): Promise<void> {
  const d = await db();
  await d.put("entregas", { ...e, atualizado_em: e.atualizado_em || agoraIso() });
  if (sync) await marcarPendente("entregas", e.id, e.excluido ? "delete" : "upsert");
}

export async function upsertEncomenda(e: Encomenda, sync = true): Promise<void> {
  const d = await db();
  await d.put("encomendas", { ...e, atualizado_em: e.atualizado_em || agoraIso() });
  if (sync) await marcarPendente("encomendas", e.id, e.excluido ? "delete" : "upsert");
}

export async function upsertCobranca(c: Cobranca, sync = true): Promise<void> {
  const d = await db();
  await d.put("cobrancas", { ...c, atualizado_em: c.atualizado_em || agoraIso() });
  if (sync) await marcarPendente("cobrancas", c.id, c.excluido ? "delete" : "upsert");
}

export async function upsertReabastecimento(r: Reabastecimento, sync = true): Promise<void> {
  const d = await db();
  await d.put("reabastecimentos", { ...r, atualizado_em: r.atualizado_em || agoraIso() });
  if (sync) await marcarPendente("reabastecimentos", r.id, r.excluido ? "delete" : "upsert");
}

export interface ResultadoImportacao {
  modo: "substituir" | "mesclar";
  adicionados: Record<string, number>;
  atualizados: Record<string, number>;
  mantidos: Record<string, number>;
}

function maisNovoOuIgual(importado?: string, local?: string): boolean {
  if (!importado) return !local;
  if (!local) return true;
  return importado >= local;
}

export async function importarDados(dados: DadosNormalizados, substituir = false): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = {
    modo: substituir ? "substituir" : "mesclar",
    adicionados: {}, atualizados: {}, mantidos: {},
  };
  type StoreDados = "vendas" | "produtos" | "entregas" | "encomendas" | "cobrancas" | "reabastecimentos";
  const packs: Array<[StoreDados, Array<{ id: string; atualizado_em?: string }>]> = [
    ["vendas", dados.vendas],
    ["produtos", dados.produtos],
    ["entregas", dados.entregas],
    ["encomendas", dados.encomendas],
    ["cobrancas", dados.cobrancas],
    ["reabastecimentos", dados.reabastecimentos],
  ];
  const pendentes: Array<{ colecao: string; id: string }> = [];

  if (substituir) {
    await resetarBanco();
  }

  const d = await db();
  const tx = d.transaction(
    ["vendas", "produtos", "entregas", "encomendas", "cobrancas", "reabastecimentos", "configuracao", "meta", "pendentes"],
    "readwrite",
  );

  for (const [nome, rows] of packs) {
    const store = tx.objectStore(nome);
    for (const row of rows) {
      if (substituir) {
        await store.put(row as never);
        resultado.adicionados[nome] = (resultado.adicionados[nome] ?? 0) + 1;
        continue;
      }
      const atual = await store.get(row.id) as { atualizado_em?: string } | undefined;
      if (!atual) {
        await store.put(row as never);
        resultado.adicionados[nome] = (resultado.adicionados[nome] ?? 0) + 1;
        pendentes.push({ colecao: nome, id: row.id });
      } else if (maisNovoOuIgual(row.atualizado_em, atual.atualizado_em)) {
        await store.put(row as never);
        resultado.atualizados[nome] = (resultado.atualizados[nome] ?? 0) + 1;
        pendentes.push({ colecao: nome, id: row.id });
      } else {
        resultado.mantidos[nome] = (resultado.mantidos[nome] ?? 0) + 1;
      }
    }
  }

  const cfgStore = tx.objectStore("configuracao");
  const cfgLocal = await cfgStore.get(dados.configuracao.loja) as { atualizado_em?: string } | undefined;
  if (substituir || !cfgLocal || maisNovoOuIgual(dados.configuracao.atualizado_em, cfgLocal.atualizado_em)) {
    await cfgStore.put(dados.configuracao);
  }
  await tx.objectStore("meta").put({ chave: "loja", valor: dados.loja });
  await tx.objectStore("meta").put({ chave: "importado_em", valor: agoraIso() });
  const flag = await tx.objectStore("meta").get("precisa_upload_inicial");
  const precisaUpload = substituir || flag?.valor !== false;
  if (precisaUpload) {
    await tx.objectStore("meta").put({ chave: "precisa_upload_inicial", valor: true });
  } else {
    const pStore = tx.objectStore("pendentes");
    const agora = agoraIso();
    for (const p of pendentes) {
      await pStore.put({ colecao: p.colecao, id: p.id, acao: "upsert", em: agora });
    }
  }
  await tx.done;
  return resultado;
}

export async function exportarDados(): Promise<DadosNormalizados> {
  const loja = ((await getMeta("loja")) as string) || (await obterConfig())?.loja || "loja";
  return {
    loja,
    configuracao: completarConfig((await obterConfig()) ?? {
      loja,
      nome_loja: "Minha loja",
      telefone: "",
      mensagem_cardapio: "",
      taxa_entrega: 0,
      observacoes: "",
      hora_lembrete_padrao: "12:00",
      notificacoes_padrao: PREFS_NOTIFICACAO_PADRAO,
      atualizado_em: agoraIso(),
    }),
    vendas: await listarVendas(),
    produtos: await listarProdutos(),
    entregas: await listarEntregas(),
    encomendas: await listarEncomendas(),
    cobrancas: await listarCobrancas(10_000),
    reabastecimentos: await listarReabastecimentos(),
  };
}


export async function listarMembros(): Promise<MembroLoja[]> {
  const d = await db();
  return (await d.getAll("membros")).sort((a, b) => (a.nome || a.email || a.uid).localeCompare(b.nome || b.email || b.uid, "pt-BR"));
}

export async function upsertMembro(m: MembroLoja): Promise<void> {
  const d = await db();
  await d.put("membros", m);
}

export async function removerMembroLocal(uid: string): Promise<void> {
  const d = await db();
  await d.delete("membros", uid);
}

export async function listarAtividades(limite = 500): Promise<Atividade[]> {
  const d = await db();
  const all = await d.getAll("atividades");
  return all.sort((a, b) => b.em.localeCompare(a.em)).slice(0, limite);
}

export async function upsertAtividade(a: Atividade, marcar = true): Promise<void> {
  const d = await db();
  await d.put("atividades", a);
  if (marcar) await marcarPendente("atividades", a.id, "upsert");
}

export async function getMeta<T = unknown>(chave: string): Promise<T | undefined> {
  const d = await db();
  const row = await d.get("meta", chave);
  return row?.valor as T | undefined;
}

export async function setMeta(chave: string, valor: unknown): Promise<void> {
  const d = await db();
  await d.put("meta", { chave, valor });
}

export async function getFirebaseConfig(): Promise<FirebaseWebConfig | undefined> {
  return getMeta<FirebaseWebConfig>("firebase_config");
}

export async function setFirebaseConfig(cfg: FirebaseWebConfig): Promise<void> {
  await setMeta("firebase_config", cfg);
}

export async function limparFirebaseConfig(): Promise<void> {
  const d = await db();
  await d.delete("meta", "firebase_config");
}

export async function listarPendentes(): Promise<PendenteSync[]> {
  const d = await db();
  return d.getAll("pendentes");
}

export async function limparPendente(id: string): Promise<void> {
  const d = await db();
  await d.delete("pendentes", id);
}

export async function bancoTemDados(): Promise<boolean> {
  const d = await db();
  const n = await d.count("vendas");
  const p = await d.count("produtos");
  const c = await d.count("configuracao");
  return n + p + c > 0;
}
