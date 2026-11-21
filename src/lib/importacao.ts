import { arredondar2, somarValores } from "./dinheiro";
import { agoraIso } from "./datas";
import type {
  BackupArquivo,
  Cobranca,
  ConfiguracaoLoja,
  Encomenda,
  Entrega,
  FormaCobranca,
  ProvedorCobranca,
  Produto,
  Reabastecimento,
  StatusCobranca,
  StatusEntrega,
  Venda,
  VerificacaoImportacao,
} from "./types";
import { calcularReabastecimento } from "./reabastecimento";

const TOKEN_KEYS = /^(token|secret|senha|password|access_token|api_key|apikey|refresh_token|client_secret|private_key)$/i;

export function gerarId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v);
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

function iso(v: unknown, fallback?: string): string {
  if (typeof v === "string" && v) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback ?? agoraIso();
}

function isoOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function limparSegredos<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (TOKEN_KEYS.test(k)) delete out[k];
  }
  return out;
}

export function parseBackup(raw: unknown): BackupArquivo {
  if (!raw || typeof raw !== "object") throw new Error("Arquivo de backup inválido.");
  const o = raw as Record<string, unknown>;
  if (o.formato && o.formato !== "controle-de-vendas-backup") {
    throw new Error("Este arquivo não é um backup do Controle de Vendas.");
  }
  const vendas = (o.vendas as unknown[]) ?? [];
  const produtos = (o.produtos as unknown[]) ?? [];
  if (!Array.isArray(vendas) || !Array.isArray(produtos)) {
    throw new Error("O backup precisa das listas de vendas e produtos.");
  }
  return {
    formato: "controle-de-vendas-backup",
    versao: typeof o.versao === "number" ? o.versao : 1,
    gerado_em: typeof o.gerado_em === "string" ? o.gerado_em : undefined,
    loja: str(o.loja, "loja"),
    configuracao: (o.configuracao as BackupArquivo["configuracao"]) ?? {},
    vendas: vendas as Array<Record<string, unknown>>,
    produtos: produtos as Array<Record<string, unknown>>,
    entregas: (o.entregas as Array<Record<string, unknown>>) ?? [],
    encomendas: (o.encomendas as Array<Record<string, unknown>>) ?? [],
    cobrancas: (o.cobrancas as Array<Record<string, unknown>>) ?? [],
    reabastecimentos: (o.reabastecimentos as Array<Record<string, unknown>>) ?? [],
    verificacao: o.verificacao as BackupArquivo["verificacao"],
  };
}

export function normalizarVenda(row: Record<string, unknown>, loja: string): Venda {
  const r = limparSegredos(row);
  const criado = iso(r.criado_em ?? r.criadoEm);
  return {
    id: str(r.id, gerarId()),
    loja: str(r.loja, loja),
    valor: arredondar2(num(r.valor)),
    criado_em: criado,
    atualizado_em: iso(r.atualizado_em ?? r.atualizadoEm, criado),
  };
}

export function normalizarProduto(row: Record<string, unknown>, loja: string): Produto {
  const r = limparSegredos(row);
  const criado = iso(r.criado_em ?? r.criadoEm);
  return {
    id: str(r.id, gerarId()),
    loja: str(r.loja, loja),
    nome: str(r.nome, "Produto"),
    preco: arredondar2(num(r.preco)),
    unidade: r.unidade == null || r.unidade === "" ? null : str(r.unidade),
    ordem: Math.trunc(num(r.ordem, 0)),
    criado_em: criado,
    atualizado_em: iso(r.atualizado_em ?? r.atualizadoEm, criado),
    preco_promocional: numOrNull(r.preco_promocional ?? r.precoPromocional),
    promo_expira_em: isoOrNull(r.promo_expira_em ?? r.promoExpiraEm),
    promo_inicia_em: isoOrNull(r.promo_inicia_em ?? r.promoIniciaEm),
  };
}

export function normalizarEntrega(row: Record<string, unknown>, loja: string): Entrega {
  const r = limparSegredos(row);
  const criado = iso(r.criado_em ?? r.criadoEm);
  const statusRaw = str(r.status, "pendente") as StatusEntrega;
  const status: StatusEntrega = ["pendente", "a_caminho", "entregue"].includes(statusRaw)
    ? statusRaw
    : "pendente";
  return {
    id: str(r.id, gerarId()),
    loja: str(r.loja, loja),
    cliente: str(r.cliente),
    endereco: str(r.endereco),
    telefone: r.telefone == null || r.telefone === "" ? null : str(r.telefone),
    valor: arredondar2(num(r.valor)),
    status,
    criado_em: criado,
    concluido_em: isoOrNull(r.concluido_em ?? r.concluidoEm),
    atualizado_em: iso(r.atualizado_em ?? r.atualizadoEm, criado),
  };
}

