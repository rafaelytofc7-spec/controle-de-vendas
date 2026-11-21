import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  bancoTemDados,
  exportarDados,
  getFirebaseConfig,
  getMeta,
  importarDados,
  listarAtividades,
  listarCobrancas,
  listarEncomendas,
  listarEntregas,
  listarMembros,
  listarProdutos,
  listarReabastecimentos,
  listarVendas,
  obterConfig,
  salvarConfig,
  upsertAtividade,
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
import type { Atividade, Cobranca, ConfiguracaoLoja, Encomenda, Entrega, FirebaseWebConfig, FormaCobranca, MembroLoja, Produto, Reabastecimento, StatusEntrega, Venda } from "./lib/types";
import { configValida, iniciarFirebase } from "./lib/firebase";
import { estadoEquipeLocal, sincronizar, type EstadoEquipe, type ProgressoSync } from "./lib/sync";
import { calcularReabastecimento } from "./lib/reabastecimento";
import { agregarVendas, type AgregadosVendas } from "./lib/agregados";
import { autoriaAtualizacao, autoriaNova, montarAtividade } from "./lib/autoria";

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
  importarArquivo: (raw: unknown, substituir?: boolean) => Promise<DadosNormalizados>;
  registrarVenda: (valor: number) => Promise<Venda>;
  excluirVenda: (id: string) => Promise<void>;
  salvarProduto: (p: Omit<Produto, "atualizado_em" | "loja" | "criadoPor" | "criadoPorEmail" | "atualizadoPor" | "atualizadoPorEmail"> & { loja?: string } & Partial<import("./lib/types").Autoria>) => Promise<void>;
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
  ehDono: boolean;
  bloqueado: boolean;
  membros: MembroLoja[];
  atividades: Atividade[];
  equipe?: EstadoEquipe;
  agregados: AgregadosVendas;
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
  const [ehDono, setEhDono] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [membros, setMembros] = useState<MembroLoja[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [equipe, setEquipe] = useState<EstadoEquipe>();

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
    const [v, p, e, en, c, r, cfg, lojaMeta, mem, atv, eq] = await Promise.all([
      listarVendas(), listarProdutos(), listarEntregas(), listarEncomendas(),
      listarCobrancas(10_000), listarReabastecimentos(), obterConfig(), getMeta<string>("loja"),
      listarMembros(), listarAtividades(), estadoEquipeLocal(),
    ]);
    setVendas(v); setProdutos(p); setEntregas(e); setEncomendas(en);
    setCobrancas(c); setReabastecimentos(r);
    setMembros(mem); setAtividades(atv);
    setEquipe(eq);
    setEhDono(Boolean(eq?.ehDono));
    setBloqueado(Boolean(eq?.bloqueado));
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

  const importarArquivo = useCallback(async (raw: unknown, substituir = false) => {
    const backup = parseBackup(raw);
    const dados = normalizarBackup(backup);
    await importarDados(dados, substituir);
    await recarregar();
    return dados;
  }, [recarregar]);


  const anotar = useCallback(async (acao: "criar" | "editar" | "excluir", colecao: string, registroId: string, resumo: string) => {
    const a = montarAtividade(loja, usuario, acao, colecao, registroId, resumo);
    await upsertAtividade(a);
    setAtividades((xs) => [a, ...xs].slice(0, 500));
  }, [loja, usuario]);

  const registrarVenda = useCallback(async (valor: number) => {
    const v: Venda = { id: gerarId(), loja, valor, criado_em: agoraIso(), atualizado_em: agoraIso(), ...autoriaNova(usuario) };
    await upsertVenda(v);
    setVendas((xs) => [v, ...xs]);
    await anotar("criar", "vendas", v.id, `Venda de ${valor.toFixed(2)}`);
    return v;
  }, [loja, usuario, anotar]);

  const excluirVenda = useCallback(async (id: string) => {
    const atual = vendas.find((x) => x.id === id);
    if (!atual) return;
    const row = { ...autoriaAtualizacao(atual, usuario), excluido: true, atualizado_em: agoraIso() };
    await upsertVenda(row);
    setVendas((xs) => xs.filter((x) => x.id !== id));
    await anotar("excluir", "vendas", id, `Excluiu venda de ${atual.valor.toFixed(2)}`);
  }, [vendas, usuario, anotar]);

  const salvarProduto = useCallback(async (p: Omit<Produto, "atualizado_em" | "loja" | "criadoPor" | "criadoPorEmail" | "atualizadoPor" | "atualizadoPorEmail"> & { loja?: string } & Partial<import("./lib/types").Autoria>) => {
    const atual = produtos.find((x) => x.id === p.id);
    const aut = atual ? autoriaAtualizacao(atual, usuario) : autoriaNova(usuario);
    const row: Produto = { ...p, ...aut, loja: p.loja || loja, atualizado_em: agoraIso() };
    await upsertProduto(row);
    setProdutos((xs) => {
      const i = xs.findIndex((x) => x.id === row.id);
      if (i < 0) return [...xs, row].sort((a, b) => a.ordem - b.ordem);
      const next = xs.slice(); next[i] = row; return next.sort((a, b) => a.ordem - b.ordem);
    });
    await anotar(atual ? "editar" : "criar", "produtos", row.id, `${atual ? "Editou" : "Cadastrou"} ${row.nome}`);
  }, [loja, produtos, usuario, anotar]);

  const excluirProduto = useCallback(async (id: string) => {
    const atual = produtos.find((x) => x.id === id);
    if (!atual) return;
    await upsertProduto({ ...autoriaAtualizacao(atual, usuario), excluido: true, atualizado_em: agoraIso() });
    setProdutos((xs) => xs.filter((x) => x.id !== id));
    await anotar("excluir", "produtos", id, `Excluiu ${atual.nome}`);
  }, [produtos, usuario, anotar]);

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
      ...(atual ? autoriaAtualizacao(atual, usuario) : autoriaNova(usuario)),
    };
    await upsertEntrega(row);
    await anotar(atual ? "editar" : "criar", "entregas", row.id, `${atual ? "Editou" : "Registrou"} entrega de ${row.cliente}`);
    setEntregas((xs) => [row, ...xs.filter((x) => x.id !== id)]);
  }, [loja, entregas, usuario, anotar]);

  const statusEntrega = useCallback(async (id: string, status: StatusEntrega) => {
    const atual = entregas.find((x) => x.id === id);
    if (!atual) return;
    const row: Entrega = {
      ...autoriaAtualizacao(atual, usuario), status,
      concluido_em: status === "entregue" ? agoraIso() : null,
      atualizado_em: agoraIso(),
    };
    await upsertEntrega(row);
    await anotar("editar", "entregas", id, `Status da entrega de ${atual.cliente}: ${status}`);
    setEntregas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [entregas, usuario, anotar]);

  const excluirEntrega = useCallback(async (id: string) => {
    const atual = entregas.find((x) => x.id === id);
    if (!atual) return;
    await upsertEntrega({ ...autoriaAtualizacao(atual, usuario), excluido: true, atualizado_em: agoraIso() });
    setEntregas((xs) => xs.filter((x) => x.id !== id));
    await anotar("excluir", "entregas", id, `Excluiu entrega de ${atual.cliente}`);
  }, [entregas, usuario, anotar]);

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
      ...(atual ? autoriaAtualizacao(atual, usuario) : autoriaNova(usuario)),
    };
    await upsertEncomenda(row);
    setEncomendas((xs) => [row, ...xs.filter((x) => x.id !== id)]);
    await anotar(atual ? "editar" : "criar", "encomendas", row.id, `${atual ? "Editou" : "Registrou"} encomenda de ${row.cliente}`);
  }, [loja, encomendas, usuario, anotar]);

  const concluirEncomenda = useCallback(async (id: string, concluida: boolean) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    const row = { ...autoriaAtualizacao(atual, usuario), concluido_em: concluida ? agoraIso() : null, atualizado_em: agoraIso() };
    await upsertEncomenda(row);
    await anotar("editar", "encomendas", id, concluida ? `Concluiu encomenda de ${atual.cliente}` : `Reabriu encomenda de ${atual.cliente}`);
    setEncomendas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [encomendas, usuario, anotar]);

  const excluirEncomenda = useCallback(async (id: string) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    await upsertEncomenda({ ...autoriaAtualizacao(atual, usuario), excluido: true, atualizado_em: agoraIso() });
    setEncomendas((xs) => xs.filter((x) => x.id !== id));
    await anotar("excluir", "encomendas", id, `Excluiu encomenda de ${atual.cliente}`);
  }, [encomendas, usuario, anotar]);

  const registrarReabastecimento = useCallback(async (r: { produtoId: string | null; produto: string; unidade: string | null; quantidade: number; valorTotal: number; margem: number }) => {
    const calc = calcularReabastecimento(r.valorTotal, r.quantidade, r.margem);
    const row: Reabastecimento = {
      id: gerarId(), loja, produto_id: r.produtoId, produto: r.produto, unidade: r.unidade,
      quantidade: r.quantidade, valor_total: r.valorTotal, margem: r.margem,
      custo_unitario: calc.custo_unitario, preco_sugerido: calc.preco_sugerido,
      criado_em: agoraIso(), atualizado_em: agoraIso(),
      ...autoriaNova(usuario),
    };
    await upsertReabastecimento(row);
    setReabastecimentos((xs) => [row, ...xs]);
    await anotar("criar", "reabastecimentos", row.id, `Reabasteceu ${row.produto}`);
    return row;
  }, [loja, usuario, anotar]);

  const excluirReabastecimento = useCallback(async (id: string) => {
    const atual = reabastecimentos.find((x) => x.id === id);
    if (!atual) return;
    await upsertReabastecimento({ ...autoriaAtualizacao(atual, usuario), excluido: true, atualizado_em: agoraIso() });
    setReabastecimentos((xs) => xs.filter((x) => x.id !== id));
    await anotar("excluir", "reabastecimentos", id, `Excluiu reabastecimento de ${atual.produto}`);
  }, [reabastecimentos, usuario, anotar]);

  const registrarCobranca = useCallback(async (valor: number, provedor: Cobranca["provedor"], forma: FormaCobranca) => {
    const row: Cobranca = {
      id: gerarId(), loja, valor, provedor, forma, status: "aguardando",
      referencia: null,
      mensagem: "Registro manual (sem envio à maquininha).",
      modo_teste: true, venda_id: null, criado_em: agoraIso(), pago_em: null, atualizado_em: agoraIso(),
      ...autoriaNova(usuario),
    };
    await upsertCobranca(row);
    setCobrancas((xs) => [row, ...xs]);
    await anotar("criar", "cobrancas", row.id, `Cobrança de ${valor.toFixed(2)}`);
    return row;
  }, [loja, usuario, anotar]);

  const confirmarCobranca = useCallback(async (id: string) => {
    const atual = cobrancas.find((x) => x.id === id);
    if (!atual || atual.status === "paga") return;
    let vendaId = atual.venda_id;
    if (!vendaId) {
      const v = await registrarVenda(atual.valor);
      vendaId = v.id;
    }
    const row: Cobranca = { ...autoriaAtualizacao(atual, usuario), status: "paga", pago_em: agoraIso(), venda_id: vendaId, mensagem: "Pagamento confirmado.", atualizado_em: agoraIso() };
    await upsertCobranca(row);
    await anotar("editar", "cobrancas", id, `Confirmou cobrança de ${atual.valor.toFixed(2)}`);
    setCobrancas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [cobrancas, registrarVenda, usuario, anotar]);

  const cancelarCobranca = useCallback(async (id: string) => {
    const atual = cobrancas.find((x) => x.id === id);
    if (!atual || atual.status !== "aguardando") return;
    const row: Cobranca = { ...autoriaAtualizacao(atual, usuario), status: "cancelada", mensagem: "Cobrança cancelada.", atualizado_em: agoraIso() };
    await upsertCobranca(row);
    await anotar("editar", "cobrancas", id, `Cancelou cobrança de ${atual.valor.toFixed(2)}`);
    setCobrancas((xs) => xs.map((x) => x.id === id ? row : x));
  }, [cobrancas, usuario, anotar]);

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
      const estado = await sincronizar(loja, usuario, setProgressoSync);
      setEquipe(estado);
      setEhDono(estado.ehDono);
      setBloqueado(estado.bloqueado);
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

  const agregados = useMemo(() => agregarVendas(vendas), [vendas]);

  const value = useMemo<Store>(() => ({
    pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, excluirEncomenda,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, usuario, online, syncando, progressoSync, erroSync, tentarSync,
    ehDono, bloqueado, membros, atividades, equipe, agregados,
  }), [pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, excluirEncomenda,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, usuario, online, syncando, progressoSync, erroSync, tentarSync,
    ehDono, bloqueado, membros, atividades, equipe, agregados]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do provider");
  return s;
}

export { montarBackup, exportarDados, verificarBackupOficial };
