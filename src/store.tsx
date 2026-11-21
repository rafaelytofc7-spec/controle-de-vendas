import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  bancoTemDados,
  exportarDados,
  getFirebaseConfig,
  getMeta,
  importarDados,
  listarCobrancas,
  listarEncomendas,
  listarEntregas,
  listarProdutos,
  listarReabastecimentos,
  listarVendas,
  obterConfig,
  salvarConfig,
  setFirebaseConfig,
  setMeta,
  upsertCobranca,
  upsertEncomenda,
  upsertEntrega,
  upsertProduto,
  upsertReabastecimento,
  upsertVenda,
} from "./lib/db";
import { agoraIso } from "./lib/datas";
import { gerarId, montarBackup, normalizarBackup, parseBackup, verificarBackupOficial, type DadosNormalizados } from "./lib/importacao";
import type { Cobranca, ConfiguracaoLoja, Encomenda, Entrega, FirebaseWebConfig, FormaCobranca, Produto, Reabastecimento, StatusEntrega, Venda } from "./lib/types";
import { configValida, iniciarFirebase } from "./lib/firebase";
import { sincronizar, type ProgressoSync } from "./lib/sync";
import { calcularReabastecimento } from "./lib/reabastecimento";

interface Store {
  pronto: boolean;
  temDados: boolean;
  loja: string;
  config: ConfiguracaoLoja;
  vendas: Venda[];
  produtos: Produto[];
  entregas: Entrega[];
  encomendas: Encomenda[];
  cobrancas: Cobranca[];
  reabastecimentos: Reabastecimento[];
  recarregar: () => Promise<void>;
  importarArquivo: (raw: unknown) => Promise<DadosNormalizados>;
  registrarVenda: (valor: number) => Promise<Venda>;
  excluirVenda: (id: string) => Promise<void>;
  salvarProduto: (p: Omit<Produto, "atualizado_em" | "loja"> & { loja?: string }) => Promise<void>;
  excluirProduto: (id: string) => Promise<void>;
  salvarEntrega: (e: Partial<Entrega> & Pick<Entrega, "cliente" | "endereco" | "valor">) => Promise<void>;
  statusEntrega: (id: string, status: StatusEntrega) => Promise<void>;
  excluirEntrega: (id: string) => Promise<void>;
  salvarEncomenda: (e: Partial<Encomenda> & Pick<Encomenda, "cliente" | "produto" | "valor">) => Promise<void>;
  concluirEncomenda: (id: string, concluida: boolean) => Promise<void>;
  excluirEncomenda: (id: string) => Promise<void>;
  registrarReabastecimento: (r: { produtoId: string | null; produto: string; unidade: string | null; quantidade: number; valorTotal: number; margem: number }) => Promise<Reabastecimento>;
  excluirReabastecimento: (id: string) => Promise<void>;
  registrarCobranca: (valor: number, provedor: Cobranca["provedor"], forma: FormaCobranca) => Promise<Cobranca>;
  confirmarCobranca: (id: string) => Promise<void>;
  cancelarCobranca: (id: string) => Promise<void>;
  atualizarConfig: (c: Partial<ConfiguracaoLoja>) => Promise<void>;
  firebaseCfg?: FirebaseWebConfig;
  salvarFirebase: (c: FirebaseWebConfig) => Promise<void>;
  usuario: User | null;
  online: boolean;
  syncando: boolean;
  progressoSync?: ProgressoSync;
  erroSync?: string;
  tentarSync: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const cfgVazia = (loja: string): ConfiguracaoLoja => ({
  loja,
  nome_loja: "Minha loja",
  telefone: "",
  mensagem_cardapio: "",
  taxa_entrega: 0,
  observacoes: "",
  atualizado_em: agoraIso(),
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [pronto, setPronto] = useState(false);
  const [temDados, setTemDados] = useState(false);
  const [loja, setLoja] = useState("loja");
  const [config, setConfig] = useState<ConfiguracaoLoja>(cfgVazia("loja"));
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [encomendas, setEncomendas] = useState<Encomenda[]>([]);
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [reabastecimentos, setReabastecimentos] = useState<Reabastecimento[]>([]);
  const [firebaseCfg, setFirebaseCfg] = useState<FirebaseWebConfig>();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncando, setSyncando] = useState(false);
  const [progressoSync, setProgressoSync] = useState<ProgressoSync>();
  const [erroSync, setErroSync] = useState<string>();

  const recarregar = useCallback(async () => {
    const tem = await bancoTemDados();
    setTemDados(tem);
    const cfgFb = await getFirebaseConfig();
    setFirebaseCfg(cfgFb);
    if (cfgFb && configValida(cfgFb)) {
      try { iniciarFirebase(cfgFb); } catch { /* ignore */ }
    }
    if (!tem) {
      setPronto(true);
      return;
    }
    const [v, p, e, en, c, r, cfg, lojaMeta] = await Promise.all([
      listarVendas(), listarProdutos(), listarEntregas(), listarEncomendas(),
      listarCobrancas(10_000), listarReabastecimentos(), obterConfig(), getMeta<string>("loja"),
    ]);
    setVendas(v); setProdutos(p); setEntregas(e); setEncomendas(en);
    setCobrancas(c); setReabastecimentos(r);
    const l = lojaMeta || cfg?.loja || "loja";
    setLoja(l);
    setConfig(cfg ?? cfgVazia(l));
    setPronto(true);
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!firebaseCfg || !configValida(firebaseCfg)) return;
    try {
      const { auth } = iniciarFirebase(firebaseCfg);
      return onAuthStateChanged(auth, setUsuario);
    } catch { return; }
  }, [firebaseCfg]);

