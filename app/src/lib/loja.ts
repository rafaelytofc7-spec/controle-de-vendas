import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supa } from "./supa";
import { ler, gravar } from "./persist";
import { CODIGO_ENTRADA, LOJA, PLATAFORMA, VERSAO_CODE } from "./config";
import { custoEfetivo, custoMedioNovo } from "./calc";
import { novoId } from "./util";
import type {
  Aparelho, AppVersao, Codigo, Configuracao, Custo, Entrada, EntradaItem, Fornecedor, Op, Papel, Produto, TipoOp, Venda, VendaItem,
} from "./tipos";

export type Fase = "iniciando" | "precisa_codigo" | "pronto" | "bloqueado_versao" | "aparelho_bloqueado";

export interface Estado {
  fase: Fase;
  uid: string | null;
  papel: Papel | null;
  meuNome: string;
  produtos: Record<string, Produto>;
  codigos: Record<string, Codigo>;
  custos: Record<string, Custo>;
  fornecedores: Record<string, Fornecedor>;
  vendas: Record<string, Venda>;
  itens: Record<string, VendaItem>;
  entradas: Record<string, Entrada>;
  entradaItens: Record<string, EntradaItem>;
  aparelhos: Record<string, Aparelho>;
  config: Configuracao | null;
  versao: Record<string, AppVersao>;
  fila: Op[];
  online: boolean;
  tempoReal: boolean;
  enviando: boolean;
  ultimoErro: string | null;
  erroEntrada: string | null;
  ultimaSync: string | null;
}

const vazio = (): Estado => ({
  fase: "iniciando", uid: null, papel: null, meuNome: "",
  produtos: {}, codigos: {}, custos: {}, fornecedores: {}, vendas: {}, itens: {}, entradas: {}, entradaItens: {},
  aparelhos: {}, config: null, versao: {}, fila: [],
  online: typeof navigator === "undefined" ? true : navigator.onLine, tempoReal: false, enviando: false,
  ultimoErro: null, erroEntrada: null, ultimaSync: null,
});

let estado: Estado = vazio();
const ouvintes = new Set<() => void>();
function emitir() { for (const f of ouvintes) f(); }
function set(p: Partial<Estado>) { estado = { ...estado, ...p }; emitir(); agendarGravar(); }
export function getEstado() { return estado; }
export function useLoja<T>(sel: (e: Estado) => T): T {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => sel(estado), () => sel(estado));
}

// ---------- persistência local ----------
const CHAVE = `estado-${LOJA}`;
let tGravar = 0;
function agendarGravar() {
  clearTimeout(tGravar);
  tGravar = window.setTimeout(() => {
    const { fase: _f, online: _o, tempoReal: _t, enviando: _e, erroEntrada: _x, ...resto } = estado;
    void gravar(CHAVE, resto);
  }, 300);
}
// a fila é gravada na hora (não pode se perder se o app fechar)
async function gravarFila() { await gravar(`fila-${LOJA}`, estado.fila); }

// ---------- utilidades ----------
const DIAS_VENDAS = 35;
const desde = (dias: number) => new Date(Date.now() - dias * 86400_000).toISOString();
const porChave = <T,>(arr: T[], k: (x: T) => string) => Object.fromEntries(arr.map((x) => [k(x), x])) as Record<string, T>;

