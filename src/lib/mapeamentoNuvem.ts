import type {
  Atividade,
  Cobranca,
  ConfiguracaoLoja,
  Encomenda,
  Entrega,
  MembroLoja,
  Produto,
  Reabastecimento,
  Venda,
} from "./types";
import { PREFS_NOTIFICACAO_PADRAO } from "./types";

function iso(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "string") return v;
  const d = new Date(v as string | number);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function isoReq(v: unknown, fallback?: string): string {
  return iso(v) || fallback || new Date().toISOString();
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  return String(v);
}

function limpar<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v === undefined ? null : v;
  }
  return out as T;
}

function autoriaFrom(r: Record<string, unknown>) {
  return {
    criadoPor: String(r.criado_por ?? r.criadoPor ?? "importado"),
    criadoPorEmail: texto(r.criado_por_email ?? r.criadoPorEmail),
    atualizadoPor: String(r.atualizado_por ?? r.atualizadoPor ?? r.criado_por ?? r.criadoPor ?? "importado"),
    atualizadoPorEmail: texto(r.atualizado_por_email ?? r.atualizadoPorEmail),
  };
}

function autoriaTo(r: { criadoPor?: string; criadoPorEmail?: string; atualizadoPor?: string; atualizadoPorEmail?: string }) {
  return {
    criado_por: r.criadoPor || "importado",
    criado_por_email: r.criadoPorEmail ?? null,
    atualizado_por: r.atualizadoPor || r.criadoPor || "importado",
    atualizado_por_email: r.atualizadoPorEmail ?? null,
  };
}

export function vendaFromRow(r: Record<string, unknown>): Venda {
  return {
    id: String(r.id),
    loja: String(r.loja_id ?? r.loja ?? ""),
    valor: num(r.valor),
    criado_em: isoReq(r.criado_em),
    atualizado_em: isoReq(r.atualizado_em, iso(r.criado_em)),
    excluido: Boolean(r.excluido),
    ...autoriaFrom(r),
  };
}

export function vendaToRow(v: Venda, loja: string) {
  return limpar({
    id: v.id,
    loja_id: loja,
    valor: v.valor,
    criado_em: v.criado_em,
    atualizado_em: v.atualizado_em,
    excluido: Boolean(v.excluido),
    ...autoriaTo(v),
  });
}

export function produtoFromRow(r: Record<string, unknown>, barras?: string[]): Produto {
  return {
    id: String(r.id),
    loja: String(r.loja_id ?? r.loja ?? ""),
    nome: String(r.nome ?? ""),
    preco: num(r.preco),
    unidade: r.unidade == null ? null : String(r.unidade),
    ordem: r.ordem == null ? 0 : Number(r.ordem) || 0,
    preco_promocional: numOrNull(r.preco_promocional),
    promo_expira_em: iso(r.promo_expira_em) ?? null,
    promo_inicia_em: iso(r.promo_inicia_em) ?? null,
    criado_em: isoReq(r.criado_em),
    atualizado_em: isoReq(r.atualizado_em, iso(r.criado_em)),
    excluido: Boolean(r.excluido),
    codigos_barras: barras,
    ...autoriaFrom(r),
  };
}

export function produtoToRow(p: Produto, loja: string) {
  return limpar({
    id: p.id,
    loja_id: loja,
    nome: p.nome,
    preco: p.preco,
    unidade: p.unidade,
    ordem: p.ordem,
    preco_promocional: p.preco_promocional,
    promo_expira_em: p.promo_expira_em,
    promo_inicia_em: p.promo_inicia_em,
    criado_em: p.criado_em,
    atualizado_em: p.atualizado_em,
    excluido: Boolean(p.excluido),
    ...autoriaTo(p),
  });
}

