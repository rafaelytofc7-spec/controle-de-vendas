-- v3_07: nome do operador nas vendas, vigia de sincronização e exportação para o backup no GitHub
alter table v3_vendas add column if not exists operador text check (operador is null or char_length(operador) <= 40);
alter table v3_aparelhos add column if not exists operador text;
alter table v3_aparelhos add column if not exists sync_em timestamptz;            -- último "sinal de vida" recebido
alter table v3_aparelhos add column if not exists sync_ok_em timestamptz;         -- última vez que o aparelho ficou 100% em dia
alter table v3_aparelhos add column if not exists pendentes integer not null default 0;
alter table v3_aparelhos add column if not exists faltando_servidor integer not null default 0;
alter table v3_aparelhos add column if not exists faltando_aparelho integer not null default 0;
alter table v3_aparelhos add column if not exists atraso_seg integer not null default 0;

-- chave do backup (só o hash fica no banco)
create table if not exists v3_backup_chaves (
  id text primary key,
  hash text not null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);
alter table v3_backup_chaves enable row level security;  -- sem policy: ninguém lê pela API

-- manifesto por dia (horário de São Paulo): quantidade e soma das ativas + hash de todos os ids (com flag de exclusão)
create or replace function v3_manifesto(p_loja text, p_de date, p_ate date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(d, jsonb_build_object('n', n, 'soma', soma, 'hash', h)), '{}'::jsonb) from (
    select (criado_em at time zone 'America/Sao_Paulo')::date d,
      count(*) filter (where not excluido) n,
      coalesce(sum(total) filter (where not excluido), 0)::numeric(14,2) soma,
      encode(sha256(convert_to(string_agg(id || case when excluido then ':x' else '' end, ',' order by id collate "C"), 'UTF8')), 'hex') h
    from v3_vendas
    where loja_id = p_loja
      and criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
      and criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
    group by 1) x
$$;
revoke all on function v3_manifesto(text,date,date) from public, anon, authenticated;