async function buscarTudo<T>(tabela: string, montar: (q: any) => any = (q) => q): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(supa().from(tabela).select("*").eq("loja_id", LOJA)).range(de, de + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function msgErro(e: unknown): string {
  if (!e) return "erro";
  const o = e as { message?: string; details?: string; hint?: string; code?: string };
  return o.message || o.details || String(e);
}
function ehErroDeRede(e: unknown): boolean {
  const m = msgErro(e);
  return /fetch|network|Failed|timeout|Load failed|NetworkError|ECONN|503|502|504|JWT|sem_login/i.test(m) || (typeof navigator !== "undefined" && !navigator.onLine);
}

// ---------- início ----------
let iniciado = false;
export async function iniciar(codigo?: string): Promise<void> {
  if (!iniciado) {
    iniciado = true;
    const salvo = await ler<Partial<Estado>>(CHAVE);
    const fila = (await ler<Op[]>(`fila-${LOJA}`)) ?? [];
    if (salvo) estado = { ...estado, ...salvo, fila, fase: "iniciando" };
    else estado = { ...estado, fila };
    emitir();
    window.addEventListener("online", () => { set({ online: true }); void reconectar("online"); });
    window.addEventListener("offline", () => set({ online: false, tempoReal: false }));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reconectar("voltou"); });
    window.setInterval(() => { if (estado.fila.some((o) => !o.erro)) void enviarFila(); }, 20_000);
    window.setInterval(() => void checarVersao(), 15 * 60_000);
  }
  await entrar(codigo);
}

async function entrar(codigo?: string): Promise<void> {
  const s = supa();
  try {
    // a versão mínima é checada antes de tudo (não precisa de login)
    await checarVersao();
    if (estado.fase === "bloqueado_versao") return;
    let { data: { session } } = await s.auth.getSession();
    if (!session) {
      const r = await s.auth.signInAnonymously();
      if (r.error) {
        if (/rate limit/i.test(r.error.message)) {
          window.setTimeout(() => void entrar(codigo), 60_000);
          set({ fase: localStorage.getItem("cv3-entrou") === "1" ? "pronto" : "precisa_codigo", erroEntrada: "Muitos aparelhos entrando por esta internet agora. Tentando de novo em 1 minuto…" });
          return;
        }
        throw r.error;
      }
      session = r.data.session;
    }
    const uid = session?.user.id ?? null;
    const nomePadrao = localStorage.getItem("cv3-nome") || (PLATAFORMA === "web" ? "Computador" : "Celular");
    const { data, error } = await s.rpc("v3_entrar", {
      p_loja: LOJA, p_codigo: codigo || CODIGO_ENTRADA || null, p_nome: nomePadrao, p_plataforma: PLATAFORMA, p_versao: VERSAO_CODE,
    });
    if (error) {
      const m = msgErro(error);
      if (/codigo_invalido|sem_acesso/.test(m)) { set({ fase: "precisa_codigo", uid, erroEntrada: codigo ? "Código inválido ou vencido." : null }); return; }
      if (/bloqueado/.test(m)) { set({ fase: "aparelho_bloqueado", uid }); return; }
      if (/muitas_tentativas/.test(m)) { set({ fase: "precisa_codigo", uid, erroEntrada: "Muitas tentativas. Espere 10 minutos." }); return; }
      throw error;
    }
    const r = data as { papel: Papel; nome: string; erro?: string };
    if (!r.papel) { set({ fase: "precisa_codigo", uid, erroEntrada: codigo || CODIGO_ENTRADA ? "Código inválido ou vencido." : null }); return; }
    localStorage.setItem("cv3-entrou", "1");
    set({ fase: "pronto", uid, papel: r.papel, meuNome: r.nome, erroEntrada: r.erro ? "Código inválido ou vencido." : null, online: true });
    await carregar();
    assinar();
    void enviarFila();
  } catch (e) {
    // sem internet: se já entrou antes, abre com os dados locais
    if (localStorage.getItem("cv3-entrou") === "1") {
      set({ fase: "pronto", online: false, ultimoErro: ehErroDeRede(e) ? null : msgErro(e) });
      window.setTimeout(() => void reconectar("tentar"), 8000);
    } else {
      set({ fase: "precisa_codigo", erroEntrada: ehErroDeRede(e) ? "Sem internet. Conecte para ligar o aparelho pela primeira vez." : msgErro(e) });
    }
  }
}

