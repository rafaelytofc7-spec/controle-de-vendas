import {
  collection,
  deleteDoc,
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
  listarAtividades,
  listarCobrancas,
  listarEncomendas,
  listarEntregas,
  listarMembros,
  listarPendentes,
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

const LOTE = 400;

export interface ProgressoSync {
  fase: string;
  feito: number;
  total: number;
}

export async function garantirMembro(loja: string, user: User): Promise<EstadoEquipe> {
  const { db } = getFirebase();
  const lojaRef = doc(db, "lojas", loja);
  const snap = await getDoc(lojaRef);
  if (!snap.exists()) {
    throw new Error("A loja ainda não existe na nuvem. Entre com o seu nome e o PIN em Ajustes → Nuvem.");
  }
  const liderUid = (snap.data() as { liderUid?: string }).liderUid ?? "";
  const membroRef = doc(db, "lojas", loja, "membros", user.uid);
  const membroSnap = await getDoc(membroRef);
  if (!membroSnap.exists()) {
    throw new Error("Este aparelho ainda não entrou na loja. Abra Ajustes → Nuvem e entre com o PIN.");
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
      batch.set(doc(db, ...(it.path as [string, ...string[]])), it.data, { merge: true });
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
  const ehDono = estado?.ehDono ?? true;
  const vendas = await listarVendas();
  const produtos = await listarProdutos();
  const entregas = await listarEntregas();
  const encomendas = await listarEncomendas();
  const cobrancas = await listarCobrancas(10_000);
  const reab = await listarReabastecimentos();
  const cfg = await obterConfig();
  const itens: Array<{ path: string[]; data: DocumentData }> = [];
  if (cfg && ehDono) itens.push({ path: ["lojas", loja, "configuracao", "atual"], data: cfg });
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
  void user;
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
  onProg?.({ fase: "baixando", feito: 1, total: 8 });
  for (const r of await puxarColecao(loja, "produtos")) {
    const local = mapas.produtos.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertProduto(r as Produto, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 2, total: 8 });
  for (const r of await puxarColecao(loja, "entregas")) {
    const local = mapas.entregas.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertEntrega(r as Entrega, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 3, total: 8 });
  for (const r of await puxarColecao(loja, "encomendas")) {
    const local = mapas.encomendas.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertEncomenda(r as Encomenda, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 4, total: 8 });
  for (const r of await puxarColecao(loja, "cobrancas")) {
    const local = mapas.cobrancas.get(r.id);
    if (maisNovo(local?.atualizado_em, r.atualizado_em) === "remoto" || !local) {
      await upsertCobranca(r as Cobranca, false);
    }
  }
  onProg?.({ fase: "baixando", feito: 5, total: 8 });
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
}

export async function enviarPendentes(loja: string, ehDono: boolean): Promise<number> {
  const { db } = getFirebase();
  const pendentes = await listarPendentes();
  if (!pendentes.length) return 0;
  const vendas = new Map((await listarVendas()).map((x) => [x.id, x]));
  const produtos = new Map((await listarProdutos()).map((x) => [x.id, x]));
  const entregas = new Map((await listarEntregas()).map((x) => [x.id, x]));
  const encomendas = new Map((await listarEncomendas()).map((x) => [x.id, x]));
  const cobrancas = new Map((await listarCobrancas(10_000)).map((x) => [x.id, x]));
  const reab = new Map((await listarReabastecimentos()).map((x) => [x.id, x]));
  const atividades = new Map((await listarAtividades(2000)).map((x) => [x.id, x]));
  const cfg = await obterConfig();

  const mapa: Record<string, Map<string, unknown> | undefined> = {
    vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos: reab, atividades,
  };

  for (let i = 0; i < pendentes.length; i += LOTE) {
    const fatia = pendentes.slice(i, i + LOTE);
    const batch = writeBatch(db);
    for (const p of fatia) {
      if (p.colecao === "configuracao") {
        if (ehDono && cfg) batch.set(doc(db, "lojas", loja, "configuracao", "atual"), cfg, { merge: true });
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
): Promise<EstadoEquipe> {
  const estado = await garantirMembro(loja, user);
  const precisa = await getMeta<boolean>("precisa_upload_inicial");
  if (precisa) {
    await uploadInicial(loja, user, onProg);
  } else {
    await enviarPendentes(loja, estado.ehDono);
    await puxarRemoto(loja, onProg);
    await enviarPendentes(loja, estado.ehDono);
  }
  await setMeta("ultimo_sync", new Date().toISOString());
  return estado;
}

void query;
void where;
void limit;
