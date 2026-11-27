-- Controle de Vendas v3 — migração e sincronização com as tabelas antigas (public.vendas etc.).
-- As tabelas antigas só são LIDAS. Idempotente: pode rodar quantas vezes quiser.
-- Uso: select v3_migrar_legado('principal', 'ensaio');   -- ensaio
--      select v3_migrar_legado('principal', 'principal'); -- virada (só com OK do Rafael)

create or replace function v3_unidade(u text) returns text language sql immutable as $$
  select case
    when u is null or trim(u) = '' then 'un'
    when lower(trim(u)) in ('kg','quilo','kilo') then 'kg'
    when lower(trim(u)) in ('un','uni','und','unid','unidade') then 'un'
    when lower(trim(u)) like 'bandeja%' then 'bandeja'
    when lower(trim(u)) like 'ma_o%' then 'maco'
    when lower(trim(u)) like 'cartela%' then 'cartela'
    when lower(trim(u)) like 'pacote%' then 'pacote'
    when lower(trim(u)) like 'd_zia%' then 'duzia'
    else 'un' end
$$;

create or replace function v3_migrar_legado(p_origem text, p_destino text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_prod int; n_vend_ins int; n_vend_upd int; n_enc int; n_cob int;
begin
  insert into v3_lojas(id) values (p_destino) on conflict do nothing;
  insert into v3_configuracao(loja_id, nome_loja, telefone, taxa_entrega, mensagem_cardapio, observacoes)
  select p_destino, coalesce(c.nome_loja, c.loja), c.telefone, c.taxa_entrega, c.mensagem_cardapio, c.observacoes
  from configuracao c where c.loja_id = p_origem
  on conflict (loja_id) do nothing;
  insert into v3_configuracao(loja_id) values (p_destino) on conflict do nothing;

  -- produtos (id novo = 'leg-' || id antigo; preserva preço/promo; não sobrescreve edições feitas na v3)
  insert into v3_produtos(loja_id, id, nome, unidade, preco, preco_promocional, promo_inicia_em, promo_expira_em, ordem, legado_id, excluido, criado_em, atualizado_em)
  select p_destino, 'leg-' || p.id, left(coalesce(nullif(trim(p.nome),''),'Produto'),80), v3_unidade(p.unidade), coalesce(p.preco,0),
    p.preco_promocional, p.promo_inicia_em, p.promo_expira_em, coalesce(p.ordem,0), p.id, p.excluido, p.criado_em, p.atualizado_em
  from produtos p where p.loja_id = p_origem
  on conflict (loja_id, id) do nothing;
  get diagnostics n_prod = row_count;
  insert into v3_produto_custos(loja_id, produto_id)
  select p_destino, id from v3_produtos where loja_id = p_destino on conflict do nothing;
  insert into v3_produto_codigos(loja_id, codigo, produto_id)
  select p_destino, cb.codigo, 'leg-' || cb.produto_id from codigos_barras cb
  where cb.loja_id = p_origem and cb.codigo ~ '^[0-9A-Za-z]{3,30}$'
  on conflict do nothing;

  -- vendas: novas
  insert into v3_vendas(loja_id, id, total, origem, legado_id, excluido, criado_em, hora_servidor, atualizado_em)
  select p_destino, 'leg-' || v.id, round(v.valor,2),
    case when v.criado_por = 'importado' then 'app_antigo' else 'app_v2' end,
    v.id, v.excluido, v.criado_em, coalesce(v.hora_servidor, v.atualizado_em), v.atualizado_em
  from vendas v where v.loja_id = p_origem and v.valor >= 0
  on conflict (loja_id, id) do nothing;
  get diagnostics n_vend_ins = row_count;
  -- vendas: alteradas depois (valor/exclusão)
  update v3_vendas n set total = round(v.valor,2), excluido = v.excluido, atualizado_em = v.atualizado_em
  from vendas v where v.loja_id = p_origem and n.loja_id = p_destino and n.id = 'leg-' || v.id
    and v.atualizado_em > n.atualizado_em and (n.total <> round(v.valor,2) or n.excluido <> v.excluido);
  get diagnostics n_vend_upd = row_count;

  -- encomendas
  insert into v3_encomendas(loja_id, id, cliente, telefone, tipo, endereco, endereco_detalhe, data_entrega, descricao, status, valor, sinal,
    pago, forma_pagamento, pago_em, concluido_em, legado_id, excluido, criado_em, atualizado_em)
  select p_destino, 'leg-' || e.id, e.cliente, e.telefone,
    case when coalesce(e.para_entrega,false) or e.tipo = 'entrega' then 'entrega' else 'retirada' end,
    e.endereco, e.endereco_detalhe, e.data_entrega, e.produto,
    case when e.status in ('entregue','cancelada') then e.status else 'pendente' end,
    coalesce(e.valor,0), case when coalesce(e.pago,false) then 0 else coalesce(e.valor_pago,0) end,
    coalesce(e.pago,false), e.forma_pagamento, e.pago_em, e.concluido_em, e.id, e.excluido, e.criado_em, e.atualizado_em
  from encomendas e where e.loja_id = p_origem
  on conflict (loja_id, id) do nothing;
  get diagnostics n_enc = row_count;

  insert into v3_cobrancas(loja_id, id, valor, provedor, forma, status, referencia, mensagem, venda_id, pago_em, legado_id, excluido, criado_em, atualizado_em)
  select p_destino, 'leg-' || c.id, c.valor, c.provedor, c.forma, c.status, c.referencia, c.mensagem,
    case when c.venda_id is not null then 'leg-' || c.venda_id end, c.pago_em, c.id, c.excluido, c.criado_em, c.atualizado_em
  from cobrancas c where c.loja_id = p_origem
  on conflict (loja_id, id) do nothing;
  get diagnostics n_cob = row_count;

  return jsonb_build_object('produtos_novos', n_prod, 'vendas_novas', n_vend_ins, 'vendas_atualizadas', n_vend_upd,
    'encomendas_novas', n_enc, 'cobrancas_novas', n_cob);
end $$;

-- Conferência por dia (fuso de São Paulo), centavo por centavo, vendas ativas.
create or replace function v3_conferir_migracao(p_origem text, p_destino text) returns table(
  dia date, vendas_antigo bigint, total_antigo numeric, vendas_v3 bigint, total_v3 numeric, diferenca numeric, ok boolean)
language sql stable security definer set search_path = public as $$
  with a as (
    select (criado_em at time zone 'America/Sao_Paulo')::date d, count(*) n, sum(round(valor,2)) t
    from vendas where loja_id = p_origem and not excluido and valor >= 0 group by 1),
  b as (
    select (criado_em at time zone 'America/Sao_Paulo')::date d, count(*) n, sum(total) t
    from v3_vendas where loja_id = p_destino and not excluido and legado_id is not null group by 1)
  select coalesce(a.d,b.d), coalesce(a.n,0), coalesce(a.t,0), coalesce(b.n,0), coalesce(b.t,0),
    coalesce(b.t,0) - coalesce(a.t,0), coalesce(a.n,0) = coalesce(b.n,0) and coalesce(a.t,0) = coalesce(b.t,0)
  from a full join b on a.d = b.d order by 1
$$;

revoke all on function v3_migrar_legado(text,text) from public, anon, authenticated;
revoke all on function v3_conferir_migracao(text,text) from public, anon, authenticated;
revoke all on function v3_unidade(text) from public, anon, authenticated;