export function entregaFromRow(r: Record<string, unknown>): Entrega {
  return {
    id: String(r.id),
    loja: String(r.loja_id ?? r.loja ?? ""),
    cliente: String(r.cliente ?? ""),
    endereco: String(r.endereco ?? ""),
    telefone: texto(r.telefone) ?? "",
    valor: num(r.valor),
    status: (r.status as Entrega["status"]) || "pendente",
    criado_em: isoReq(r.criado_em),
    concluido_em: iso(r.concluido_em),
    atualizado_em: isoReq(r.atualizado_em, iso(r.criado_em)),
    excluido: Boolean(r.excluido),
    ...autoriaFrom(r),
  } as Entrega;
}

export function entregaToRow(e: Entrega, loja: string) {
  return limpar({
    id: e.id,
    loja_id: loja,
    cliente: e.cliente ?? null,
    endereco: e.endereco ?? null,
    telefone: e.telefone ?? null,
    valor: e.valor,
    status: e.status ?? null,
    criado_em: e.criado_em,
    concluido_em: e.concluido_em ?? null,
    atualizado_em: e.atualizado_em,
    excluido: Boolean(e.excluido),
    ...autoriaTo(e),
  });
}

export function encomendaFromRow(r: Record<string, unknown>): Encomenda {
  return {
    id: String(r.id),
    loja: String(r.loja_id ?? r.loja ?? ""),
    cliente: String(r.cliente ?? ""),
    produto: String(r.produto ?? ""),
    pago: Boolean(r.pago),
    forma_pagamento: r.forma_pagamento ?? null,
    valor_pago: numOrNull(r.valor_pago),
    pago_em: iso(r.pago_em) ?? null,
    pago_por: r.pago_por ?? null,
    pago_por_nome: r.pago_por_nome ?? null,
    endereco: r.endereco ?? null,
    endereco_detalhe: r.endereco_detalhe ?? null,
    telefone: r.telefone ?? null,
    para_entrega: Boolean(r.para_entrega),
    tipo: (r.tipo as Encomenda["tipo"]) || "retirada",
    data_entrega: r.data_entrega == null ? null : String(r.data_entrega),
    prazo_lembrete: r.prazo_lembrete == null ? null : String(r.prazo_lembrete),
    status: (r.status as Encomenda["status"]) || "pendente",
    entregue_por: r.entregue_por ?? null,
    entregue_por_nome: r.entregue_por_nome ?? null,
    valor: num(r.valor),
    criado_em: isoReq(r.criado_em),
    concluido_em: iso(r.concluido_em) ?? null,
    atualizado_em: isoReq(r.atualizado_em, iso(r.criado_em)),
    excluido: Boolean(r.excluido),
    ...autoriaFrom(r),
  } as Encomenda;
}

export function encomendaToRow(e: Encomenda, loja: string) {
  return limpar({
    id: e.id,
    loja_id: loja,
    cliente: e.cliente ?? null,
    produto: e.produto ?? null,
    pago: Boolean(e.pago),
    forma_pagamento: e.forma_pagamento ?? null,
    valor_pago: e.valor_pago ?? null,
    pago_em: e.pago_em ?? null,
    pago_por: e.pago_por ?? null,
    pago_por_nome: e.pago_por_nome ?? null,
    endereco: e.endereco ?? null,
    endereco_detalhe: e.endereco_detalhe ?? null,
    telefone: e.telefone ?? null,
    para_entrega: Boolean(e.para_entrega),
    tipo: e.tipo ?? null,
    data_entrega: e.data_entrega ?? null,
    prazo_lembrete: e.prazo_lembrete ?? null,
    status: e.status ?? null,
    entregue_por: e.entregue_por ?? null,
    entregue_por_nome: e.entregue_por_nome ?? null,
    valor: e.valor ?? null,
    criado_em: e.criado_em,
    concluido_em: e.concluido_em ?? null,
    atualizado_em: e.atualizado_em,
    excluido: Boolean(e.excluido),
    ...autoriaTo(e),
  });
}