export async function usarCodigo(codigo: string): Promise<string | null> {
  const antes = estado.papel;
  await entrar(codigo.trim());
  if (estado.erroEntrada) return estado.erroEntrada;
  if (estado.fase === "pronto" && antes === "caixa" && estado.papel === "caixa") return "Código inválido ou vencido.";
  return null;
}

export async function checarVersao(): Promise<void> {
  try {
    const { data, error } = await supa().from("v3_app_versao").select("*");
    if (error) return;
    const versao = porChave(data as AppVersao[], (v) => v.plataforma);
    const v = versao[PLATAFORMA];
    if (v && v.minima > VERSAO_CODE) set({ versao, fase: "bloqueado_versao" });
    else {
      const era = estado.fase === "bloqueado_versao";
      set({ versao, fase: era ? "iniciando" : estado.fase });
      if (era) void entrar();
    }
  } catch { /* offline */ }
}

export async function carregar(): Promise<void> {
  const [produtos, codigos, custos, fornecedores, aparelhos, configs] = await Promise.all([
    buscarTudo<Produto>("v3_produtos"), buscarTudo<Codigo>("v3_produto_codigos"), buscarTudo<Custo>("v3_produto_custos"),
    buscarTudo<Fornecedor>("v3_fornecedores"), buscarTudo<Aparelho>("v3_aparelhos"), buscarTudo<Configuracao>("v3_configuracao"),
  ]);
  const vendas = await buscarTudo<Venda>("v3_vendas", (q) => q.gte("criado_em", desde(DIAS_VENDAS)).order("criado_em", { ascending: false }));
  const comItens = vendas.filter((v) => v.tem_itens).map((v) => v.id);
  const itens: VendaItem[] = [];
  for (let i = 0; i < comItens.length; i += 150) {
    itens.push(...(await buscarTudo<VendaItem>("v3_venda_itens", (q) => q.in("venda_id", comItens.slice(i, i + 150)))));
  }
  const entradas = await buscarTudo<Entrada>("v3_entradas", (q) => q.gte("data", desde(90)));
  const entIds = entradas.map((e) => e.id);
  const entradaItens: EntradaItem[] = [];
  for (let i = 0; i < entIds.length; i += 150) {
    entradaItens.push(...(await buscarTudo<EntradaItem>("v3_entrada_itens", (q) => q.in("entrada_id", entIds.slice(i, i + 150)))));
  }
  // mantém o que ainda está na fila (pendente) por cima do que veio do servidor
  const pendVendas = Object.values(estado.vendas).filter((v) => v.pendente);
  const pendEntradas = Object.values(estado.entradas).filter((v) => v.pendente);
  const me = aparelhos.find((a) => a.uid === estado.uid);
  set({
    produtos: porChave(produtos, (p) => p.id), codigos: porChave(codigos, (c) => c.codigo), custos: porChave(custos, (c) => c.produto_id),
    fornecedores: porChave(fornecedores, (f) => f.id), aparelhos: porChave(aparelhos, (a) => a.uid), config: configs[0] ?? null,
    vendas: { ...porChave(vendas, (v) => v.id), ...porChave(pendVendas, (v) => v.id) },
    itens: { ...porChave(itens, (i) => i.id), ...porChave(Object.values(estado.itens).filter((i) => estado.vendas[i.venda_id]?.pendente), (i) => i.id) },
    entradas: { ...porChave(entradas, (e) => e.id), ...porChave(pendEntradas, (e) => e.id) },
    entradaItens: { ...porChave(entradaItens, (i) => i.id), ...porChave(Object.values(estado.entradaItens).filter((i) => estado.entradas[i.entrada_id]?.pendente), (i) => i.id) },
    papel: me?.papel ?? estado.papel, meuNome: me?.nome ?? estado.meuNome,
    ultimaSync: new Date().toISOString(), ultimoErro: null,
  });
  // reaplica as operações ainda não enviadas por cima dos dados do servidor
  for (const op of estado.fila) if (!op.erro && op.tipo !== "venda" && op.tipo !== "entrada") aplicarLocal(op, false);
}

