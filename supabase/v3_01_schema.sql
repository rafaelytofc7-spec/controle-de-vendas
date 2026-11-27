-- Controle de Vendas v3 — schema (tabelas com prefixo v3_ no schema public).
-- Não altera nenhuma tabela antiga. Todas as gravações passam por funções (RPC) security definer;
-- as tabelas só têm política de LEITURA para aparelhos da loja.

create extension if not exists pgcrypto;

create table if not exists v3_lojas (
  id text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  criado_em timestamptz not null default now()
);

-- segredos: nunca legíveis pelo app (sem política)
create table if not exists v3_loja_segredos (
  loja_id text primary key references v3_lojas(id) on delete cascade,
  codigo_entrada_hash text,      -- código embutido no APK (entra como caixa)
  codigo_recuperacao_hash text,  -- código de recuperação (entra como admin)
  atualizado_em timestamptz not null default now()
);

create table if not exists v3_aparelhos (
  loja_id text not null references v3_lojas(id) on delete cascade,
  uid uuid not null,
  nome text not null check (char_length(trim(nome)) between 1 and 40),
  papel text not null check (papel in ('admin','caixa')),
  bloqueado boolean not null default false,
  plataforma text,
  versao_code integer,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now(),
  primary key (loja_id, uid)
);
create index if not exists v3_aparelhos_uid on v3_aparelhos(uid);

create table if not exists v3_convites (
  codigo text primary key,
  loja_id text not null references v3_lojas(id) on delete cascade,
  papel text not null check (papel in ('admin','caixa')),
  criado_por uuid,
  expira_em timestamptz not null,
  usado_por uuid,
  usado_em timestamptz
);

create table if not exists v3_tentativas (
  uid uuid not null,
  em timestamptz not null default now()
);
create index if not exists v3_tentativas_uid on v3_tentativas(uid, em);

create table if not exists v3_configuracao (
  loja_id text primary key references v3_lojas(id) on delete cascade,
  nome_loja text,
  telefone text,
  margem_padrao numeric not null default 35 check (margem_padrao >= 0 and margem_padrao < 100),
  arredondamento text not null default '49_99' check (arredondamento in ('nenhum','49_99','x9')),
  modo_margem text not null default 'venda' check (modo_margem in ('venda','markup')),
  taxa_entrega numeric,
  mensagem_cardapio text,
  observacoes text,
  atualizado_em timestamptz not null default now()
);

create table if not exists v3_app_versao (
  plataforma text primary key check (plataforma in ('android','web')),
  minima integer not null default 0,
  atual integer not null default 0,
  nome_atual text,
  url text,
  novidades text,
  atualizado_em timestamptz not null default now()
);

create table if not exists v3_fornecedores (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  nome text not null,
  tipo text,
  telefone text,
  observacoes text,
  ativo boolean not null default true,
  excluido boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, id)
);

create table if not exists v3_produtos (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  categoria text,
  unidade text not null default 'un' check (unidade in ('kg','un','bandeja','maco','litro','pacote','cartela','duzia','caixa')),
  preco numeric not null default 0 check (preco >= 0),
  preco_promocional numeric check (preco_promocional is null or preco_promocional >= 0),
  promo_inicia_em timestamptz,
  promo_expira_em timestamptz,
  margem_desejada numeric check (margem_desejada is null or (margem_desejada >= 0 and margem_desejada < 100)),
  base_custo text not null default 'medio' check (base_custo in ('medio','ultimo')),
  perda_padrao numeric not null default 0 check (perda_padrao >= 0 and perda_padrao < 100),
  estoque_minimo numeric,
  validade_dias integer,
  fornecedor_id text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  legado_id text,
  excluido boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, id)
);
create unique index if not exists v3_produtos_legado on v3_produtos(loja_id, legado_id) where legado_id is not null;

create table if not exists v3_produto_codigos (
  loja_id text not null references v3_lojas(id) on delete cascade,
  codigo text not null check (codigo ~ '^[0-9A-Za-z]{3,30}$'),
  produto_id text not null,
  criado_em timestamptz not null default now(),
  primary key (loja_id, codigo)
);
create index if not exists v3_produto_codigos_prod on v3_produto_codigos(loja_id, produto_id);

-- estoque e custo atual (mantido só pelas funções)
create table if not exists v3_produto_custos (
  loja_id text not null references v3_lojas(id) on delete cascade,
  produto_id text not null,
  estoque numeric not null default 0,
  custo_medio numeric,
  custo_ultimo numeric,
  ultima_entrada_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, produto_id)
);

create table if not exists v3_entradas (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  fornecedor_id text,
  data timestamptz not null default now(),
  frete numeric not null default 0 check (frete >= 0),
  total numeric not null default 0,
  observacao text,
  excluido boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, id)
);
create index if not exists v3_entradas_data on v3_entradas(loja_id, data desc);