export function cobrancaFromRow(r: Record<string, unknown>): Cobranca {
  return {
    id: String(r.id),
    loja: String(r.loja_id ?? r.loja ?? ""),
    valor: num(r.valor),
    provedor: r.provedor,
    forma: r.forma,
    status: r.status,
    referencia: r.referencia,
    mensagem: r.mensagem,
    modo_teste: Boolean(r.modo_teste),
    venda_id: r.venda_id,
    criado_em: isoReq(r.criado_em),
    pago_em: iso(r.pago_em),
    atualizado_em: isoReq(r.atualizado_em, iso(r.criado_em)),
    excluido: Boolean(r.excluido),
    ...autoriaFrom(r),
  } as Cobranca;
}

export function cobrancaToRow(c: Cobranca, loja: string) {
  return limpar({
    id: c.id,
    loja_id: loja,
    valor: c.valor,
    provedor: c.provedor ?? null,
    forma: c.forma ?? null,
    status: c.status ?? null,
    referencia: c.referencia ?? null,
    mensagem: c.mensagem ?? null,
    modo_teste: Boolean(c.modo_teste),
    venda_id: c.venda_id ?? null,
    criado_em: c.criado_em,
    pago_em: c.pago_em ?? null,
    atualizado_em: c.atualizado_em,
    excluido: Boolean(c.excluido),
    ...autoriaTo(c),
  });
}

export function reabastecimentoFromRow(r: Record<string, unknown>): Reabastecimento {
  return {
    id: String(r.id),
    loja: String(r.loja_id ?? r.loja ?? ""),
    produto_id: r.produto_id ?? r.produtoId ?? null,
    produto: r.produto ?? null,
    unidade: r.unidade ?? null,
    quantidade: numOrNull(r.quantidade),
    valor_total: numOrNull(r.valor_total ?? r.valorTotal),
    custo_unitario: numOrNull(r.custo_unitario ?? r.custoUnitario),
    margem: numOrNull(r.margem),
    preco_sugerido: numOrNull(r.preco_sugerido ?? r.precoSugerido),
    criado_em: isoReq(r.criado_em),
    atualizado_em: isoReq(r.atualizado_em, iso(r.criado_em)),
    excluido: Boolean(r.excluido),
    ...autoriaFrom(r),
  } as Reabastecimento;
}

export function reabastecimentoToRow(r: Reabastecimento, loja: string) {
  const row = r as Reabastecimento & { produtoId?: string; valorTotal?: number; custoUnitario?: number; precoSugerido?: number };
  return limpar({
    id: r.id,
    loja_id: loja,
    produto_id: row.produto_id ?? row.produtoId ?? null,
    produto: r.produto ?? null,
    unidade: r.unidade ?? null,
    quantidade: r.quantidade ?? null,
    valor_total: row.valor_total ?? row.valorTotal ?? null,
    custo_unitario: row.custo_unitario ?? row.custoUnitario ?? null,
    margem: r.margem ?? null,
    preco_sugerido: row.preco_sugerido ?? row.precoSugerido ?? null,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
    excluido: Boolean(r.excluido),
    ...autoriaTo(r),
  });
}

export function membroFromRow(r: Record<string, unknown>): MembroLoja {
  const uid = String(r.uid ?? r.id ?? "");
  return {
    uid,
    nome: String(r.nome ?? uid),
    papel: r.papel === "lider" ? "lider" : "membro",
    email: texto(r.email),
    bloqueado: Boolean(r.bloqueado),
    ultimoAcesso: iso(r.ultimo_acesso ?? r.ultimoAcesso) ?? null,
    criado_em: isoReq(r.criado_em),
  };
}

