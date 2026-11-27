export type Papel = "admin" | "caixa";
export type Unidade = "kg" | "un" | "bandeja" | "maco" | "litro" | "pacote" | "cartela" | "duzia" | "caixa";
export const UNIDADES: { v: Unidade; nome: string }[] = [
  { v: "kg", nome: "kg" }, { v: "un", nome: "unidade" }, { v: "bandeja", nome: "bandeja" }, { v: "maco", nome: "maço" },
  { v: "duzia", nome: "dúzia" }, { v: "pacote", nome: "pacote" }, { v: "cartela", nome: "cartela" }, { v: "litro", nome: "litro" }, { v: "caixa", nome: "caixa" },
];
export const nomeUnidade = (u: string | null | undefined) => (u === "un" ? "un" : u === "maco" ? "maço" : u === "duzia" ? "dúzia" : u ?? "un");

export interface Produto {
  loja_id: string; id: string; nome: string; categoria: string | null; unidade: Unidade; preco: number;
  preco_promocional: number | null; promo_inicia_em: string | null; promo_expira_em: string | null;
  margem_desejada: number | null; base_custo: "medio" | "ultimo"; perda_padrao: number; estoque_minimo: number | null;
  validade_dias: number | null; fornecedor_id: string | null; ativo: boolean; ordem: number; excluido: boolean;
  criado_em: string; atualizado_em: string;
}
export interface Codigo { loja_id: string; codigo: string; produto_id: string }
export interface Custo { loja_id: string; produto_id: string; estoque: number; custo_medio: number | null; custo_ultimo: number | null; ultima_entrada_em: string | null; atualizado_em: string }
export interface Fornecedor { loja_id: string; id: string; nome: string; tipo: string | null; telefone: string | null; observacoes: string | null; ativo: boolean; excluido: boolean; atualizado_em: string }
export interface Venda {
  loja_id: string; id: string; total: number; forma: string | null; recebido: number | null; troco: number | null; desconto: number;
  origem: string; tem_itens: boolean; custo_total: number | null; aparelho: string | null; excluido: boolean; criado_em: string; atualizado_em: string;
  operador?: string | null; pendente?: boolean;
}
export interface VendaItem { loja_id: string; id: string; venda_id: string; produto_id: string | null; nome: string; unidade: string | null; quantidade: number; preco_unit: number; custo_unit: number | null; total: number }
export interface Entrada { loja_id: string; id: string; fornecedor_id: string | null; data: string; frete: number; total: number; observacao: string | null; excluido: boolean; criado_em: string; pendente?: boolean }
export interface EntradaItem { loja_id: string; id: string; entrada_id: string; produto_id: string; quantidade: number; valor_pago: number; perda_pct: number; custo_unitario: number | null; custo_efetivo: number | null; validade_em: string | null }
export interface Aparelho {
  loja_id: string; uid: string; nome: string; papel: Papel; bloqueado: boolean; plataforma: string | null; versao_code: number | null; ultimo_acesso: string | null;
  operador?: string | null; sync_em?: string | null; sync_ok_em?: string | null; pendentes?: number; faltando_servidor?: number; faltando_aparelho?: number; atraso_seg?: number;
}
export interface Configuracao { loja_id: string; margem_padrao: number; arredondamento: "nenhum" | "49_99" | "x9"; modo_margem: "venda" | "markup"; telefone: string | null }
export interface AppVersao { plataforma: string; minima: number; atual: number; nome_atual: string | null; url: string | null; novidades: string | null }

export type TipoOp = "venda" | "excluir_venda" | "entrada" | "produto" | "codigo" | "fornecedor" | "preco" | "contagem" | "perda" | "config"
  | "encomenda" | "promocao" | "responder_promocao";
export type StatusEncomenda = "pendente" | "separando" | "pronta" | "entregue" | "cancelada";
export interface Encomenda {
  loja_id: string; id: string; cliente: string | null; telefone: string | null; tipo: "retirada" | "entrega"; endereco: string | null;
  data_entrega: string | null; descricao: string | null; status: StatusEncomenda; valor: number; sinal: number; pago: boolean;
  forma_pagamento: string | null; pago_em: string | null; concluido_em: string | null; excluido: boolean; criado_em: string; atualizado_em: string;
  pendente?: boolean;
}
export interface EncomendaItem { loja_id: string; id: string; encomenda_id: string; produto_id: string | null; nome: string; quantidade: number; preco_unit: number }
export interface PrecoDiario { loja_id: string; dia: string; produto_id: string; fornecedor_id: string; quantidade: number; valor: number; custo_min: number | null; custo_max: number | null; preco_venda: number | null }
export interface Promocao { loja_id: string; dia: string; produto_id: string; motivos: { tipo: string; texto: string }[]; preco_atual: number | null; preco_sugerido: number | null; margem_resultante: number | null; status: "nova" | "aceita" | "ignorada" }
export interface Relatorio { loja_id: string; dia: string; dados: any; gerado_em: string }
export interface Op { id: string; tipo: TipoOp; dados: Record<string, unknown>; criado_em: string; tentativas: number; erro?: string }