export function normalizarEncomenda(row: Record<string, unknown>, loja: string): Encomenda {
  const r = limparSegredos(row);
  const criado = iso(r.criado_em ?? r.criadoEm);
  return {
    id: str(r.id, gerarId()),
    loja: str(r.loja, loja),
    cliente: str(r.cliente),
    produto: str(r.produto),
    pago: bool(r.pago),
    endereco: r.endereco == null || r.endereco === "" ? null : str(r.endereco),
    telefone: r.telefone == null || r.telefone === "" ? null : str(r.telefone),
    para_entrega: bool(r.para_entrega ?? r.paraEntrega),
    valor: arredondar2(num(r.valor)),
    criado_em: criado,
    concluido_em: isoOrNull(r.concluido_em ?? r.concluidoEm),
    atualizado_em: iso(r.atualizado_em ?? r.atualizadoEm, criado),
  };
}

export function normalizarCobranca(row: Record<string, unknown>, loja: string): Cobranca {
  const r = limparSegredos(row);
  const criado = iso(r.criado_em ?? r.criadoEm);
  const provedorRaw = str(r.provedor, "manual");
  const provedor: ProvedorCobranca = ["stone", "picpay", "manual"].includes(provedorRaw)
    ? (provedorRaw as ProvedorCobranca)
    : "manual";
  const formaRaw = str(r.forma, "pix");
  const forma: FormaCobranca = ["debito", "credito", "pix"].includes(formaRaw)
    ? (formaRaw as FormaCobranca)
    : "pix";
  const statusRaw = str(r.status, "aguardando");
  const status: StatusCobranca = ["aguardando", "paga", "cancelada"].includes(statusRaw)
    ? (statusRaw as StatusCobranca)
    : "aguardando";
  return {
    id: str(r.id, gerarId()),
    loja: str(r.loja, loja),
    valor: arredondar2(num(r.valor)),
    provedor,
    forma,
    status,
    referencia: r.referencia == null || r.referencia === "" ? null : str(r.referencia),
    mensagem: r.mensagem == null || r.mensagem === "" ? null : str(r.mensagem),
    modo_teste: bool(r.modo_teste ?? r.modoTeste, true),
    venda_id: (r.venda_id ?? r.vendaId) ? str(r.venda_id ?? r.vendaId) : null,
    criado_em: criado,
    pago_em: isoOrNull(r.pago_em ?? r.pagoEm),
    atualizado_em: iso(r.atualizado_em ?? r.atualizadoEm, criado),
  };
}

export function normalizarReabastecimento(row: Record<string, unknown>, loja: string): Reabastecimento {
  const r = limparSegredos(row);
  const criado = iso(r.criado_em ?? r.criadoEm);
  const quantidade = num(r.quantidade);
  const valor_total = arredondar2(num(r.valor_total ?? r.valorTotal));
  const margem = num(r.margem);
  const calc = calcularReabastecimento(valor_total, quantidade, margem);
  return {
    id: str(r.id, gerarId()),
    loja: str(r.loja, loja),
    produto_id: (r.produto_id ?? r.produtoId) ? str(r.produto_id ?? r.produtoId) : null,
    produto: str(r.produto),
    unidade: r.unidade == null || r.unidade === "" ? null : str(r.unidade),
    quantidade,
    valor_total,
    custo_unitario: numOrNull(r.custo_unitario ?? r.custoUnitario) ?? calc.custo_unitario,
    margem,
    preco_sugerido: numOrNull(r.preco_sugerido ?? r.precoSugerido) ?? calc.preco_sugerido,
    criado_em: criado,
    atualizado_em: iso(r.atualizado_em ?? r.atualizadoEm, criado),
  };
}

export function normalizarConfig(cfg: Record<string, unknown> | undefined, loja: string): ConfiguracaoLoja {
  const c = cfg ? limparSegredos(cfg) : {};
  return {
    loja,
    nome_loja: str(c.nome_loja ?? c.nomeLoja, "Minha loja"),
    telefone: str(c.telefone),
    mensagem_cardapio: str(c.mensagem_cardapio ?? c.mensagemCardapio),
    taxa_entrega: arredondar2(num(c.taxa_entrega ?? c.taxaEntrega)),
    observacoes: str(c.observacoes),
    atualizado_em: agoraIso(),
  };
}