-- aparelho manda o "sinal de vida" + o que tem; recebe o manifesto do servidor para comparar
create or replace function v3_sync_sinal(p_loja text, p jsonb, p_versao integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare de date := coalesce((p->>'de')::date, (now() at time zone 'America/Sao_Paulo')::date - 7);
  ate date := (now() at time zone 'America/Sao_Paulo')::date + 1;
begin
  perform v3_exigir(p_loja);
  if de < ate - 40 then de := ate - 40; end if;
  update v3_aparelhos set
    sync_em = now(),
    sync_ok_em = case when coalesce((p->>'em_dia')::boolean, false) then now() else sync_ok_em end,
    operador = left(nullif(trim(p->>'operador'), ''), 40),
    pendentes = greatest(coalesce((p->>'pendentes')::int, 0), 0),
    faltando_servidor = greatest(coalesce((p->>'faltando_servidor')::int, 0), 0),
    faltando_aparelho = greatest(coalesce((p->>'faltando_aparelho')::int, 0), 0),
    atraso_seg = greatest(coalesce((p->>'atraso_seg')::int, 0), 0),
    versao_code = coalesce(p_versao, versao_code),
    ultimo_acesso = now()
  where loja_id = p_loja and uid = auth.uid();
  return jsonb_build_object('agora', now(), 'dias', v3_manifesto(p_loja, de, ate));
end $$;

-- ids (com flag de exclusão e hora da última mudança) de um dia, para achar o que falta
create or replace function v3_sync_ids(p_loja text, p_dia date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform v3_exigir(p_loja);
  return coalesce((select jsonb_agg(jsonb_build_array(id, excluido, atualizado_em) order by id) from v3_vendas
    where loja_id = p_loja
      and criado_em >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
      and criado_em < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')), '[]'::jsonb);
end $$;

grant execute on function v3_sync_sinal(text,jsonb,integer), v3_sync_ids(text,date) to authenticated;
revoke all on function v3_sync_sinal(text,jsonb,integer), v3_sync_ids(text,date) from public, anon;

-- exportação para o backup (GitHub Action). Chamada com a chave de backup; só leitura.
create or replace function v3_backup_exportar(p_loja text, p_chave text, p_desde timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean; d timestamptz := coalesce(p_desde, '2000-01-01'::timestamptz); r jsonb;
begin
  select exists (select 1 from v3_backup_chaves where hash = crypt(p_chave, hash)) into ok;
  if not ok or p_chave is null or length(p_chave) < 32 then raise exception 'chave_invalida' using errcode = '42501'; end if;
  if not exists (select 1 from v3_lojas where id = p_loja) then raise exception 'loja_inexistente'; end if;
  select jsonb_build_object(
    'gerado_em', now(), 'loja', p_loja, 'desde', p_desde,
    'vendas', (select coalesce(jsonb_agg(to_jsonb(v) - 'loja_id' || jsonb_build_object('itens',
        (select coalesce(jsonb_agg(to_jsonb(i) - 'loja_id' - 'venda_id' order by i.id), '[]'::jsonb) from v3_venda_itens i where i.loja_id = p_loja and i.venda_id = v.id))
        order by v.criado_em, v.id), '[]'::jsonb)
      from v3_vendas v where v.loja_id = p_loja and v.atualizado_em >= d),
    'entradas', (select coalesce(jsonb_agg(to_jsonb(e) - 'loja_id' || jsonb_build_object('itens',
        (select coalesce(jsonb_agg(to_jsonb(i) - 'loja_id' - 'entrada_id' order by i.id), '[]'::jsonb) from v3_entrada_itens i where i.loja_id = p_loja and i.entrada_id = e.id))
        order by e.criado_em, e.id), '[]'::jsonb)
      from v3_entradas e where e.loja_id = p_loja and e.atualizado_em >= d),
    'estoque_mov', (select coalesce(jsonb_agg(to_jsonb(m) - 'loja_id' order by m.criado_em, m.id), '[]'::jsonb) from v3_estoque_mov m where m.loja_id = p_loja and m.criado_em >= d),
    'precos_diarios', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.dia, x.produto_id, x.fornecedor_id), '[]'::jsonb) from v3_precos_diarios x
       where x.loja_id = p_loja and x.dia >= (d at time zone 'America/Sao_Paulo')::date - 1),
    'relatorios', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.dia), '[]'::jsonb) from v3_relatorios_diarios x where x.loja_id = p_loja and x.gerado_em >= d),
    'cadastro', jsonb_build_object(
      'configuracao', (select to_jsonb(c) - 'loja_id' from v3_configuracao c where c.loja_id = p_loja),
      'produtos', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.id), '[]'::jsonb) from v3_produtos x where x.loja_id = p_loja),
      'codigos', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.codigo), '[]'::jsonb) from v3_produto_codigos x where x.loja_id = p_loja),
      'custos', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.produto_id), '[]'::jsonb) from v3_produto_custos x where x.loja_id = p_loja),
      'fornecedores', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.id), '[]'::jsonb) from v3_fornecedores x where x.loja_id = p_loja),
      'encomendas', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' || jsonb_build_object('itens',
          (select coalesce(jsonb_agg(to_jsonb(i) - 'loja_id' - 'encomenda_id' order by i.id), '[]'::jsonb) from v3_encomenda_itens i where i.loja_id = p_loja and i.encomenda_id = x.id))
          order by x.id), '[]'::jsonb) from v3_encomendas x where x.loja_id = p_loja),
      'cobrancas', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.id), '[]'::jsonb) from v3_cobrancas x where x.loja_id = p_loja),
      'promocoes_sugeridas', (select coalesce(jsonb_agg(to_jsonb(x) - 'loja_id' order by x.dia, x.produto_id), '[]'::jsonb) from v3_promocoes_sugeridas x where x.loja_id = p_loja),
      'aparelhos', (select coalesce(jsonb_agg(jsonb_build_object('nome', a.nome, 'papel', a.papel, 'bloqueado', a.bloqueado, 'plataforma', a.plataforma,
          'versao_code', a.versao_code, 'operador', a.operador, 'sync_em', a.sync_em, 'pendentes', a.pendentes,
          'faltando_servidor', a.faltando_servidor, 'faltando_aparelho', a.faltando_aparelho, 'criado_em', a.criado_em) order by a.criado_em), '[]'::jsonb)
        from v3_aparelhos a where a.loja_id = p_loja)),
    'manifesto', v3_manifesto(p_loja, '2000-01-01', (now() at time zone 'America/Sao_Paulo')::date + 1),
    -- cópia do app antigo que a rotina de hora em hora grava (public.vendas, loja principal): só contagem e soma por dia
    'app_antigo_por_dia', (select coalesce(jsonb_object_agg(dia, jsonb_build_object('n', n, 'soma', soma)), '{}'::jsonb) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date dia, count(*) n, sum(round(valor,2))::numeric(14,2) soma
        from vendas where loja_id = 'principal' and not excluido and valor >= 0 group by 1) z),
    'v3_legado_por_dia', (select coalesce(jsonb_object_agg(dia, jsonb_build_object('n', n, 'soma', soma)), '{}'::jsonb) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date dia, count(*) n, sum(total)::numeric(14,2) soma
        from v3_vendas where loja_id = p_loja and not excluido and legado_id is not null group by 1) z),
    -- só o que veio do app antigo (criado_por = 'importado'), para comparar com a cópia somente-leitura dele
    'app_antigo_importado_por_dia', (select coalesce(jsonb_object_agg(dia, jsonb_build_object('n', n, 'soma', soma)), '{}'::jsonb) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date dia, count(*) n, sum(round(valor,2))::numeric(14,2) soma
        from vendas where loja_id = 'principal' and not excluido and valor >= 0 and criado_por = 'importado' group by 1) z),
    'v3_app_antigo_por_dia', (select coalesce(jsonb_object_agg(dia, jsonb_build_object('n', n, 'soma', soma)), '{}'::jsonb) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date dia, count(*) n, sum(total)::numeric(14,2) soma
        from v3_vendas where loja_id = p_loja and not excluido and origem = 'app_antigo' group by 1) z)
  ) into r;
  update v3_backup_chaves set usado_em = now() where hash = crypt(p_chave, hash);
  return r;