// ---------- tempo real ----------
let canal: RealtimeChannel | null = null;
let tReconectar = 0;
const TABELAS: [string, keyof Estado, (r: any) => string][] = [
  ["v3_produtos", "produtos", (r) => r.id], ["v3_produto_codigos", "codigos", (r) => r.codigo], ["v3_produto_custos", "custos", (r) => r.produto_id],
  ["v3_fornecedores", "fornecedores", (r) => r.id], ["v3_vendas", "vendas", (r) => r.id], ["v3_venda_itens", "itens", (r) => r.id],
  ["v3_entradas", "entradas", (r) => r.id], ["v3_entrada_itens", "entradaItens", (r) => r.id], ["v3_aparelhos", "aparelhos", (r) => r.uid],
];

function assinar() {
  const s = supa();
  if (canal) { void s.removeChannel(canal); canal = null; }
  let ch = s.channel(`cv3-${LOJA}-${novoId().slice(0, 8)}`);
  for (const [tabela, campo, chave] of TABELAS) {
    ch = ch.on("postgres_changes" as any, { event: "*", schema: "public", table: tabela, filter: `loja_id=eq.${LOJA}` }, (p: any) => {
      if (p.eventType === "DELETE") {
        const k = chave(p.old ?? {});
        if (k) { const m = { ...(estado[campo] as any) }; delete m[k]; set({ [campo]: m } as any); }
        return;
      }
      const row = p.new;
      const atual = { ...(estado[campo] as any) };
      atual[chave(row)] = row;
      const patch: Partial<Estado> = { [campo]: atual } as any;
      if (campo === "aparelhos" && row.uid === estado.uid) {
        patch.papel = row.papel; patch.meuNome = row.nome;
        if (row.bloqueado) patch.fase = "aparelho_bloqueado";
      }
      set(patch);
    });
  }
  ch = ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "v3_configuracao", filter: `loja_id=eq.${LOJA}` }, (p: any) => set({ config: p.new }));
  ch = ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "v3_app_versao" }, () => void checarVersao());
  canal = ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      const voltou = !estado.tempoReal;
      set({ tempoReal: true, online: true });
      if (voltou) void carregar().then(() => enviarFila()).catch(() => {});
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      set({ tempoReal: false });
      clearTimeout(tReconectar);
      tReconectar = window.setTimeout(() => void reconectar("canal"), 4000);
    }
  });
}

let reconectando = false;
export async function reconectar(_motivo: string): Promise<void> {
  if (reconectando || estado.fase === "precisa_codigo") return;
  reconectando = true;
  try {
    if (estado.fase !== "pronto" || !estado.uid) { await entrar(); return; }
    await checarVersao();
    await supa().auth.getSession();
    if (!estado.tempoReal) assinar();
    await enviarFila();
  } finally { reconectando = false; }
}

// ---------- fila de envio ----------
export function enfileirar(tipo: TipoOp, dados: Record<string, unknown>): Op {
  const op: Op = { id: novoId(), tipo, dados, criado_em: new Date().toISOString(), tentativas: 0 };
  aplicarLocal(op, true);
  set({ fila: [...estado.fila, op] });
  void gravarFila().then(() => enviarFila());
  return op;
}