export interface DadosNormalizados {
  loja: string;
  configuracao: ConfiguracaoLoja;
  vendas: Venda[];
  produtos: Produto[];
  entregas: Entrega[];
  encomendas: Encomenda[];
  cobrancas: Cobranca[];
  reabastecimentos: Reabastecimento[];
}

export function normalizarBackup(backup: BackupArquivo): DadosNormalizados {
  const loja = backup.loja || "loja";
  return {
    loja,
    configuracao: normalizarConfig(backup.configuracao, loja),
    vendas: backup.vendas.map((r) => normalizarVenda(r as Record<string, unknown>, loja)),
    produtos: backup.produtos.map((r) => normalizarProduto(r as Record<string, unknown>, loja)),
    entregas: (backup.entregas ?? []).map((r) => normalizarEntrega(r as Record<string, unknown>, loja)),
    encomendas: (backup.encomendas ?? []).map((r) => normalizarEncomenda(r as Record<string, unknown>, loja)),
    cobrancas: (backup.cobrancas ?? []).map((r) => normalizarCobranca(r as Record<string, unknown>, loja)),
    reabastecimentos: (backup.reabastecimentos ?? []).map((r) => normalizarReabastecimento(r as Record<string, unknown>, loja)),
  };
}

export const ESPERADO_BACKUP_INICIAL = {
  vendas: 6916,
  produtos: 57,
  encomendas: 5,
  cobrancas: 3,
  total_vendas: 164476.16,
};

export function verificarDados(
  dados: DadosNormalizados,
  esperado?: Partial<typeof ESPERADO_BACKUP_INICIAL>,
): VerificacaoImportacao {
  const total = arredondar2(somarValores(dados.vendas.map((v) => v.valor)));
  const got = {
    vendas: dados.vendas.length,
    produtos: dados.produtos.length,
    entregas: dados.entregas.length,
    encomendas: dados.encomendas.length,
    cobrancas: dados.cobrancas.length,
    reabastecimentos: dados.reabastecimentos.length,
    total_vendas: total,
  };
  const exp = { ...ESPERADO_BACKUP_INICIAL, ...esperado };
  const diferencas: string[] = [];
  if (esperado || !esperado) {
    // Only assert fields present in `esperado` if provided; if checking the official backup, use defaults when flag official
  }
  const alvos = esperado ? exp : undefined;
  if (alvos) {
    if (alvos.vendas != null && got.vendas !== alvos.vendas) {
      diferencas.push(`vendas: ${got.vendas} (esperado ${alvos.vendas})`);
    }
    if (alvos.produtos != null && got.produtos !== alvos.produtos) {
      diferencas.push(`produtos: ${got.produtos} (esperado ${alvos.produtos})`);
    }
    if (alvos.encomendas != null && got.encomendas !== alvos.encomendas) {
      diferencas.push(`encomendas: ${got.encomendas} (esperado ${alvos.encomendas})`);
    }
    if (alvos.cobrancas != null && got.cobrancas !== alvos.cobrancas) {
      diferencas.push(`cobranças: ${got.cobrancas} (esperado ${alvos.cobrancas})`);
    }
    if (alvos.total_vendas != null && got.total_vendas !== alvos.total_vendas) {
      diferencas.push(`total: ${got.total_vendas} (esperado ${alvos.total_vendas})`);
    }
  }
  return { ...got, ok: diferencas.length === 0, diferencas };
}

export function verificarBackupOficial(dados: DadosNormalizados): VerificacaoImportacao {
  return verificarDados(dados, ESPERADO_BACKUP_INICIAL);
}

export function montarBackup(dados: DadosNormalizados): BackupArquivo {
  const total = arredondar2(somarValores(dados.vendas.map((v) => v.valor)));
  return {
    formato: "controle-de-vendas-backup",
    versao: 1,
    gerado_em: agoraIso(),
    loja: dados.loja,
    configuracao: dados.configuracao as unknown as Record<string, unknown>,
    vendas: dados.vendas,
    produtos: dados.produtos,
    entregas: dados.entregas,
    encomendas: dados.encomendas,
    cobrancas: dados.cobrancas,
    reabastecimentos: dados.reabastecimentos,
    verificacao: {
      vendas: dados.vendas.length,
      produtos: dados.produtos.length,
      entregas: dados.entregas.length,
      encomendas: dados.encomendas.length,
      cobrancas: dados.cobrancas.length,
      reabastecimentos: dados.reabastecimentos.length,
      total_vendas: total,
    },
  };
}