create table if not exists v3_entrada_itens (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  entrada_id text not null,
  produto_id text not null,
  quantidade numeric not null check (quantidade > 0),
  valor_pago numeric not null default 0 check (valor_pago >= 0),
  perda_pct numeric not null default 0 check (perda_pct >= 0 and perda_pct < 100),
  custo_unitario numeric,         -- valor pago / quantidade
  custo_efetivo numeric,          -- com perda e frete
  validade_em date,
  primary key (loja_id, id)
);
create index if not exists v3_entrada_itens_ent on v3_entrada_itens(loja_id, entrada_id);
create index if not exists v3_entrada_itens_prod on v3_entrada_itens(loja_id, produto_id);

create table if not exists v3_estoque_mov (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id bigint generated always as identity,
  produto_id text not null,
  tipo text not null check (tipo in ('entrada','venda','estorno','perda','ajuste','contagem','encomenda')),
  quantidade numeric not null,
  custo_unitario numeric,
  ref_id text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  primary key (loja_id, id)
);
create index if not exists v3_estoque_mov_prod on v3_estoque_mov(loja_id, produto_id, criado_em desc);

create table if not exists v3_vendas (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  total numeric not null check (total >= 0),
  forma text check (forma in ('dinheiro','pix','cartao','debito','credito','fiado','outro')),
  recebido numeric,
  troco numeric,
  desconto numeric not null default 0,
  origem text not null default 'v3' check (origem in ('v3','app_antigo','app_v2','importado')),
  tem_itens boolean not null default false,
  custo_total numeric,            -- soma do custo dos itens (null se só valor)
  aparelho uuid,
  versao_code integer,
  legado_id text,
  excluido boolean not null default false,
  criado_em timestamptz not null,
  hora_servidor timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, id)
);
create index if not exists v3_vendas_criado on v3_vendas(loja_id, criado_em desc);
create index if not exists v3_vendas_atualizado on v3_vendas(loja_id, atualizado_em desc);
create unique index if not exists v3_vendas_legado on v3_vendas(loja_id, legado_id) where legado_id is not null;

create table if not exists v3_venda_itens (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  venda_id text not null,
  produto_id text,
  nome text not null,
  unidade text,
  quantidade numeric not null check (quantidade > 0),
  preco_unit numeric not null check (preco_unit >= 0),
  custo_unit numeric,
  total numeric not null,
  primary key (loja_id, id)
);
create index if not exists v3_venda_itens_venda on v3_venda_itens(loja_id, venda_id);
create index if not exists v3_venda_itens_prod on v3_venda_itens(loja_id, produto_id);

create table if not exists v3_encomendas (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  cliente text,
  telefone text,
  tipo text not null default 'retirada' check (tipo in ('retirada','entrega')),
  endereco text,
  endereco_detalhe jsonb,
  data_entrega text,
  descricao text,
  status text not null default 'pendente' check (status in ('pendente','separando','pronta','entregue','cancelada')),
  valor numeric not null default 0,
  sinal numeric not null default 0,
  pago boolean not null default false,
  forma_pagamento text,
  pago_em timestamptz,
  concluido_em timestamptz,
  legado_id text,
  excluido boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, id)
);
create unique index if not exists v3_encomendas_legado on v3_encomendas(loja_id, legado_id) where legado_id is not null;

create table if not exists v3_encomenda_itens (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  encomenda_id text not null,
  produto_id text,
  nome text not null,
  quantidade numeric not null check (quantidade > 0),
  preco_unit numeric not null default 0,
  primary key (loja_id, id)
);

create table if not exists v3_cobrancas (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id text not null,
  valor numeric,
  provedor text,
  forma text,
  status text,
  referencia text,
  mensagem text,
  venda_id text,
  pago_em timestamptz,
  legado_id text,
  excluido boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, id)
);

create table if not exists v3_precos_diarios (
  loja_id text not null references v3_lojas(id) on delete cascade,
  dia date not null,
  produto_id text not null,
  fornecedor_id text not null default '',
  quantidade numeric not null default 0,
  valor numeric not null default 0,
  custo_min numeric,
  custo_max numeric,
  preco_venda numeric,
  primary key (loja_id, dia, produto_id, fornecedor_id)
);

create table if not exists v3_promocoes_sugeridas (
  loja_id text not null references v3_lojas(id) on delete cascade,
  dia date not null,
  produto_id text not null,
  motivos jsonb not null default '[]',
  preco_atual numeric,
  preco_sugerido numeric,
  margem_resultante numeric,
  status text not null default 'nova' check (status in ('nova','aceita','ignorada')),
  primary key (loja_id, dia, produto_id)
);

create table if not exists v3_relatorios_diarios (
  loja_id text not null references v3_lojas(id) on delete cascade,
  dia date not null,
  dados jsonb not null,
  gerado_em timestamptz not null default now(),
  primary key (loja_id, dia)
);

create table if not exists v3_atividades (
  loja_id text not null references v3_lojas(id) on delete cascade,
  id bigint generated always as identity,
  uid uuid,
  acao text not null,
  tabela text,
  registro_id text,
  resumo text,
  em timestamptz not null default now(),
  primary key (loja_id, id)
);
create index if not exists v3_atividades_em on v3_atividades(loja_id, em desc);
