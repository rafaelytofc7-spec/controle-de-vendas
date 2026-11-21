import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
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
  listarCobrancas,
  listarEncomendas,
  listarEntregas,
  listarPendentes,
  listarProdutos,
  listarReabastecimentos,
  listarVendas,
  limparPendente,
  obterConfig,
  setMeta,
  upsertCobranca,
  upsertEncomenda,
  upsertEntrega,
  upsertProduto,
  upsertReabastecimento,
  upsertVenda,
  salvarConfig,
} from "./db";
import type { Cobranca, Encomenda, Entrega, Produto, Reabastecimento, Venda } from "./types";

const LOTE = 400;

export interface ProgressoSync {
  fase: string;
  feito: number;
  total: number;
}

export async function garantirMembro(loja: string, user: User): Promise<void> {
  const { db } = getFirebase();
  const lojaRef = doc(db, "lojas", loja);
  const snap = await getDoc(lojaRef);
  if (!snap.exists()) {
    await setDoc(lojaRef, {
      ownerUid: user.uid,
      ownerEmail: user.email ?? "",
      criado_em: new Date().toISOString(),
    });
    await setDoc(doc(db, "lojas", loja, "membros", user.uid), {
      email: user.email ?? "",
      papel: "dono",
      criado_em: new Date().toISOString(),
    });
    return;
  }
  const membroRef = doc(db, "lojas", loja, "membros", user.uid);
  const membro = await getDoc(membroRef);
  if (!membro.exists()) {
    const data = snap.data() as { ownerUid?: string; membrosEmails?: string[] };
    const email = (user.email ?? "").toLowerCase();
    const permitido =
      data.ownerUid === user.uid ||
      (Array.isArray(data.membrosEmails) && data.membrosEmails.map((e) => e.toLowerCase()).includes(email));
    if (!permitido) {
      throw new Error("Sua conta não tem permissão nesta loja. Peça ao dono para adicionar o seu e-mail.");
    }
    await setDoc(membroRef, {
      email: user.email ?? "",
      papel: data.ownerUid === user.uid ? "dono" : "equipe",
      criado_em: new Date().toISOString(),
    });
  }
}