export function configFromRow(r: Record<string, unknown>): ConfiguracaoLoja {
  return {
    loja: String(r.loja ?? r.loja_id ?? ""),
    nome_loja: String(r.nome_loja ?? ""),
    telefone: String(r.telefone ?? ""),
    mensagem_cardapio: String(r.mensagem_cardapio ?? ""),
    taxa_entrega: num(r.taxa_entrega),
    observacoes: String(r.observacoes ?? ""),
    hora_lembrete_padrao: String(r.hora_lembrete_padrao ?? "12:00"),
    notificacoes_padrao: (r.notificacoes_padrao as ConfiguracaoLoja["notificacoes_padrao"]) ?? PREFS_NOTIFICACAO_PADRAO,
    atualizado_em: isoReq(r.atualizado_em),
  };
}

export function configToRow(c: ConfiguracaoLoja, loja: string) {
  return limpar({
    loja_id: loja,
    loja: c.loja ?? loja,
    nome_loja: c.nome_loja ?? null,
    telefone: c.telefone ?? null,
    mensagem_cardapio: c.mensagem_cardapio ?? null,
    taxa_entrega: c.taxa_entrega ?? null,
    observacoes: c.observacoes ?? null,
    hora_lembrete_padrao: c.hora_lembrete_padrao ?? null,
    notificacoes_padrao: c.notificacoes_padrao ?? null,
    atualizado_em: c.atualizado_em,
  });
}

export function atividadeFromRow(r: Record<string, unknown>, loja: string): Atividade {
  return {
    id: String(r.id),
    loja,
    uid: String(r.uid ?? ""),
    email: String(r.email ?? ""),
    acao: r.acao as Atividade["acao"],
    colecao: String(r.colecao ?? ""),
    registroId: String(r.registro_id ?? r.registroId ?? ""),
    resumo: String(r.resumo ?? ""),
    em: isoReq(r.em),
  };
}

export function atividadeToRow(a: Atividade, loja: string) {
  return limpar({
    id: a.id,
    loja_id: loja,
    uid: a.uid ?? null,
    email: a.email ?? null,
    acao: a.acao ?? null,
    colecao: a.colecao ?? null,
    registro_id: a.registroId ?? null,
    resumo: a.resumo ?? null,
    em: a.em,
  });
}

export type ColecaoDados =
  | "vendas"
  | "produtos"
  | "entregas"
  | "encomendas"
  | "cobrancas"
  | "reabastecimentos";

export function rowDe(colecao: string, data: Record<string, unknown>, loja: string): Record<string, unknown> {
  switch (colecao) {
    case "vendas": return vendaToRow(data as unknown as Venda, loja);
    case "produtos": return produtoToRow(data as unknown as Produto, loja);
    case "entregas": return entregaToRow(data as unknown as Entrega, loja);
    case "encomendas": return encomendaToRow(data as unknown as Encomenda, loja);
    case "cobrancas": return cobrancaToRow(data as unknown as Cobranca, loja);
    case "reabastecimentos": return reabastecimentoToRow(data as unknown as Reabastecimento, loja);
    case "configuracao": return configToRow(data as unknown as ConfiguracaoLoja, loja);
    case "atividades": return atividadeToRow(data as unknown as Atividade, loja);
    default: return { ...data, loja_id: loja };
  }
}

export function fromRow(colecao: string, r: Record<string, unknown>, loja: string): Record<string, unknown> {
  switch (colecao) {
    case "vendas": return vendaFromRow(r) as unknown as Record<string, unknown>;
    case "produtos": return produtoFromRow(r) as unknown as Record<string, unknown>;
    case "entregas": return entregaFromRow(r) as unknown as Record<string, unknown>;
    case "encomendas": return encomendaFromRow(r) as unknown as Record<string, unknown>;
    case "cobrancas": return cobrancaFromRow(r) as unknown as Record<string, unknown>;
    case "reabastecimentos": return reabastecimentoFromRow(r) as unknown as Record<string, unknown>;
    case "configuracao": return configFromRow(r) as unknown as Record<string, unknown>;
    case "atividades": return atividadeFromRow(r, loja) as unknown as Record<string, unknown>;
    case "membros": return membroFromRow(r) as unknown as Record<string, unknown>;
    default: return r;
  }
}
