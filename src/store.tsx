import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ouvirAuth, sairAuth, usuarioAtual, type NuvemUser } from "./lib/supabase";
import {
  bancoTemDados,
  exportarDados,
  getSupabaseConfig,
  limparSupabaseConfig,
  getMeta,
  importarDados,
  listarAtividades,
  listarCobrancas,
  listarEncomendas,
  listarEntregas,
  listarMembros,
  listarPendentes,
  listarProdutos,
  listarReabastecimentos,
  listarVendas,
  obterConfig,
  aoHaverPendente,
  salvarConfig,
  upsertAtividade,
  setSupabaseConfig,
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
import { NOME_LOJA_PADRAO } from "./lib/marca";
import { PREFS_NOTIFICACAO_PADRAO, type EstadoEquipe, type Atividade, Cobranca, ConfiguracaoLoja, Encomenda, Entrega, FormaCobranca, SupabaseWebConfig, MembroLoja, Produto, Reabastecimento, StatusEntrega, Venda } from "./lib/types";
import { configEfetiva, configValida, iniciarSupabase } from "./lib/supabase";
import { enviarPendentes, estadoEquipeLocal, obterCursorSync, ouvirLoja, sincronizar, type MudancaNuvem, type ProgressoSync } from "./lib/sync";
import { isPermissionDenied, mensagemErroSync, rotuloOperacao } from "./lib/errosSync";
import { atualizarPresenca, ouvirMembros } from "./lib/presencaNuvem";
import { INTERVALO_PRESENCA_MS } from "./lib/presenca";
import { entrarComNome, isNaoEMembroError, nomePadraoAparelho, recuperarLideranca, verificarParticipacao } from "./lib/acesso";
import { LOJA_NUVEM_ID } from "./lib/supabasePadrao";
import { calcularReabastecimento } from "./lib/reabastecimento";
import { acrescentarVendaAgregados, agregarVendas, type AgregadosVendas } from "./lib/agregados";
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
  registrarVenda: (valor: number, id?: string) => Promise<Venda>;
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
  firebaseCfg?: SupabaseWebConfig;
  salvarFirebase: (c: SupabaseWebConfig) => Promise<void>;
  limparFirebase: () => Promise<void>;
  firebaseOverride: boolean;
  usuario: NuvemUser | null;
  online: boolean;
  syncando: boolean;
  progressoSync?: ProgressoSync;
  erroSync?: string;
  pendentesCount: number;
  ultimoSync?: string;
  precisaReentrarPin: boolean;
  nomeReingresso: string;
  tentarSync: () => Promise<void>;
  statusNuvem: "offline" | "sincronizando" | "sincronizado" | "pendente" | "erro";
  avisoImportados?: string;
  entrarNaNuvem: (nome: string) => Promise<{ primeiraVez: boolean; codigoRecuperacao?: string; retidosImportados?: number }>;
  recuperarLider: (nome: string, codigo: string) => Promise<void>;
  sairDaNuvem: () => Promise<void>;
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
  nome_loja: NOME_LOJA_PADRAO,
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
  const [firebaseCfg, setFirebaseCfg] = useState<SupabaseWebConfig>();
  const [firebaseOverride, setFirebaseOverride] = useState(false);
  const [usuario, setUsuario] = useState<NuvemUser | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncando, setSyncando] = useState(false);
  const [progressoSync, setProgressoSync] = useState<ProgressoSync>();
  const [erroSync, setErroSync] = useState<string>();
  const [pendentesCount, setPendentesCount] = useState(0);
  const [ultimoSync, setUltimoSync] = useState<string>();
  const [cursorOuvir, setCursorOuvir] = useState<string | null>(null);
  const [precisaReentrarPin, setPrecisaReentrarPin] = useState(false);
  const [ehDono, setEhDono] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [membros, setMembros] = useState<MembroLoja[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [equipe, setEquipe] = useState<EstadoEquipe>();
  const [codigoRecuperacao, setCodigoRecuperacao] = useState<string>();
  const [prefsNotificacao, setPrefsNotificacao] = useState<PrefsNotificacao>(PREFS_NOTIFICACAO_PADRAO);
  const [avisoImportados, setAvisoImportados] = useState<string>();

  const recarregar = useCallback(async () => {
    const tem = await bancoTemDados();
    setTemDados(tem);
    const salva = await getSupabaseConfig();
    const cfgFb = configEfetiva(salva);
    setFirebaseOverride(configValida(salva) && Boolean(salva));
    setFirebaseCfg(cfgFb);
    try { iniciarSupabase(cfgFb); } catch { /* ignore */ }
    const [eqPre, codigoPre] = await Promise.all([
      estadoEquipeLocal(), getMeta<string>("codigo_recuperacao"),
    ]);
    setEquipe(eqPre);
    setCodigoRecuperacao(codigoPre);
    setEhDono(Boolean(eqPre?.ehDono || eqPre?.ehLider));
    setBloqueado(Boolean(eqPre?.bloqueado));
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
    const [pend, ult] = await Promise.all([listarPendentes(), getMeta<string>("ultimo_sync")]);
    setPendentesCount(pend.length);
    setUltimoSync(ult || undefined);
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
      iniciarSupabase(firebaseCfg);
      return ouvirAuth(setUsuario);
    } catch { return; }
  }, [firebaseCfg]);

  const tentarSyncRef = useRef<() => Promise<void>>(async () => {});
  const importarArquivo = useCallback(async (raw: unknown, substituir = false) => {
    const backup = parseBackup(raw);
    const dados = normalizarBackup(backup);
    await importarDados(dados, substituir);
    await recarregar();
    if (usuario && online && configValida(firebaseCfg)) {
      void tentarSyncRef.current();
    }
    return dados;
  }, [recarregar, usuario, online, firebaseCfg]);


  const anotar = useCallback(async (acao: "criar" | "editar" | "excluir", colecao: string, registroId: string, resumo: string) => {
    const a = montarAtividade(loja, usuario, acao, colecao, registroId, resumo);
    await upsertAtividade(a);
    setAtividades((xs) => [a, ...xs].slice(0, 500));
  }, [loja, usuario]);

  const usuarioDaSessao = () => {
    if (usuario) return usuario;
    return null;
  };

  const registrarVenda = useCallback(async (valor: number, idPrevio?: string) => {
    const v: Venda = { id: idPrevio || gerarId(), loja, valor, criado_em: agoraIso(), atualizado_em: agoraIso(), ...autoriaNova(usuarioDaSessao()) };
    setVendas((xs) => xs.some((x) => x.id === v.id) ? xs : [v, ...xs]);
    void upsertVenda(v)
      .then(() => anotar("criar", "vendas", v.id, `Venda de ${valor.toFixed(2)}`))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Não foi possível gravar a venda neste aparelho.";
        console.error("gravar venda", e);
        setErroSync(msg);
      });
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

  const salvarFirebase = useCallback(async (c: SupabaseWebConfig) => {
    await setSupabaseConfig(c);
    setFirebaseOverride(true);
    setFirebaseCfg(c);
    if (configValida(c)) iniciarSupabase(c);
  }, []);

  const limparFirebase = useCallback(async () => {
    await limparSupabaseConfig();
    const cfg = configEfetiva(undefined);
    setFirebaseOverride(false);
    setFirebaseCfg(cfg);
    try { iniciarSupabase(cfg); } catch { /* ignore */ }
  }, []);

  const nomeReingresso = (equipe?.meuNome || usuario?.displayName || "").trim();

  const pedirReingresso = useCallback((motivo?: string) => {
    setPrecisaReentrarPin(true);
    setErroSync(motivo || "Este aparelho não está reconhecido na loja da nuvem. Entre de novo com o mesmo nome.");
  }, []);

  const conferirParticipacao = useCallback(async (uid: string): Promise<boolean> => {
    try {
      const st = await verificarParticipacao(uid);
      if (st === "ausente") {
        pedirReingresso();
        return false;
      }
      if (st === "bloqueado") {
        setBloqueado(true);
        setPrecisaReentrarPin(false);
        return false;
      }
      setPrecisaReentrarPin(false);
      return true;
    } catch (e) {
      if (isPermissionDenied(e) || isNaoEMembroError(e)) {
        pedirReingresso(isNaoEMembroError(e) ? (e as Error).message : mensagemErroSync(e, "abrir a loja na nuvem"));
        return false;
      }
      throw e;
    }
  }, [pedirReingresso]);

  const entrarNaNuvem = useCallback(async (nome: string) => {
    if (!firebaseCfg || !configValida(firebaseCfg)) throw new Error("A configuração da nuvem não está disponível.");
    iniciarSupabase(firebaseCfg);
    const estadoPin = await entrarComNome(nome);
    setEquipe(estadoPin);
    setEhDono(Boolean(estadoPin.ehLider));
    setBloqueado(Boolean(estadoPin.bloqueado));
    if (estadoPin.codigoRecuperacao) setCodigoRecuperacao(estadoPin.codigoRecuperacao);
    const user = await usuarioAtual();
    if (user) setUsuario(user);
    setPrecisaReentrarPin(false);
    let retidosImportados = 0;
    if (user && navigator.onLine) {
      setSyncando(true); setErroSync(undefined);
      try {
        const estado = await sincronizar(LOJA_NUVEM_ID, user, setProgressoSync);
        const { retidosImportados: retidos, enviadosMerge: _e, ...eq } = estado;
        retidosImportados = retidos;
        setEquipe(eq);
        setEhDono(eq.ehDono || eq.ehLider);
        setBloqueado(eq.bloqueado);
        if (retidos > 0) {
          setAvisoImportados("Este aparelho tem um histórico antigo que só o Admin pode enviar à nuvem. Peça ao Admin para entrar primeiro e enviar o histórico. Os registros continuam neste aparelho.");
        } else {
          setAvisoImportados(undefined);
        }
      } catch (e) {
        if (isNaoEMembroError(e) || isPermissionDenied(e)) {
          const aindaMembro = await conferirParticipacao(user.uid);
          if (!aindaMembro) throw (e instanceof Error ? e : new Error(mensagemErroSync(e, "sincronizar com a nuvem")));
          setErroSync(mensagemErroSync(e, "sincronizar com a nuvem"));
        } else {
          setErroSync(mensagemErroSync(e, "sincronizar com a nuvem"));
        }
      } finally {
        setSyncando(false);
      }
    }
    await recarregar();
    const cursorEntrada = await obterCursorSync();
    setCursorOuvir((atual) => (atual ? atual : (cursorEntrada ?? "")));
    return { primeiraVez: estadoPin.primeiraVez, codigoRecuperacao: estadoPin.codigoRecuperacao, retidosImportados };
  }, [firebaseCfg, recarregar, conferirParticipacao]);

  // 1.9.1: entrada automática e silenciosa na loja (sem tela de nome).
  const entrandoRef = useRef(false);
  const [tentativaEntrada, setTentativaEntrada] = useState(0);
  useEffect(() => {
    if (!pronto || !firebaseCfg || !configValida(firebaseCfg)) return;
    if (equipe && !precisaReentrarPin) return;
    if (!online || entrandoRef.current) return;
    entrandoRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const salvo = ((await getMeta("meu_nome")) as string | undefined)?.trim();
        const nome = salvo && salvo.length >= 2 ? salvo : nomePadraoAparelho();
        await entrarNaNuvem(nome);
        setErroSync(undefined);
      } catch (e) {
        setErroSync(`Sem conexão com a loja na nuvem: ${mensagemErroSync(e, "entrar na nuvem")} (tentando de novo sozinho)`);
        timer = setTimeout(() => setTentativaEntrada((n) => n + 1), 30_000);
      } finally {
        entrandoRef.current = false;
      }
    })();
    return () => { if (timer) clearTimeout(timer); };
  }, [pronto, firebaseCfg, equipe, precisaReentrarPin, online, tentativaEntrada, entrarNaNuvem]);

  // Instalação limpa: começa vazia e baixa o histórico da nuvem (sem tela inicial).
  const iniciandoVazioRef = useRef(false);
  useEffect(() => {
    if (!pronto || temDados || iniciandoVazioRef.current) return;
    iniciandoVazioRef.current = true;
    void importarArquivo({
      formato: "controle-de-vendas-backup", versao: 1, loja: "loja",
      configuracao: { nome_loja: NOME_LOJA_PADRAO },
      vendas: [], produtos: [], entregas: [], encomendas: [], cobrancas: [], reabastecimentos: [],
    }).catch(() => { iniciandoVazioRef.current = false; });
  }, [pronto, temDados, importarArquivo]);

  const recuperarLider = useCallback(async (nome: string, codigo: string) => {
    if (!firebaseCfg || !configValida(firebaseCfg)) throw new Error("A configuração da nuvem não está disponível.");
    iniciarSupabase(firebaseCfg);
    const estadoRec = await recuperarLideranca(nome, codigo);
    setEquipe(estadoRec);
    setEhDono(true);
    setBloqueado(false);
    setCodigoRecuperacao(codigo.trim().toUpperCase());
    const user = await usuarioAtual();
    if (user) setUsuario(user);
    if (user && navigator.onLine) {
      setSyncando(true);
      try {
        const estado = await sincronizar(LOJA_NUVEM_ID, user, setProgressoSync);
        const { retidosImportados, enviadosMerge: _e, ...eq } = estado;
        setEquipe(eq);
        if (retidosImportados > 0) {
          setAvisoImportados("Este aparelho tem um histórico antigo que só o Admin pode enviar à nuvem. Peça ao Admin para entrar primeiro e enviar o histórico. Os registros continuam neste aparelho.");
        }
      } finally { setSyncando(false); }
    }
    await recarregar();
    const cursorRec = await obterCursorSync();
    setCursorOuvir((atual) => (atual ? atual : (cursorRec ?? "")));
  }, [firebaseCfg, recarregar]);

  const tentarSync = useCallback(async () => {
    if (!usuario || !online || !configValida(firebaseCfg) || precisaReentrarPin) return;
    if (!(await conferirParticipacao(usuario.uid))) return;
    setSyncando(true); setErroSync(undefined);
    const desde = await getMeta<string>("ultimo_sync");
    try {
      const { retidosImportados, enviadosMerge: _enviados, ...estado } = await sincronizar(LOJA_NUVEM_ID, usuario, setProgressoSync);
      setEquipe(estado);
      setEhDono(estado.ehDono || estado.ehLider);
      setBloqueado(estado.bloqueado);
      if (retidosImportados > 0) {
        setAvisoImportados("Este aparelho tem um histórico antigo que só o Admin pode enviar à nuvem. Peça ao Admin para entrar primeiro e enviar o histórico. Os registros continuam neste aparelho.");
      }
      await recarregar();
      const cursor = await obterCursorSync();
      setCursorOuvir((atual) => (atual ? atual : (cursor ?? "")));
      if (cursor) setUltimoSync(cursor);
      const [en, mem, v, prefs] = await Promise.all([
        listarEncomendas(), listarMembros(), listarVendas(), carregarPrefsNotificacao(),
      ]);
      setPrefsNotificacao(prefs);
      await avisarEncomendasNovas(en, prefs, usuario.uid);
      await agendarLembretesEncomendas(en, prefs);
      await avisarNovosMembros(mem, prefs, Boolean(estado.ehLider || estado.ehDono), usuario.uid);
      await avisarAlteracoesOutros(v, en, prefs, usuario.uid, desde);
    } catch (e) {
      if (isNaoEMembroError(e) || isPermissionDenied(e)) {
        const aindaMembro = await conferirParticipacao(usuario.uid);
        if (!aindaMembro) return;
        const msg = isNaoEMembroError(e) ? (e as Error).message : mensagemErroSync(e, "sincronizar com a nuvem");
        setErroSync(msg);
        void avisarErroSync(msg, prefsNotificacao);
      } else {
        const msg = mensagemErroSync(e, "sincronizar com a nuvem");
        setErroSync(msg);
        const prefs = prefsNotificacao;
        void avisarErroSync(msg, prefs);
      }
    } finally {
      setSyncando(false);
    }
  }, [usuario, online, firebaseCfg, recarregar, prefsNotificacao, precisaReentrarPin, conferirParticipacao, pedirReingresso]);
  tentarSyncRef.current = tentarSync;

  const sairDaNuvem = useCallback(async () => {
    if (firebaseCfg && configValida(firebaseCfg)) {
      try { await sairAuth(); } catch { /* ignore */ }
    }
    await setMeta("equipe", null);
    setEquipe(undefined);
    setUsuario(null);
    setEhDono(false);
    setBloqueado(false);
  }, [firebaseCfg]);

  const enviandoRef = useRef(false);
  const reenviarRef = useRef(false);
  const enviarAgora = useCallback(() => {
    if (!navigator.onLine) return;
    if (enviandoRef.current) {
      reenviarRef.current = true;
      return;
    }
    enviandoRef.current = true;
    void (async () => {
      try {
        let user = usuario;
        if (!user) {
          try { user = await usuarioAtual(); } catch { user = null; }
        }
        if (!user) return;
        try {
          const eq = await estadoEquipeLocal();
          const resultado = await enviarPendentes(LOJA_NUVEM_ID, Boolean(eq?.ehDono || eq?.ehLider));
          const [pend, ult] = await Promise.all([listarPendentes(), getMeta<string>("ultimo_sync")]);
          setPendentesCount(pend.length);
          if (ult) setUltimoSync(ult);
          if (resultado.recusados.length) {
            const primeira = resultado.recusados[0];
            const msg = primeira.motivo || mensagemErroSync(new Error("permission-denied"), rotuloOperacao(primeira.colecao, primeira.id));
            setErroSync(resultado.recusados.length === 1 ? msg : `${msg} Outras ${resultado.recusados.length - 1} alterações também foram recusadas e ficaram neste aparelho.`);
            void conferirParticipacao(user.uid);
          } else {
            setErroSync(undefined);
          }
        } catch (e) {
          if (isNaoEMembroError(e) || isPermissionDenied(e)) {
            const aindaMembro = await conferirParticipacao(user.uid);
            if (!aindaMembro) return;
            const msg = isNaoEMembroError(e) ? (e as Error).message : mensagemErroSync(e, "enviar as alterações");
            console.error("envio pendentes", e);
            setErroSync(msg);
          } else {
            const msg = mensagemErroSync(e, "enviar as alterações");
            console.error("envio pendentes", e);
            setErroSync(msg);
          }
          const pend = await listarPendentes().catch(() => []);
          setPendentesCount(pend.length);
        }
      } finally {
        enviandoRef.current = false;
        if (reenviarRef.current) {
          reenviarRef.current = false;
          enviarAgora();
        }
      }
    })();
  }, [usuario, conferirParticipacao, pedirReingresso]);

  useEffect(() => {
    aoHaverPendente(() => { enviarAgora(); });
    return () => aoHaverPendente(undefined);
  }, [enviarAgora]);

  useEffect(() => {
    if (usuario && online && pronto && (temDados || equipe) && !precisaReentrarPin) void tentarSync();
  }, [usuario, online, pronto, temDados]); // eslint-disable-line

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && usuario && navigator.onLine) void tentarSync();
    };
    const aoOnline = () => { if (usuario) void tentarSync(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoOnline);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoOnline);
    };
  }, [usuario, tentarSync]);


  const aplicarMudancaNuvem = useCallback((mudanca?: MudancaNuvem) => {
    if (!mudanca) {
      void recarregar();
      return;
    }
    if (mudanca.colecao === "vendas") {
      setVendas((xs) => {
        const mapa = new Map(xs.map((x) => [x.id, x]));
        for (const r of mudanca.registros) {
          const v = r as import("./lib/types").Venda;
          if (v.excluido) mapa.delete(v.id);
          else mapa.set(v.id, v);
        }
        return [...mapa.values()].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
      });
      void listarPendentes().then((pend) => setPendentesCount(pend.length)).catch(() => undefined);
      return;
    }
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    if (!usuario || !pronto) return;
    let cancel = false;
    void obterCursorSync().then((c) => {
      if (!cancel) setCursorOuvir((atual) => (atual ? atual : (c ?? "")));
    });
    return () => { cancel = true; };
  }, [usuario, pronto]);

  useEffect(() => {
    if (!usuario || !pronto || !firebaseCfg || cursorOuvir === null || precisaReentrarPin) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = ouvirLoja(
        LOJA_NUVEM_ID,
        (mudanca) => { aplicarMudancaNuvem(mudanca); },
        (e) => {
          const msg = mensagemErroSync(e, rotuloOperacao("escuta"));
          if (isPermissionDenied(e)) void conferirParticipacao(usuario.uid);
          else setErroSync(msg);
        },
        cursorOuvir || undefined,
      );
    } catch (e) {
      const msg = mensagemErroSync(e, rotuloOperacao("escuta"));
      if (isPermissionDenied(e) || isNaoEMembroError(e)) void conferirParticipacao(usuario.uid);
      else setErroSync(msg);
    }
    return () => { unsub?.(); };
  }, [usuario, pronto, firebaseCfg, cursorOuvir, aplicarMudancaNuvem, precisaReentrarPin, conferirParticipacao]);

  useEffect(() => {
    if (!usuario || !online || !pronto || !temDados || !firebaseCfg || precisaReentrarPin) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = ouvirMembros((lista) => setMembros(lista));
    } catch { /* ainda sem permissão ou firebase */ }
    const pulsar = () => {
      if (document.visibilityState !== "visible") return;
      void atualizarPresenca(usuario.uid).then((em) => {
        setMembros((xs) => xs.map((m) => m.uid === usuario.uid ? { ...m, ultimoAcesso: em } : m));
      }).catch((e) => { if (isPermissionDenied(e)) void conferirParticipacao(usuario.uid); });
    };
    pulsar();
    const id = window.setInterval(pulsar, INTERVALO_PRESENCA_MS);
    document.addEventListener("visibilitychange", pulsar);
    return () => {
      unsub?.();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", pulsar);
    };
  }, [usuario, online, pronto, temDados, firebaseCfg, precisaReentrarPin, conferirParticipacao]);


  useEffect(() => {
    if (!pronto || !temDados) return;
    void (async () => {
      await pedirPermissaoNotificacoes();
      await agendarLembretesEncomendas(encomendas, prefsNotificacao);
      await avisarBackupSePreciso(prefsNotificacao, temDados);
    })();
  }, [pronto, temDados, encomendas, prefsNotificacao]);

  const agregadosRef = useRef<AgregadosVendas | null>(null);
  const vendasAgRef = useRef<Venda[]>([]);
  const agregados = useMemo(() => {
    const prev = vendasAgRef.current;
    const agPrev = agregadosRef.current;
    const acrescentouUma = Boolean(
      agPrev && vendas.length === prev.length + 1 && vendas[0] && vendas.slice(1).every((v, i) => v === prev[i]),
    );
    const next = acrescentouUma ? acrescentarVendaAgregados(agPrev!, vendas[0]) : agregarVendas(vendas);
    agregadosRef.current = next;
    vendasAgRef.current = vendas;
    return next;
  }, [vendas]);

  const statusNuvem = !online
    ? "offline" as const
    : syncando
      ? "sincronizando" as const
      : erroSync
        ? "erro" as const
        : pendentesCount > 0
          ? "pendente" as const
          : "sincronizado" as const;


  const value = useMemo<Store>(() => ({
    pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, confirmarEncomenda, cancelarEncomenda, marcarPagamentoEncomenda, excluirEncomenda, prefsNotificacao, salvarPrefs,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, limparFirebase, firebaseOverride, usuario, online, syncando, progressoSync, erroSync, pendentesCount, ultimoSync, precisaReentrarPin, nomeReingresso, tentarSync, statusNuvem, avisoImportados, entrarNaNuvem, recuperarLider, sairDaNuvem, codigoRecuperacao,
    ehDono, bloqueado, membros, atividades, equipe, agregados,
  }), [pronto, temDados, loja, config, vendas, produtos, entregas, encomendas, cobrancas, reabastecimentos,
    recarregar, importarArquivo, registrarVenda, excluirVenda, salvarProduto, excluirProduto,
    salvarEntrega, statusEntrega, excluirEntrega, salvarEncomenda, concluirEncomenda, confirmarEncomenda, cancelarEncomenda, marcarPagamentoEncomenda, excluirEncomenda, prefsNotificacao, salvarPrefs,
    registrarReabastecimento, excluirReabastecimento, registrarCobranca, confirmarCobranca, cancelarCobranca,
    atualizarConfig, firebaseCfg, salvarFirebase, limparFirebase, firebaseOverride, usuario, online, syncando, progressoSync, erroSync, pendentesCount, ultimoSync, precisaReentrarPin, nomeReingresso, tentarSync, statusNuvem, avisoImportados, entrarNaNuvem, recuperarLider, sairDaNuvem, codigoRecuperacao,
    ehDono, bloqueado, membros, atividades, equipe, agregados]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do provider");
  return s;
}

export { montarBackup, exportarDados, verificarBackupOficial, marcarBackupFeito };
