import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  bancoTemDados,
  exportarDados,
  getFirebaseConfig,
  limparFirebaseConfig,
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
import { PREFS_NOTIFICACAO_PADRAO, type EstadoEquipe, type Atividade, Cobranca, ConfiguracaoLoja, Encomenda, Entrega, FirebaseWebConfig, FormaCobranca, MembroLoja, Produto, Reabastecimento, StatusEntrega, Venda } from "./lib/types";
import { configEfetiva, configValida, iniciarFirebase } from "./lib/firebase";
import { estadoEquipeLocal, sincronizar, type ProgressoSync } from "./lib/sync";
import { entrarComPin, recuperarLideranca } from "./lib/acesso";
import { LOJA_NUVEM_ID } from "./lib/firebasePadrao";
import { calcularReabastecimento } from "./lib/reabastecimento";
import { agregarVendas, type AgregadosVendas } from "./lib/agregados";
import { autoriaAtualizacao, autoriaNova, montarAtividade } from "./lib/autoria";
import { montarPrazo, tipoDeEncomenda, validarEncomenda, textoEndereco } from "./lib/encomendas";
import {
  agendarLembretesEncomendas, avisarAlteracoesOutros, avisarBackupSePreciso,
  avisarEncomendasNovas, avisarErroSync, avisarNovosMembros, carregarPrefsNotificacao,
  marcarBackupFeito, pedirPermissaoNotificacoes, salvarPrefsNotificacao,
} from "./lib/notificacoes";
import type { FormaPagamentoEncomenda, PrefsNotificacao, StatusEncomenda, TipoEncomenda } from "./lib/types";

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
  salvarEncomenda: (e: Partial<Encomenda> & Pick<Encomenda, "cliente" | "produto" | "valor" | "telefone" | "tipo" | "data_entrega">) => Promise<void>;
  concluirEncomenda: (id: string, concluida: boolean) => Promise<void>;
  confirmarEncomenda: (id: string) => Promise<void>;
  cancelarEncomenda: (id: string) => Promise<void>;
  marcarPagamentoEncomenda: (id: string, pago: boolean, valorPago?: number | null, forma?: FormaPagamentoEncomenda | null) => Promise<void>;
  excluirEncomenda: (id: string) => Promise<void>;
  prefsNotificacao: PrefsNotificacao;
  salvarPrefs: (p: PrefsNotificacao) => Promise<void>;
  registrarReabastecimento: (r: { produtoId: string | null; produto: string; unidade: string | null; quantidade: number; valorTotal: number; margem: number }) => Promise<Reabastecimento>;
  excluirReabastecimento: (id: string) => Promise<void>;
  registrarCobranca: (valor: number, provedor: Cobranca["provedor"], forma: FormaCobranca) => Promise<Cobranca>;
  confirmarCobranca: (id: string) => Promise<void>;
  cancelarCobranca: (id: string) => Promise<void>;
  atualizarConfig: (c: Partial<ConfiguracaoLoja>) => Promise<void>;
  firebaseCfg?: FirebaseWebConfig;
  salvarFirebase: (c: FirebaseWebConfig) => Promise<void>;
  limparFirebase: () => Promise<void>;
  firebaseOverride: boolean;
  usuario: User | null;
  online: boolean;
  syncando: boolean;
  progressoSync?: ProgressoSync;
  erroSync?: string;
  tentarSync: () => Promise<void>;
  entrarNaNuvem: (nome: string, pin: string) => Promise<{ primeiraVez: boolean; codigoRecuperacao?: string }>;
  recuperarLider: (nome: string, pin: string, codigo: string) => Promise<void>;
  codigoRecuperacao?: string;
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
  hora_lembrete_padrao: "12:00",
  notificacoes_padrao: PREFS_NOTIFICACAO_PADRAO,
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
  const [firebaseOverride, setFirebaseOverride] = useState(false);
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
  const [codigoRecuperacao, setCodigoRecuperacao] = useState<string>();
  const [prefsNotificacao, setPrefsNotificacao] = useState<PrefsNotificacao>(PREFS_NOTIFICACAO_PADRAO);

  const recarregar = useCallback(async () => {
    const tem = await bancoTemDados();
    setTemDados(tem);
    const salva = await getFirebaseConfig();
    const cfgFb = configEfetiva(salva);
    setFirebaseOverride(configValida(salva));
    setFirebaseCfg(cfgFb);
    try { iniciarFirebase(cfgFb); } catch { /* ignore */ }
    if (!tem) {
      setPronto(true);
      return;
    }
    const [v, p, e, en, c, r, cfg, lojaMeta, mem, atv, eq, codigoLocal] = await Promise.all([
      listarVendas(), listarProdutos(), listarEntregas(), listarEncomendas(),
      listarCobrancas(10_000), listarReabastecimentos(), obterConfig(), getMeta<string>("loja"),
      listarMembros(), listarAtividades(), estadoEquipeLocal(), getMeta<string>("codigo_recuperacao"),
    ]);
    setVendas(v); setProdutos(p); setEntregas(e); setEncomendas(en);
    setCobrancas(c); setReabastecimentos(r);
    setMembros(mem); setAtividades(atv);
    setEquipe(eq);
    setCodigoRecuperacao(codigoLocal);
    setEhDono(Boolean(eq?.ehDono || eq?.ehLider));
    setBloqueado(Boolean(eq?.bloqueado));
    const l = lojaMeta || cfg?.loja || "loja";
    setLoja(l);
    const cfgFinal = cfg ?? cfgVazia(l);
    setConfig(cfgFinal);
    const prefs = await carregarPrefsNotificacao(cfgFinal);
    setPrefsNotificacao(prefs);
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

  const nomeSessao = usuario?.displayName || equipe?.meuNome || "";

  const salvarEncomenda = useCallback(async (e: Partial<Encomenda> & Pick<Encomenda, "cliente" | "produto" | "valor" | "telefone" | "tipo" | "data_entrega">) => {
    const tipo: TipoEncomenda = e.tipo ?? tipoDeEncomenda({ tipo: e.tipo, para_entrega: e.para_entrega });
    const erro = validarEncomenda({
      cliente: e.cliente, produto: e.produto, telefone: e.telefone ?? "", tipo,
      endereco: e.endereco_detalhe, data_entrega: e.data_entrega,
    });
    if (erro) throw new Error(erro);
    const id = e.id || gerarId();
    const atual = encomendas.find((x) => x.id === id);
    const horaPadrao = config.hora_lembrete_padrao || "12:00";
    const dataEntrega = e.data_entrega ?? atual?.data_entrega ?? null;
    const prazo = e.prazo_lembrete ?? (dataEntrega ? montarPrazo(dataEntrega, horaPadrao, horaPadrao) : (atual?.prazo_lembrete ?? null));
    const detalhe = tipo === "entrega" ? (e.endereco_detalhe ?? atual?.endereco_detalhe ?? null) : null;
    const row: Encomenda = {
      id, loja, cliente: e.cliente, produto: e.produto, valor: e.valor,
      pago: e.pago ?? atual?.pago ?? false,
      forma_pagamento: e.forma_pagamento ?? atual?.forma_pagamento ?? null,
      valor_pago: e.valor_pago ?? atual?.valor_pago ?? null,
      pago_em: e.pago_em ?? atual?.pago_em ?? null,
      pago_por: e.pago_por ?? atual?.pago_por ?? null,
      pago_por_nome: e.pago_por_nome ?? atual?.pago_por_nome ?? null,
      endereco: detalhe ? textoEndereco(detalhe) : null,
      endereco_detalhe: detalhe,
      telefone: e.telefone ?? atual?.telefone ?? null,
      para_entrega: tipo === "entrega",
      tipo,
      data_entrega: dataEntrega,
      prazo_lembrete: prazo,
      status: e.status ?? atual?.status ?? "pendente",
      entregue_por: e.entregue_por ?? atual?.entregue_por ?? null,
      entregue_por_nome: e.entregue_por_nome ?? atual?.entregue_por_nome ?? null,
      criado_em: e.criado_em || atual?.criado_em || agoraIso(),
      concluido_em: e.concluido_em ?? atual?.concluido_em ?? null,
      atualizado_em: agoraIso(),
      ...(atual ? autoriaAtualizacao(atual, usuario) : autoriaNova(usuario)),
    };
    await upsertEncomenda(row);
    const lista = [row, ...encomendas.filter((x) => x.id !== id)];
    setEncomendas(lista);
    await anotar(atual ? "editar" : "criar", "encomendas", row.id, `${atual ? "Editou" : "Registrou"} encomenda de ${row.cliente}`);
    await agendarLembretesEncomendas(lista, prefsNotificacao);
    if (!atual) await avisarEncomendasNovas(lista, prefsNotificacao, usuario?.uid);
  }, [loja, encomendas, usuario, anotar, config.hora_lembrete_padrao, prefsNotificacao]);

  const confirmarEncomenda = useCallback(async (id: string) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    const agora = agoraIso();
    const row: Encomenda = {
      ...autoriaAtualizacao(atual, usuario),
      status: "entregue",
      concluido_em: agora,
      entregue_por: usuario?.uid ?? "local",
      entregue_por_nome: nomeSessao || usuario?.uid || "local",
      atualizado_em: agora,
    };
    await upsertEncomenda(row);
    const lista = encomendas.map((x) => x.id === id ? row : x);
    setEncomendas(lista);
    await anotar("editar", "encomendas", id, `Confirmou entrega da encomenda de ${atual.cliente}`);
    await agendarLembretesEncomendas(lista, prefsNotificacao);
  }, [encomendas, usuario, anotar, nomeSessao, prefsNotificacao]);

  const cancelarEncomenda = useCallback(async (id: string) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    const row: Encomenda = { ...autoriaAtualizacao(atual, usuario), status: "cancelada", atualizado_em: agoraIso() };
    await upsertEncomenda(row);
    const lista = encomendas.map((x) => x.id === id ? row : x);
    setEncomendas(lista);
    await anotar("editar", "encomendas", id, `Cancelou encomenda de ${atual.cliente}`);
    await agendarLembretesEncomendas(lista, prefsNotificacao);
  }, [encomendas, usuario, anotar, prefsNotificacao]);

  const concluirEncomenda = useCallback(async (id: string, concluida: boolean) => {
    if (concluida) return confirmarEncomenda(id);
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    const row: Encomenda = {
      ...autoriaAtualizacao(atual, usuario),
      status: "pendente",
      concluido_em: null,
      entregue_por: null,
      entregue_por_nome: null,
      atualizado_em: agoraIso(),
    };
    await upsertEncomenda(row);
    const lista = encomendas.map((x) => x.id === id ? row : x);
    setEncomendas(lista);
    await anotar("editar", "encomendas", id, `Reabriu encomenda de ${atual.cliente}`);
    await agendarLembretesEncomendas(lista, prefsNotificacao);
  }, [encomendas, usuario, anotar, confirmarEncomenda, prefsNotificacao]);

  const marcarPagamentoEncomenda = useCallback(async (id: string, pago: boolean, valorPago?: number | null, forma?: FormaPagamentoEncomenda | null) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    const agora = agoraIso();
    const row: Encomenda = {
      ...autoriaAtualizacao(atual, usuario),
      pago,
      forma_pagamento: forma === undefined ? atual.forma_pagamento : forma,
      valor_pago: pago ? (valorPago ?? atual.valor_pago ?? atual.valor) : null,
      pago_em: pago ? agora : null,
      pago_por: pago ? (usuario?.uid ?? "local") : null,
      pago_por_nome: pago ? (nomeSessao || usuario?.uid || "local") : null,
      atualizado_em: agora,
    };
    await upsertEncomenda(row);
    setEncomendas((xs) => xs.map((x) => x.id === id ? row : x));
    await anotar("editar", "encomendas", id, pago ? `Marcou encomenda de ${atual.cliente} como paga` : `Marcou encomenda de ${atual.cliente} como a pagar`);
  }, [encomendas, usuario, anotar, nomeSessao]);

  const excluirEncomenda = useCallback(async (id: string) => {
    const atual = encomendas.find((x) => x.id === id);
    if (!atual) return;
    await upsertEncomenda({ ...autoriaAtualizacao(atual, usuario), excluido: true, atualizado_em: agoraIso() });
    const lista = encomendas.filter((x) => x.id !== id);
    setEncomendas(lista);
    await anotar("excluir", "encomendas", id, `Excluiu encomenda de ${atual.cliente}`);
    await agendarLembretesEncomendas(lista, prefsNotificacao);
  }, [encomendas, usuario, anotar, prefsNotificacao]);

  const salvarPrefs = useCallback(async (prefs: PrefsNotificacao) => {
    await salvarPrefsNotificacao(prefs);
    setPrefsNotificacao(prefs);
    await pedirPermissaoNotificacoes();
  }, []);

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
    setFirebaseOverride(true);
    setFirebaseCfg(c);
    if (configValida(c)) iniciarFirebase(c);
  }, []);

  const limparFirebase = useCallback(async () => {
    await limparFirebaseConfig();
    const cfg = configEfetiva(undefined);
    setFirebaseOverride(false);
    setFirebaseCfg(cfg);
    try { iniciarFirebase(cfg); } catch { /* ignore */ }
  }, []);

  const entrarNaNuvem = useCallback(async (nome: string, pin: string) => {
    if (!firebaseCfg || !configValida(firebaseCfg)) throw new Error("A configuração da nuvem não está disponível.");
    iniciarFirebase(firebaseCfg);
    const estado = await entrarComPin(nome, pin);
    setEquipe(estado);
    setEhDono(Boolean(estado.ehLider));
    setBloqueado(Boolean(estado.bloqueado));
    if (estado.codigoRecuperacao) setCodigoRecuperacao(estado.codigoRecuperacao);
    await recarregar();
    return { primeiraVez: estado.primeiraVez, codigoRecuperacao: estado.codigoRecuperacao };
  }, [firebaseCfg, recarregar]);

  const recuperarLider = useCallback(async (nome: string, pin: string, codigo: string) => {
    if (!firebaseCfg || !configValida(firebaseCfg)) throw new Error("A configuração da nuvem não está disponível.");
    iniciarFirebase(firebaseCfg);
    const estado = await recuperarLideranca(nome, pin, codigo);
    setEquipe(estado);
    setEhDono(true);
    setBloqueado(false);
    setCodigoRecuperacao(codigo.trim().toUpperCase());
    await recarregar();
  }, [firebaseCfg, recarregar]);

  const tentarSync = useCallback(async () => {
    if (!usuario || !online || !configValida(firebaseCfg)) return;
    setSyncando(true); setErroSync(undefined);
    const desde = await getMeta<string>("ultimo_sync");
    try {
      const estado = await sincronizar(LOJA_NUVEM_ID, usuario, setProgressoSync);
      setEquipe(estado);
      setEhDono(estado.ehDono || estado.ehLider);
      setBloqueado(estado.bloqueado);
      await recarregar();
      const [en, mem, v, prefs] = await Promise.all([
        listarEncomendas(), listarMembros(), listarVendas(), carregarPrefsNotificacao(),
      ]);
      setPrefsNotificacao(prefs);
      await avisarEncomendasNovas(en, prefs, usuario.uid);
      await agendarLembretesEncomendas(en, prefs);
      await avisarNovosMembros(mem, prefs, Boolean(estado.ehLider || estado.ehDono), usuario.uid);
      await avisarAlteracoesOutros(v, en, prefs, usuario.uid, desde);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na sincronização.";
      setErroSync(msg);
      const prefs = prefsNotificacao;
      void avisarErroSync(msg, prefs);
    } finally {
      setSyncando(false);
    }
  }, [usuario, online, firebaseCfg, recarregar, prefsNotificacao]);

  useEffect(() => {
    if (usuario && online && pronto && temDados) void tentarSync();
  }, [usuario, online, pronto, temDados]); // eslint-disable-line

  useEffect(() => {
    if (!pronto || !temDados) return;
    void (async () => {
      await pedirPermissaoNotificacoes();
      await agendarLembretesEncomendas(encomendas, prefsNotificacao);
      await avisarBackupSePreciso(prefsNotificacao, temDados);
    })();
  }, [pronto, temDados, encomendas, prefsNotificacao]);

  const agregados = useMemo(() => agregarVendas(vendas), [vendas]);

  const value = useMemo<Store>(() => ({
    pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, confirmarEncomenda, cancelarEncomenda, marcarPagamentoEncomenda, excluirEncomenda, prefsNotificacao, salvarPrefs,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, limparFirebase, firebaseOverride, usuario, online, syncando, progressoSync, erroSync, tentarSync, entrarNaNuvem, recuperarLider, codigoRecuperacao,
    ehDono, bloqueado, membros, atividades, equipe, agregados,
  }), [pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, confirmarEncomenda, cancelarEncomenda, marcarPagamentoEncomenda, excluirEncomenda, prefsNotificacao, salvarPrefs,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, limparFirebase, firebaseOverride, usuario, online, syncando, progressoSync, erroSync, tentarSync, entrarNaNuvem, recuperarLider, codigoRecuperacao,
    ehDono, bloqueado, membros, atividades, equipe, agregados]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do provider");
  return s;
}

export { montarBackup, exportarDados, verificarBackupOficial, marcarBackupFeito };