  const importarArquivo = useCallback(async (raw: unknown) => {
    const backup = parseBackup(raw);
    const dados = normalizarBackup(backup);
    await importarDados(dados, true);
    await recarregar();
    return dados;
  }, [recarregar]);

  const registrarVenda = useCallback(async (valor: number) => {
    const v: Venda = { id: gerarId(), loja, valor, criado_em: agoraIso(), atualizado_em: agoraIso() };
    await upsertVenda(v);
    setVendas((xs) => [v, ...xs]);
    return v;
  }, [loja]);

  const excluirVenda = useCallback(async (id: string) => {
    const atual = vendas.find((x) => x.id === id);
    if (!atual) return;
    await upsertVenda({ ...atual, excluido: true, atualizado_em: agoraIso() });
    setVendas((xs) => xs.filter((x) => x.id !== id));
  }, [vendas]);

  const salvarProduto = useCallback(async (p: Omit<Produto, "atualizado_em" | "loja"> & { loja?: string }) => {
    const row: Produto = { ...p, loja: p.loja || loja, atualizado_em: agoraIso() };
    await upsertProduto(row);
    setProdutos((xs) => {
      const i = xs.findIndex((x) => x.id === row.id);
      if (i < 0) return [...xs, row].sort((a, b) => a.ordem - b.ordem);
      const next = xs.slice(); next[i] = row; return next.sort((a, b) => a.ordem - b.ordem);
    });
  }, [loja]);

  const excluirProduto = useCallback(async (id: string) => {
    const atual = produtos.find((x) => x.id === id);
    if (!atual) return;
    await upsertProduto({ ...atual, excluido: true, atualizado_em: agoraIso() });
    setProdutos((xs) => xs.filter((x) => x.id !== id));
  }, [produtos]);

  const salvarEntrega = useCallback(async (e: Partial<Entrega> & Pick<Entrega, "cliente" | "endereco" | "valor">) => {
    const id = e.id || gerarId();
    const atual = entregas.find((x) => x.id === id);
    const row: Entrega = {
      id, loja, cliente: e.cliente, endereco: e.endereco,
      telefone: e.telefone ?? atual?.telefone ?? null,
      valor: e.valor, status: e.status ?? atual?.status ?? "pendente",
      criado_em: e.criado_em || atual?.criado_em || agoraIso(),
      concluido_em: e.concluido_em ?? atual?.concluido_em ?? null,
      atualizado_em: agoraIso(),
    };
    await upsertEntrega(row);
    setEntregas((xs) => [row, ...xs.filter((x) => x.id !== id)]);
  }, [loja, entregas]);

  const statusEntrega = useCallback(async (id: string, status: StatusEntrega) => {
    const atual = entregas.find((x) => x.id === id);
    if (!atual) return;
    const row: Entrega = {
      ...atual, status,
      concluido_em: status === "entregue" ? agoraIso() : null,
      atualizado_em: agoraIso(),
    };
    await upsertEntrega(row);
    setEntregas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [entregas]);

  const excluirEntrega = useCallback(async (id: string) => {
    const atual = entregas.find((x) => x.id === id);
    if (!atual) return;
    await upsertEntrega({ ...atual, excluido: true, atualizado_em: agoraIso() });
    setEntregas((xs) => xs.filter((x) => x.id !== id));
  }, [entregas]);

  const salvarEncomenda = useCallback(async (e: Partial<Encomenda> & Pick<Encomenda, "cliente" | "produto" | "valor">) => {
    const id = e.id || gerarId();
    const atual = encomendas.find((x) => x.id === id);
    const row: Encomenda = {
      id, loja, cliente: e.cliente, produto: e.produto, valor: e.valor,
      pago: e.pago ?? atual?.pago ?? false,
      endereco: e.endereco ?? atual?.endereco ?? null,
      telefone: e.telefone ?? atual?.telefone ?? null,
      para_entrega: e.para_entrega ?? atual?.para_entrega ?? false,
      criado_em: e.criado_em || atual?.criado_em || agoraIso(),
      concluido_em: e.concluido_em ?? atual?.concluido_em ?? null,
      atualizado_em: agoraIso(),
    };
    await upsertEncomenda(row);
    setEncomendas((xs) => [row, ...xs.filter((x) => x.id !== id)]);
  }, [loja, encomendas]);

  const concluirEncomenda = useCallback(async (id: string, concluida: boolean) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    const row = { ...atual, concluido_em: concluida ? agoraIso() : null, atualizado_em: agoraIso() };
    await upsertEncomenda(row);
    setEncomendas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [encomendas]);

  const excluirEncomenda = useCallback(async (id: string) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    await upsertEncomenda({ ...atual, excluido: true, atualizado_em: agoraIso() });
    setEncomendas((xs) => xs.filter((x) => x.id !== id));
  }, [encomendas]);