async function escreverLote(itens: Array<{ path: string[]; data: DocumentData }>) {
  const { db } = getFirebase();
  for (let i = 0; i < itens.length; i += LOTE) {
    const fatia = itens.slice(i, i + LOTE);
    const batch = writeBatch(db);
    for (const it of fatia) {
      batch.set(doc(db, ...(it.path as [string, ...string[]])), it.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function uploadInicial(loja: string, onProg?: (p: ProgressoSync) => void): Promise<void> {
  const vendas = await listarVendas();
  const produtos = await listarProdutos();
  const entregas = await listarEntregas();
  const encomendas = await listarEncomendas();
  const cobrancas = await listarCobrancas(10_000);
  const reab = await listarReabastecimentos();
  const cfg = await obterConfig();
  const itens: Array<{ path: string[]; data: DocumentData }> = [];
  if (cfg) itens.push({ path: ["lojas", loja, "configuracao", "atual"], data: cfg });
  for (const v of vendas) itens.push({ path: ["lojas", loja, "vendas", v.id], data: v });
  for (const p of produtos) itens.push({ path: ["lojas", loja, "produtos", p.id], data: p });
  for (const e of entregas) itens.push({ path: ["lojas", loja, "entregas", e.id], data: e });
  for (const e of encomendas) itens.push({ path: ["lojas", loja, "encomendas", e.id], data: e });
  for (const c of cobrancas) itens.push({ path: ["lojas", loja, "cobrancas", c.id], data: c });
  for (const r of reab) itens.push({ path: ["lojas", loja, "reabastecimentos", r.id], data: r });

  const total = itens.length;
  onProg?.({ fase: "enviando", feito: 0, total });
  for (let i = 0; i < itens.length; i += LOTE) {
    await escreverLote(itens.slice(i, i + LOTE));
    onProg?.({ fase: "enviando", feito: Math.min(i + LOTE, total), total });
  }
  await setMeta("precisa_upload_inicial", false);
  await setMeta("ultimo_sync", new Date().toISOString());
}

async function puxarColecao(loja: string, colecao: string) {
  const { db } = getFirebase();
  const col = collection(db, "lojas", loja, colecao);
  const out: DocumentData[] = [];
  let ultimo: QueryDocumentSnapshot | undefined;
  for (;;) {
    const q = ultimo
      ? query(col, startAfter(ultimo), limit(LOTE))
      : query(col, limit(LOTE));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const docu of snap.docs) out.push({ id: docu.id, ...docu.data() });
    ultimo = snap.docs[snap.docs.length - 1];
    if (snap.size < LOTE) break;
  }
  return out;
}

function maisNovo(local?: string, remoto?: string): "local" | "remoto" | "igual" {
  if (!remoto && !local) return "igual";
  if (!remoto) return "local";
  if (!local) return "remoto";
  if (remoto > local) return "remoto";
  if (local > remoto) return "local";
  return "igual";
}

export async function puxarRemoto(loja: string, onProg?: (p: ProgressoSync) => void): Promise<void> {
  onProg?.({ fase: "baixando", feito: 0, total: 6 });
  const mapas = {
    vendas: new Map((await listarVendas()).map((x) => [x.id, x])),
    produtos: new Map((await listarProdutos()).map((x) => [x.id, x])),
    entregas: new Map((await listarEntregas()).map((x) => [x.id, x])),
    encomendas: new Map((await listarEncomendas()).map((x) => [x.id, x])),
    cobrancas: new Map((await listarCobrancas(10_000)).map((x) => [x.id, x])),
    reabastecimentos: new Map((await listarReabastecimentos()).map((x) => [x.id, x])),
  };

  const vendasR = await puxarColecao(loja, "vendas");
  for (const r of vendasR) {
    const local = mapas.vendas.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertVenda(r as Venda, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 1, total: 6 });
  for (const r of await puxarColecao(loja, "produtos")) {
    const local = mapas.produtos.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertProduto(r as Produto, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 2, total: 6 });
  for (const r of await puxarColecao(loja, "entregas")) {
    const local = mapas.entregas.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertEntrega(r as Entrega, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 3, total: 6 });
  for (const r of await puxarColecao(loja, "encomendas")) {
    const local = mapas.encomendas.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertEncomenda(r as Encomenda, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 4, total: 6 });
  for (const r of await puxarColecao(loja, "cobrancas")) {
    const local = mapas.cobrancas.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertCobranca(r as Cobranca, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 5, total: 6 });
  for (const r of await puxarColecao(loja, "reabastecimentos")) {
    const local = mapas.reabastecimentos.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertReabastecimento(r as Reabastecimento, false);
    }
  }
  const { db } = getFirebase();
  const cfgSnap = await getDoc(doc(db, "lojas", loja, "configuracao", "atual"));
  if (cfgSnap.exists()) {
    const remoto = cfgSnap.data();
    const local = await obterConfig();
    if (maisNovo(local?.atualizado_em, remoto.atualizado_em) === "remoto" || !local) {
      await salvarConfig(remoto as never, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 6, total: 6 });
}

export async function enviarPendentes(loja: string): Promise<number> {
  const { db } = getFirebase();
  const pendentes = await listarPendentes();
  if (!pendentes.length) return 0;
  const vendas = new Map((await listarVendas()).map((x) => [x.id, x]));
  const produtos = new Map((await listarProdutos()).map((x) => [x.id, x]));
  const entregas = new Map((await listarEntregas()).map((x) => [x.id, x]));
  const encomendas = new Map((await listarEncomendas()).map((x) => [x.id, x]));
  const cobrancas = new Map((await listarCobrancas(10_000)).map((x) => [x.id, x]));
  const reab = new Map((await listarReabastecimentos()).map((x) => [x.id, x]));
  const cfg = await obterConfig();

  const mapa: Record<string, Map<string, unknown> | undefined> = {
    vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos: reab,
  };

  for (let i = 0; i < pendentes.length; i += LOTE) {
    const fatia = pendentes.slice(i, i + LOTE);
    const batch = writeBatch(db);
    for (const p of fatia) {
      if (p.colecao === "configuracao") {
        if (cfg) batch.set(doc(db, "lojas", loja, "configuracao", "atual"), cfg, { merge: true });
        continue;
      }
      const store = mapa[p.colecao];
      const data = store?.get(p.id);
      const ref = doc(db, "lojas", loja, p.colecao, p.id);
      if (p.acao === "delete" || (data as { excluido?: boolean } | undefined)?.excluido) {
        batch.set(ref, { ...(data ?? { id: p.id }), excluido: true, atualizado_em: new Date().toISOString() }, { merge: true });
      } else if (data) {
        batch.set(ref, data, { merge: true });
      }
    }
    await batch.commit();
    for (const p of fatia) await limparPendente(p.id);
  }
  return pendentes.length;
}

export async function sincronizar(
  loja: string,
  user: User,
  onProg?: (p: ProgressoSync) => void,
): Promise<void> {
  await garantirMembro(loja, user);
  const precisa = await getMeta<boolean>("precisa_upload_inicial");
  if (precisa) {
    await uploadInicial(loja, onProg);
  } else {
    await enviarPendentes(loja);
    await puxarRemoto(loja, onProg);
    await enviarPendentes(loja);
  }
  await setMeta("ultimo_sync", new Date().toISOString());
}

// silence unused import if tree-shaken; query/where kept for future filtered pull
void query;
void where;
void limit;
