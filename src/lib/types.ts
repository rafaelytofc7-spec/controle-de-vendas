export type StatusEntrega = "pendente" | "a_caminho" | "entregue";
export type StatusCobranca = "aguardando" | "paga" | "cancelada";
export type FormaCobranca = "debito" | "credito" | "pix";
export type ProvedorCobranca = "stone" | "picpay" | "manual";

export interface Venda {
  id: string;
  loja: string;
  valor: number;
  criado_em: string;
  atualizado_em: string;
  excluido?: boolean;
}

export interface Produto {
  id: string;
  loja: string;
  nome: string;
  preco: number;
  unidade: string | null;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  preco_promocional: number | null;
  promo_expira_em: string | null;
  promo_inicia_em: string | null;
  excluido?: boolean;
}

export interface Entrega {
  id: string;
  loja: string;
  cliente: string;
  endereco: string;
  telefone: string | null;
  valor: number;
  status: StatusEntrega;
  criado_em: string;
  concluido_em: string | null;
  atualizado_em: string;
  excluido?: boolean;
}

export interface Encomenda {
  id: string;
  loja: string;
  cliente: string;
  produto: string;
  pago: boolean;
  endereco: string | null;
  telefone: string | null;
  para_entrega: boolean;
  valor: number;
  criado_em: string;
  concluido_em: string | null;
  atualizado_em: string;
  excluido?: boolean;
}

export interface Cobranca {
  id: string;
  loja: string;
  valor: number;
  provedor: ProvedorCobranca;
  forma: FormaCobranca;
  status: StatusCobranca;
  referencia: string | null;
  mensagem: string | null;
  modo_teste: boolean;
  venda_id: string | null;
  criado_em: string;
  pago_em: string | null;
  atualizado_em: string;
  excluido?: boolean;
}

export interface Reabastecimento {
  id: string;
  loja: string;
  produto_id: string | null;
  produto: string;
  unidade: string | null;
  quantidade: number;
  valor_total: number;
  custo_unitario: number;
  margem: number;
  preco_sugerido: number;
  criado_em: string;
  atualizado_em: string;
  excluido?: boolean;
}

export interface ConfiguracaoLoja {
  loja: string;
  nome_loja: string;
  telefone: string;
  mensagem_cardapio: string;
  taxa_entrega: number;
  observacoes: string;
  atualizado_em: string;
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  googleClientId?: string;
}

export interface BackupArquivo {
  formato: "controle-de-vendas-backup";
  versao: number;
  gerado_em?: string;
  loja: string;
  configuracao?: Record<string, unknown>;
  vendas: unknown[];
  produtos: unknown[];
  entregas?: unknown[];
  encomendas?: unknown[];
  cobrancas?: unknown[];
  reabastecimentos?: unknown[];
  verificacao?: {
    vendas: number;
    produtos: number;
    entregas?: number;
    encomendas: number;
    cobrancas: number;
    reabastecimentos?: number;
    total_vendas: number;
  };
}

export interface VerificacaoImportacao {
  vendas: number;
  produtos: number;
  entregas: number;
  encomendas: number;
  cobrancas: number;
  reabastecimentos: number;
  total_vendas: number;
  ok: boolean;
  diferencas: string[];
}