async function executar(op: Op): Promise<void> {
  const s = supa(); const d = op.dados as any;
  const rpc = async (nome: string, args: Record<string, unknown>) => { const { error } = await s.rpc(nome, args); if (error) throw error; };
  switch (op.tipo) {
    case "venda": return rpc("v3_registrar_venda", { p_loja: LOJA, p: d, p_plataforma: PLATAFORMA, p_versao: VERSAO_CODE });
    case "excluir_venda": return rpc("v3_excluir_venda", { p_loja: LOJA, p_id: d.id });
    case "entrada": return rpc("v3_registrar_entrada", { p_loja: LOJA, p: d, p_plataforma: PLATAFORMA, p_versao: VERSAO_CODE });
    case "produto": return rpc("v3_salvar_produto", { p_loja: LOJA, p: d });
    case "codigo": return rpc("v3_vincular_codigo", { p_loja: LOJA, p_codigo: d.codigo, p_produto: d.produto_id });
    case "fornecedor": return rpc("v3_salvar_fornecedor", { p_loja: LOJA, p: d });
    case "preco": return rpc("v3_definir_preco", { p_loja: LOJA, p_produto: d.produto_id, p_preco: d.preco, p_margem: d.margem ?? null });
    case "contagem": return rpc("v3_contagem", { p_loja: LOJA, p: d });
    case "perda": return rpc("v3_registrar_perda", { p_loja: LOJA, p_produto: d.produto_id, p_quantidade: d.quantidade, p_ref: d.id });
    case "config": return rpc("v3_salvar_configuracao", { p_loja: LOJA, p: d });
  }
}

let enviandoAgora = false;
export async function enviarFila(): Promise<void> {
  if (enviandoAgora || estado.fase !== "pronto") return;
  enviandoAgora = true;
  set({ enviando: estado.fila.some((o) => !o.erro) });
  try {
    for (;;) {
      const op = estado.fila.find((o) => !o.erro);
      if (!op) break;
      try {
        await executar(op);
        if (op.tipo === "venda") marcarEnviada("vendas", op.dados.id as string);
        if (op.tipo === "entrada") marcarEnviada("entradas", op.dados.id as string);
        set({ fila: estado.fila.filter((o) => o.id !== op.id), online: true, ultimoErro: null });
        await gravarFila();
      } catch (e) {
        const m = msgErro(e);
        if (/versao_antiga/.test(m)) { await checarVersao(); break; }
        if (ehErroDeRede(e)) {
          if (/JWT|sem_login/i.test(m)) await supa().auth.refreshSession().catch(() => {});
          set({ online: navigator.onLine && !/fetch|network/i.test(m) ? estado.online : false, ultimoErro: null });
          break;
        }
        // erro de regra: guarda a operação com o erro, não trava as outras
        set({ fila: estado.fila.map((o) => (o.id === op.id ? { ...o, tentativas: o.tentativas + 1, erro: traduzirErro(m) } : o)), ultimoErro: traduzirErro(m) });
        await gravarFila();
      }
    }
  } finally {
    enviandoAgora = false;
    set({ enviando: false });
  }
}

export function descartarOp(id: string) { set({ fila: estado.fila.filter((o) => o.id !== id) }); void gravarFila(); }
export function tentarDeNovo(id: string) { set({ fila: estado.fila.map((o) => (o.id === id ? { ...o, erro: undefined } : o)) }); void gravarFila().then(() => enviarFila()); }

export function traduzirErro(m: string): string {
  if (/so_admin/.test(m)) return "Só o Admin pode fazer isso.";
  if (/produto_inexistente/.test(m)) return "Produto não existe mais.";
  if (/codigo_ja_usado/.test(m)) return "Esse código já é de outro produto.";
  if (/quantidade_invalida/.test(m)) return "Quantidade inválida.";
  if (/sem_acesso/.test(m)) return "Este aparelho não tem acesso à loja.";
  if (/bloqueado/.test(m)) return "Aparelho bloqueado pelo Admin.";
  return m.slice(0, 140);
}

function marcarEnviada(campo: "vendas" | "entradas", id: string) {
  const atual = (estado[campo] as Record<string, any>)[id];
  if (atual?.pendente) set({ [campo]: { ...(estado[campo] as any), [id]: { ...atual, pendente: false } } } as any);
}