  const registrarReabastecimento = useCallback(async (r: { produtoId: string | null; produto: string; unidade: string | null; quantidade: number; valorTotal: number; margem: number }) => {
    const calc = calcularReabastecimento(r.valorTotal, r.quantidade, r.margem);
    const row: Reabastecimento = {
      id: gerarId(), loja, produto_id: r.produtoId, produto: r.produto, unidade: r.unidade,
      quantidade: r.quantidade, valor_total: r.valorTotal, margem: r.margem,
      custo_unitario: calc.custo_unitario, preco_sugerido: calc.preco_sugerido,
      criado_em: agoraIso(), atualizado_em: agoraIso(),
    };
    await upsertReabastecimento(row);
    setReabastecimentos((xs) => [row, ...xs]);
    return row;
  }, [loja]);

  const excluirReabastecimento = useCallback(async (id: string) => {
    const atual = reabastecimentos.find((x) => x.id === id);
    if (!atual) return;
    await upsertReabastecimento({ ...atual, excluido: true, atualizado_em: agoraIso() });
    setReabastecimentos((xs) => xs.filter((x) => x.id !== id));
  }, [reabastecimentos]);

  const registrarCobranca = useCallback(async (valor: number, provedor: Cobranca["provedor"], forma: FormaCobranca) => {
    const row: Cobranca = {
      id: gerarId(), loja, valor, provedor, forma, status: "aguardando",
      referencia: null,
      mensagem: "Registro manual (sem envio à maquininha).",
      modo_teste: true, venda_id: null, criado_em: agoraIso(), pago_em: null, atualizado_em: agoraIso(),
    };
    await upsertCobranca(row);
    setCobrancas((xs) => [row, ...xs]);
    return row;
  }, [loja]);

  const confirmarCobranca = useCallback(async (id: string) => {
    const atual = cobrancas.find((x) => x.id === id);
    if (!atual || atual.status === "paga") return;
    let vendaId = atual.venda_id;
    if (!vendaId) {
      const v = await registrarVenda(atual.valor);
      vendaId = v.id;
    }
    const row: Cobranca = { ...atual, status: "paga", pago_em: agoraIso(), venda_id: vendaId, mensagem: "Pagamento confirmado.", atualizado_em: agoraIso() };
    await upsertCobranca(row);
    setCobrancas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [cobrancas, registrarVenda]);

  const cancelarCobranca = useCallback(async (id: string) => {
    const atual = cobrancas.find((x) => x.id === id);
    if (!atual || atual.status !== "aguardando") return;
    const row: Cobranca = { ...atual, status: "cancelada", mensagem: "Cobrança cancelada.", atualizado_em: agoraIso() };
    await upsertCobranca(row);
    setCobrancas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [cobrancas]);

  const atualizarConfig = useCallback(async (c: Partial<ConfiguracaoLoja>) => {
    const row = { ...config, ...c, loja, atualizado_em: agoraIso() };
    await salvarConfig(row);
    if (c.loja && c.loja !== loja) await setMeta("loja", c.loja);
    setConfig(row);
    if (c.loja) setLoja(c.loja);
  }, [config, loja]);

  const salvarFirebase = useCallback(async (c: FirebaseWebConfig) => {
    await setFirebaseConfig(c);
    setFirebaseCfg(c);
    if (configValida(c)) iniciarFirebase(c);
  }, []);

  const tentarSync = useCallback(async () => {
    if (!usuario || !online || !configValida(firebaseCfg)) return;
    setSyncando(true); setErroSync(undefined);
    try {
      await sincronizar(loja, usuario, setProgressoSync);
      await recarregar();
    } catch (e) {
      setErroSync(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSyncando(false);
    }
  }, [usuario, online, firebaseCfg, loja, recarregar]);

  useEffect(() => {
    if (usuario && online && pronto && temDados) void tentarSync();
  }, [usuario, online, pronto, temDados]); // eslint-disable-line

  const value = useMemo<Store>(() => ({
    pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, excluirEncomenda,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, usuario, online, syncando, progressoSync, erroSync, tentarSync,
  }), [pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, excluirEncomenda,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, usuario, online, syncando, progressoSync, erroSync, tentarSync]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do provider");
  return s;
}

export { montarBackup, exportarDados, verificarBackupOficial };