end $$;
revoke all on function v3_backup_exportar(text,text,timestamptz) from public, authenticated;
grant execute on function v3_backup_exportar(text,text,timestamptz) to anon;

-- venda guarda o nome do operador
create or replace function v3_registrar_venda(p_loja text, p jsonb, p_plataforma text default 'android', p_versao integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare vid text := p->>'id'; it jsonb; pr v3_produtos; cu v3_produto_custos; custo numeric; custo_tot numeric := 0;
  qtd numeric; tem boolean := false; tot_itens numeric := 0; sem_custo boolean := false; i int := 0;
begin
  perform v3_exigir(p_loja);
  perform v3_checar_versao(p_plataforma, p_versao);
  if vid is null or vid = '' then raise exception 'id_obrigatorio'; end if;
  if exists (select 1 from v3_vendas where loja_id = p_loja and id = vid) then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;
  if coalesce(v3_num(p,'total'),-1) < 0 then raise exception 'total_invalido'; end if;
  insert into v3_vendas(loja_id, id, total, forma, recebido, troco, desconto, origem, aparelho, versao_code, criado_em, operador)
  values (p_loja, vid, round(v3_num(p,'total'),2), p->>'forma', v3_num(p,'recebido'), v3_num(p,'troco'), coalesce(v3_num(p,'desconto'),0),
    'v3', auth.uid(), p_versao, least(coalesce((p->>'criado_em')::timestamptz, now()), now() + interval '5 minutes'),
    left(nullif(trim(p->>'operador'), ''), 40));
  for it in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    i := i + 1; tem := true;
    qtd := v3_num(it,'quantidade');
    if qtd is null or qtd <= 0 then raise exception 'quantidade_invalida'; end if;
    custo := null;
    if nullif(it->>'produto_id','') is not null then
      select * into pr from v3_produtos where loja_id = p_loja and id = it->>'produto_id';
      select * into cu from v3_produto_custos where loja_id = p_loja and produto_id = it->>'produto_id' for update;
      if found then
        custo := case when pr.base_custo = 'ultimo' then coalesce(cu.custo_ultimo, cu.custo_medio) else coalesce(cu.custo_medio, cu.custo_ultimo) end;
        update v3_produto_custos set estoque = estoque - qtd, atualizado_em = now() where loja_id = p_loja and produto_id = it->>'produto_id';
      else
        insert into v3_produto_custos(loja_id, produto_id, estoque) values (p_loja, it->>'produto_id', -qtd) on conflict do nothing;
      end if;
      insert into v3_estoque_mov(loja_id, produto_id, tipo, quantidade, custo_unitario, ref_id, criado_por)
      values (p_loja, it->>'produto_id', 'venda', -qtd, custo, vid, auth.uid());
    end if;
    if custo is null then sem_custo := true; else custo_tot := custo_tot + custo * qtd; end if;
    insert into v3_venda_itens(loja_id, id, venda_id, produto_id, nome, unidade, quantidade, preco_unit, custo_unit, total)
    values (p_loja, coalesce(nullif(it->>'id',''), vid || '-' || i), vid, nullif(it->>'produto_id',''), coalesce(it->>'nome','Item'), it->>'unidade',
      qtd, coalesce(v3_num(it,'preco_unit'),0), custo, round(coalesce(v3_num(it,'total'), qtd * coalesce(v3_num(it,'preco_unit'),0)),2));
    tot_itens := tot_itens + round(coalesce(v3_num(it,'total'), qtd * coalesce(v3_num(it,'preco_unit'),0)),2);
  end loop;
  if tem then
    update v3_vendas set tem_itens = true, custo_total = case when sem_custo then null else round(custo_tot,2) end where loja_id = p_loja and id = vid;
  end if;
  return jsonb_build_object('ok', true);
end $$;