// ---------- aplicação otimista ----------
function aplicarLocal(op: Op, novo: boolean) {
  const d = op.dados as any; const agora = new Date().toISOString();
  switch (op.tipo) {
    case "venda": {
      const itens = (d.itens ?? []) as any[];
      const v: Venda = { loja_id: LOJA, id: d.id, total: d.total, forma: d.forma ?? null, recebido: d.recebido ?? null, troco: d.troco ?? null,
        desconto: 0, origem: "v3", tem_itens: itens.length > 0, custo_total: null, aparelho: estado.uid, excluido: false,
        criado_em: d.criado_em, atualizado_em: agora, pendente: true };
      const novosItens = { ...estado.itens }; const custos = { ...estado.custos }; let custoTot = 0; let semCusto = false;
      itens.forEach((it, i) => {
        const c = it.produto_id ? custos[it.produto_id] : undefined;
        const p = it.produto_id ? estado.produtos[it.produto_id] : undefined;
        const cu = c ? (p?.base_custo === "ultimo" ? c.custo_ultimo ?? c.custo_medio : c.custo_medio ?? c.custo_ultimo) : null;
        if (cu == null) semCusto = true; else custoTot += cu * it.quantidade;
        novosItens[it.id ?? `${d.id}-${i + 1}`] = { loja_id: LOJA, id: it.id ?? `${d.id}-${i + 1}`, venda_id: d.id, produto_id: it.produto_id ?? null,
          nome: it.nome, unidade: it.unidade ?? null, quantidade: it.quantidade, preco_unit: it.preco_unit, custo_unit: cu, total: it.total };
        if (c && novo) custos[it.produto_id] = { ...c, estoque: c.estoque - it.quantidade };
      });
      if (itens.length) v.custo_total = semCusto ? null : custoTot;
      set({ vendas: { ...estado.vendas, [v.id]: v }, itens: novosItens, custos });
      break;
    }
    case "excluir_venda": {
      const v = estado.vendas[d.id];
      if (v) set({ vendas: { ...estado.vendas, [d.id]: { ...v, excluido: true } } });
      break;
    }
    case "entrada": {
      const e: Entrada = { loja_id: LOJA, id: d.id, fornecedor_id: d.fornecedor_id || null, data: d.data, frete: d.frete ?? 0,
        total: (d.itens ?? []).reduce((s: number, i: any) => s + (i.valor_pago || 0), 0) + (d.frete ?? 0), observacao: d.observacao ?? null,
        excluido: false, criado_em: agora, pendente: true };
      const ei = { ...estado.entradaItens }; const custos = { ...estado.custos };
      const totalValor = (d.itens ?? []).reduce((s: number, i: any) => s + (i.valor_pago || 0), 0);
      for (const it of d.itens ?? []) {
        const freteParte = totalValor > 0 ? (d.frete ?? 0) * (it.valor_pago || 0) / totalValor : 0;
        const cef = custoEfetivo(it.valor_pago || 0, it.quantidade, it.perda_pct || 0, freteParte);
        ei[it.id] = { loja_id: LOJA, id: it.id, entrada_id: d.id, produto_id: it.produto_id, quantidade: it.quantidade, valor_pago: it.valor_pago || 0,
          perda_pct: it.perda_pct || 0, custo_unitario: it.valor_pago ? it.valor_pago / it.quantidade : null, custo_efetivo: cef, validade_em: it.validade_em ?? null };
        const c = custos[it.produto_id] ?? { loja_id: LOJA, produto_id: it.produto_id, estoque: 0, custo_medio: null, custo_ultimo: null, ultima_entrada_em: null, atualizado_em: agora };
        const util = it.quantidade * (1 - (it.perda_pct || 0) / 100);
        custos[it.produto_id] = { ...c, estoque: Math.max(c.estoque, 0) + util, custo_medio: custoMedioNovo(c.estoque, c.custo_medio, util, cef),
          custo_ultimo: cef ?? c.custo_ultimo, ultima_entrada_em: agora };
      }
      set({ entradas: { ...estado.entradas, [e.id]: e }, entradaItens: ei, custos });
      break;
    }
    case "produto": {
      const atual = estado.produtos[d.id];
      const p: Produto = { ...(atual ?? { loja_id: LOJA, categoria: null, preco_promocional: null, promo_inicia_em: null, promo_expira_em: null,
        margem_desejada: null, base_custo: "medio", perda_padrao: 0, estoque_minimo: null, validade_dias: null, fornecedor_id: null,
        ativo: true, ordem: 0, excluido: false, criado_em: agora, unidade: "un", preco: 0, nome: "" }), ...d, atualizado_em: agora } as Produto;
      delete (p as any).codigos;
      const codigos = { ...estado.codigos };
      if (Array.isArray(d.codigos)) {
        if (estado.papel === "admin") for (const k of Object.keys(codigos)) if (codigos[k].produto_id === d.id && !d.codigos.includes(k)) delete codigos[k];
        for (const c of d.codigos as string[]) codigos[c] = { loja_id: LOJA, codigo: c, produto_id: d.id };
      }
      const custos = estado.custos[d.id] ? estado.custos : { ...estado.custos, [d.id]: { loja_id: LOJA, produto_id: d.id, estoque: 0, custo_medio: null, custo_ultimo: null, ultima_entrada_em: null, atualizado_em: agora } };
      set({ produtos: { ...estado.produtos, [d.id]: p }, codigos, custos });
      break;
    }
    case "codigo": set({ codigos: { ...estado.codigos, [d.codigo]: { loja_id: LOJA, codigo: d.codigo, produto_id: d.produto_id } } }); break;
    case "fornecedor": set({ fornecedores: { ...estado.fornecedores, [d.id]: { ...(estado.fornecedores[d.id] ?? {}), loja_id: LOJA, ativo: true, excluido: false, ...d, atualizado_em: agora } as Fornecedor } }); break;
    case "preco": {
      const p = estado.produtos[d.produto_id];
      if (p) set({ produtos: { ...estado.produtos, [p.id]: { ...p, preco: d.preco, margem_desejada: d.margem ?? p.margem_desejada } } });
      break;
    }
    case "contagem": {
      const custos = { ...estado.custos };
      for (const it of d.itens ?? []) {
        const c = custos[it.produto_id] ?? { loja_id: LOJA, produto_id: it.produto_id, estoque: 0, custo_medio: null, custo_ultimo: null, ultima_entrada_em: null, atualizado_em: agora };
        custos[it.produto_id] = { ...c, estoque: it.quantidade, custo_medio: it.custo ?? c.custo_medio, custo_ultimo: c.custo_ultimo ?? it.custo ?? null };
      }
      set({ custos });
      break;
    }
    case "perda": {
      const c = estado.custos[d.produto_id];
      if (c && novo) set({ custos: { ...estado.custos, [d.produto_id]: { ...c, estoque: c.estoque - d.quantidade } } });
      break;
    }
    case "config": if (estado.config) set({ config: { ...estado.config, ...d } }); break;
  }
}

// ---------- ações diretas (precisam de internet) ----------
export async function criarConvite(papel: Papel): Promise<{ codigo: string; expira_em: string }> {
  const { data, error } = await supa().rpc("v3_criar_convite", { p_loja: LOJA, p_papel: papel });
  if (error) throw new Error(traduzirErro(msgErro(error)));
  return data as { codigo: string; expira_em: string };
}
export async function renomearAparelho(nome: string, uid?: string): Promise<void> {
  const { error } = await supa().rpc("v3_renomear_aparelho", { p_loja: LOJA, p_nome: nome, p_uid: uid ?? null });
  if (error) throw new Error(traduzirErro(msgErro(error)));
  if (!uid || uid === estado.uid) { localStorage.setItem("cv3-nome", nome); set({ meuNome: nome }); }
}
export async function definirAparelho(uid: string, papel: Papel | null, bloqueado: boolean | null): Promise<void> {
  const { error } = await supa().rpc("v3_definir_aparelho", { p_loja: LOJA, p_uid: uid, p_papel: papel, p_bloqueado: bloqueado });
  if (error) throw new Error(traduzirErro(msgErro(error)));
}
