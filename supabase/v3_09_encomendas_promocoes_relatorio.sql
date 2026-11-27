-- v3_09: encomendas, promoções sugeridas, relatório diário (pg_cron)

-- ---------- encomendas (Caixa e Admin; apagar só Admin) ----------
create or replace function v3_salvar_encomenda(p_loja text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare papel text := v3_exigir(p_loja); eid text := p->>'id'; it jsonb; i int := 0; atual v3_encomendas; st text;
begin
  if eid is null or eid = '' then raise exception 'id_obrigatorio'; end if;
  select * into atual from v3_encomendas where loja_id = p_loja and id = eid for update;
  if coalesce((p->>'excluido')::boolean, false) and papel <> 'admin' then raise exception 'so_admin' using errcode = '42501'; end if;
  st := coalesce(p->>'status', atual.status, 'pendente');
  if st not in ('pendente','separando','pronta','entregue','cancelada') then raise exception 'status_invalido'; end if;
  if not found then
    insert into v3_encomendas(loja_id, id, cliente, telefone, tipo, endereco, data_entrega, descricao, status, valor, sinal, pago,
      forma_pagamento, pago_em, concluido_em, criado_por, criado_em)
    values (p_loja, eid, left(p->>'cliente', 80), left(p->>'telefone', 30), coalesce(p->>'tipo','retirada'), left(p->>'endereco', 200),
      p->>'data_entrega', left(p->>'descricao', 500), st, coalesce(v3_num(p,'valor'),0), coalesce(v3_num(p,'sinal'),0),
      coalesce((p->>'pago')::boolean, false), p->>'forma_pagamento',
      case when coalesce((p->>'pago')::boolean, false) then now() end,
      case when st in ('entregue','cancelada') then now() end, auth.uid(),
      least(coalesce((p->>'criado_em')::timestamptz, now()), now() + interval '5 minutes'));
  else
    update v3_encomendas set
      cliente = case when p ? 'cliente' then left(p->>'cliente', 80) else cliente end,
      telefone = case when p ? 'telefone' then left(p->>'telefone', 30) else telefone end,
      tipo = coalesce(p->>'tipo', tipo),
      endereco = case when p ? 'endereco' then left(p->>'endereco', 200) else endereco end,
      data_entrega = case when p ? 'data_entrega' then p->>'data_entrega' else data_entrega end,
      descricao = case when p ? 'descricao' then left(p->>'descricao', 500) else descricao end,
      status = st,
      valor = coalesce(v3_num(p,'valor'), valor), sinal = coalesce(v3_num(p,'sinal'), sinal),
      pago = coalesce((p->>'pago')::boolean, pago),
      forma_pagamento = coalesce(p->>'forma_pagamento', forma_pagamento),
      pago_em = case when coalesce((p->>'pago')::boolean, pago) and not pago then now() when not coalesce((p->>'pago')::boolean, pago) then null else pago_em end,
      concluido_em = case when st in ('entregue','cancelada') and status not in ('entregue','cancelada') then now()
                          when st not in ('entregue','cancelada') then null else concluido_em end,
      excluido = coalesce((p->>'excluido')::boolean, excluido),
      atualizado_em = now()
    where loja_id = p_loja and id = eid;
  end if;
  if p ? 'itens' then
    delete from v3_encomenda_itens where loja_id = p_loja and encomenda_id = eid;
    for it in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
      i := i + 1;
      if coalesce(v3_num(it,'quantidade'),0) <= 0 then raise exception 'quantidade_invalida'; end if;
      insert into v3_encomenda_itens(loja_id, id, encomenda_id, produto_id, nome, quantidade, preco_unit)
      values (p_loja, coalesce(nullif(it->>'id',''), eid || '-' || i), eid, nullif(it->>'produto_id',''), coalesce(it->>'nome','Item'),
        v3_num(it,'quantidade'), coalesce(v3_num(it,'preco_unit'),0));
    end loop;
  end if;
  perform v3_log(p_loja, 'encomenda', 'v3_encomendas', eid, coalesce(p->>'cliente', atual.cliente, '') || ' · ' || st);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- promoções ----------
create or replace function v3_gerar_promocoes(p_loja text, p_dia date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date); r record; n int := 0;
  motivos jsonb; fator numeric; minimo numeric; sug numeric; custo numeric;
begin
  for r in
    with vend as (
      select i.produto_id, sum(i.quantidade) filter (where v.criado_em >= (d - 14)::timestamp at time zone 'America/Sao_Paulo') q14,
             max(v.criado_em) ultima
      from v3_venda_itens i join v3_vendas v on v.loja_id = i.loja_id and v.id = i.venda_id and not v.excluido
      where i.loja_id = p_loja and i.produto_id is not null and v.criado_em >= (d - 60)::timestamp at time zone 'America/Sao_Paulo'
      group by 1),
    val as (
      select ei.produto_id, min(ei.validade_em) validade
      from v3_entrada_itens ei join v3_entradas e on e.loja_id = ei.loja_id and e.id = ei.entrada_id and not e.excluido
      where ei.loja_id = p_loja and ei.validade_em is not null and ei.validade_em >= d - 1 and e.data >= d - 30
      group by 1)
    select p.id, p.preco, p.base_custo, c.estoque, c.custo_medio, c.custo_ultimo, c.ultima_entrada_em,
           coalesce(vend.q14, 0) q14, vend.ultima, val.validade
    from v3_produtos p join v3_produto_custos c on c.loja_id = p.loja_id and c.produto_id = p.id
    left join vend on vend.produto_id = p.id left join val on val.produto_id = p.id
    where p.loja_id = p_loja and p.ativo and not p.excluido and p.preco > 0 and c.estoque > 0
      and not (p.preco_promocional is not null and coalesce(p.promo_expira_em, 'infinity') > now())
  loop
    motivos := '[]'::jsonb; fator := 1;
    if r.validade is not null and r.validade <= d + 2 then
      motivos := motivos || jsonb_build_object('tipo','validade','texto','vence em ' || to_char(r.validade,'DD/MM')); fator := least(fator, 0.75);
    end if;
    if (r.ultima is null or r.ultima < (d - 5)::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(r.ultima_entrada_em, r.ultima, '2000-01-01') < (d - 3)::timestamp at time zone 'America/Sao_Paulo' then
      motivos := motivos || jsonb_build_object('tipo','parado','texto','sem venda há ' ||
        coalesce((d - (r.ultima at time zone 'America/Sao_Paulo')::date)::text || ' dias', 'muito tempo')); fator := least(fator, 0.85);
    end if;
    if r.q14 > 0 and r.estoque > 10 * (r.q14 / 14.0) then
      motivos := motivos || jsonb_build_object('tipo','estoque_alto','texto','estoque para ' || round(r.estoque / (r.q14 / 14.0)) || ' dias'); fator := least(fator, 0.85);
    end if;
    continue when jsonb_array_length(motivos) = 0;
    custo := case when r.base_custo = 'ultimo' then coalesce(r.custo_ultimo, r.custo_medio) else coalesce(r.custo_medio, r.custo_ultimo) end;
    minimo := case when custo is null then 0 else custo / 0.90 end;  -- nunca abaixo de 10% de margem
    sug := greatest(r.preco * fator, minimo);
    sug := v3_arredondar(p_loja, sug);
    if sug > r.preco * fator and sug - 0.5 >= minimo then sug := sug - 0.5; end if;  -- arredonda para baixo quando o arredondamento comeria o desconto
    continue when sug >= r.preco;
    insert into v3_promocoes_sugeridas(loja_id, dia, produto_id, motivos, preco_atual, preco_sugerido, margem_resultante)
    values (p_loja, d, r.id, motivos, r.preco, sug, case when custo is null or sug = 0 then null else round((sug - custo) / sug * 100, 1) end)
    on conflict (loja_id, dia, produto_id) do update set motivos = excluded.motivos, preco_atual = excluded.preco_atual,
      preco_sugerido = excluded.preco_sugerido, margem_resultante = excluded.margem_resultante
      where v3_promocoes_sugeridas.status = 'nova';
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function v3_gerar_promocoes(text,date) from public, anon, authenticated;

create or replace function v3_definir_promocao(p_loja text, p_produto text, p_preco numeric, p_dias integer default 3, p_dia_sugestao date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nome text;
begin
  perform v3_exigir(p_loja, true);
  if p_preco is not null and p_preco <= 0 then raise exception 'preco_invalido'; end if;
  update v3_produtos set preco_promocional = round(p_preco, 2),
    promo_inicia_em = case when p_preco is null then null else now() end,
    promo_expira_em = case when p_preco is null then null else ((now() at time zone 'America/Sao_Paulo')::date + greatest(coalesce(p_dias,3),1))::timestamp at time zone 'America/Sao_Paulo' end,
    atualizado_em = now()
  where loja_id = p_loja and id = p_produto returning v3_produtos.nome into nome;
  if p_dia_sugestao is not null then
    update v3_promocoes_sugeridas set status = 'aceita' where loja_id = p_loja and dia = p_dia_sugestao and produto_id = p_produto;
  end if;
  perform v3_log(p_loja, 'promocao', 'v3_produtos', p_produto, coalesce(nome,'') || ': ' || coalesce(round(p_preco,2)::text, 'sem promoção'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function v3_responder_promocao(p_loja text, p_dia date, p_produto text, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform v3_exigir(p_loja, true);
  if p_status not in ('nova','aceita','ignorada') then raise exception 'status_invalido'; end if;
  update v3_promocoes_sugeridas set status = p_status where loja_id = p_loja and dia = p_dia and produto_id = p_produto;
  return jsonb_build_object('ok', true);
end $$;

-- preço em promoção vale no caixa até expirar: função usada pelo app (só leitura) não é necessária — o app lê preco_promocional/promo_expira_em.

-- ---------- relatório diário ----------
create or replace function v3_gerar_relatorio(p_loja text, p_dia date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ini timestamptz := p_dia::timestamp at time zone 'America/Sao_Paulo'; fim timestamptz := (p_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
  margem numeric; r jsonb;
begin
  select coalesce(margem_padrao, 35) into margem from v3_configuracao where loja_id = p_loja;
  margem := coalesce(margem, 35);
  with v as (select * from v3_vendas where loja_id = p_loja and not excluido and criado_em >= ini and criado_em < fim),
  it as (select i.* from v3_venda_itens i join v on v.id = i.venda_id where i.loja_id = p_loja),
  sem as (select count(*) n, coalesce(sum(total),0) t from v3_vendas where loja_id = p_loja and not excluido
          and criado_em >= ini - interval '7 days' and criado_em < fim - interval '7 days')
  select jsonb_build_object(
    'dia', p_dia,
    'vendas', (select count(*) from v), 'total', (select coalesce(sum(total),0) from v),
    'ticket_medio', (select case when count(*) > 0 then round(sum(total)/count(*),2) else 0 end from v),
    'lucro', (select round(coalesce(sum(case when tem_itens and custo_total is not null then total - custo_total else total * margem / 100 end),0),2) from v),
    'lucro_estimado', (select coalesce(bool_or(not (tem_itens and custo_total is not null)), false) from v),
    'semana_passada', (select jsonb_build_object('vendas', n, 'total', t) from sem),
    'por_forma', (select coalesce(jsonb_object_agg(f, jsonb_build_object('vendas', n, 'total', t)), '{}') from (select coalesce(forma,'não informado') f, count(*) n, sum(total) t from v group by 1) x),
    'por_hora', (select coalesce(jsonb_object_agg(h, jsonb_build_object('vendas', n, 'total', t)), '{}') from (select extract(hour from criado_em at time zone 'America/Sao_Paulo')::int h, count(*) n, sum(total) t from v group by 1) x),
    'por_operador', (select coalesce(jsonb_object_agg(o, jsonb_build_object('vendas', n, 'total', t)), '{}') from (select coalesce(operador, case when origem = 'v3' then 'sem nome' else 'app antigo' end) o, count(*) n, sum(total) t from v group by 1) x),
    'por_origem', (select coalesce(jsonb_object_agg(origem, jsonb_build_object('vendas', n, 'total', t)), '{}') from (select origem, count(*) n, sum(total) t from v group by 1) x),
    'top_produtos', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (select coalesce(produto_id, nome) id, max(nome) nome, sum(quantidade) quantidade, sum(total) total,
        round(sum(total - coalesce(custo_unit,0) * quantidade) filter (where custo_unit is not null), 2) lucro from it group by 1 order by sum(total) desc limit 10) x),
    'entradas', (select jsonb_build_object('quantidade', count(*), 'total', coalesce(sum(total),0)) from v3_entradas where loja_id = p_loja and not excluido and criado_em >= ini and criado_em < fim),
    'perdas', (select jsonb_build_object('itens', count(*), 'custo', round(coalesce(sum(-quantidade * coalesce(custo_unitario,0)),0),2)) from v3_estoque_mov where loja_id = p_loja and tipo = 'perda' and criado_em >= ini and criado_em < fim),
    'estoque_baixo', (select coalesce(jsonb_agg(jsonb_build_object('produto', p.nome, 'estoque', c.estoque, 'minimo', p.estoque_minimo) order by p.nome), '[]')
        from v3_produtos p join v3_produto_custos c on c.loja_id = p.loja_id and c.produto_id = p.id
        where p.loja_id = p_loja and p.ativo and not p.excluido and p.estoque_minimo is not null and c.estoque <= p.estoque_minimo),
    'encomendas_amanha', (select count(*) from v3_encomendas where loja_id = p_loja and not excluido and status not in ('entregue','cancelada') and left(data_entrega,10) = (p_dia + 1)::text),
    'encomendas_atrasadas', (select count(*) from v3_encomendas where loja_id = p_loja and not excluido and status not in ('entregue','cancelada') and left(data_entrega,10) < p_dia::text and data_entrega ~ '^\d{4}-\d{2}-\d{2}'),
    'promocoes_sugeridas', (select count(*) from v3_promocoes_sugeridas where loja_id = p_loja and dia = p_dia + 1 and status = 'nova')
  ) into r;
  insert into v3_relatorios_diarios(loja_id, dia, dados, gerado_em) values (p_loja, p_dia, r, now())
  on conflict (loja_id, dia) do update set dados = excluded.dados, gerado_em = now();
  return r;
end $$;
revoke all on function v3_gerar_relatorio(text,date) from public, anon, authenticated;

-- Admin pede o relatório/sugestões na hora (ex.: o de hoje até agora)
create or replace function v3_relatorio_agora(p_loja text, p_dia date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
begin
  perform v3_exigir(p_loja, true);
  perform v3_gerar_promocoes(p_loja, (now() at time zone 'America/Sao_Paulo')::date);
  return v3_gerar_relatorio(p_loja, d);
end $$;

-- rotina diária: 00:10 de Brasília = 03:10 UTC → relatório de ontem + sugestões de hoje, para todas as lojas
create or replace function v3_rotina_diaria() returns jsonb
language plpgsql security definer set search_path = public as $$
declare l text; hoje date := (now() at time zone 'America/Sao_Paulo')::date; out jsonb := '{}';
begin
  for l in select id from v3_lojas loop
    perform v3_gerar_relatorio(l, hoje - 1);
    out := out || jsonb_build_object(l, v3_gerar_promocoes(l, hoje));
  end loop;
  return out;
end $$;
revoke all on function v3_rotina_diaria() from public, anon, authenticated;

grant execute on function v3_salvar_encomenda(text,jsonb), v3_definir_promocao(text,text,numeric,integer,date),
  v3_responder_promocao(text,date,text,text), v3_relatorio_agora(text,date) to authenticated;
revoke all on function v3_salvar_encomenda(text,jsonb), v3_definir_promocao(text,text,numeric,integer,date),
  v3_responder_promocao(text,date,text,text), v3_relatorio_agora(text,date) from public, anon;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'v3-rotina-diaria') then perform cron.unschedule('v3-rotina-diaria'); end if;
end $$;
select cron.schedule('v3-rotina-diaria', '10 3 * * *', $$select public.v3_rotina_diaria()$$);

do $$
declare t text;
begin
  foreach t in array array['v3_precos_diarios','v3_relatorios_diarios'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
