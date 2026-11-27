-- Controle de Vendas v3 — segurança (RLS) e funções.

-- ---------- helpers ----------
create or replace function v3_minhas_lojas() returns setof text
language sql stable security definer set search_path = public as $$
  select loja_id from v3_aparelhos where uid = auth.uid() and not bloqueado
$$;

create or replace function v3_papel(p_loja text) returns text
language sql stable security definer set search_path = public as $$
  select papel from v3_aparelhos where loja_id = p_loja and uid = auth.uid() and not bloqueado
$$;

create or replace function v3_exigir(p_loja text, p_admin boolean default false) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'sem_login' using errcode = '28000'; end if;
  v := v3_papel(p_loja);
  if v is null then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if p_admin and v <> 'admin' then raise exception 'so_admin' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function v3_checar_versao(p_plataforma text, p_versao integer) returns void
language plpgsql stable security definer set search_path = public as $$
declare m integer;
begin
  select minima into m from v3_app_versao where plataforma = coalesce(p_plataforma,'android');
  if m is not null and coalesce(p_versao,0) < m then
    raise exception 'versao_antiga' using errcode = 'P0001', hint = 'atualize o app';
  end if;
end $$;

create or replace function v3_num(j jsonb, k text) returns numeric
language sql immutable as $$ select nullif(j->>k,'')::numeric $$;

create or replace function v3_log(p_loja text, p_acao text, p_tabela text, p_id text, p_resumo text) returns void
language sql security definer set search_path = public as $$
  insert into v3_atividades(loja_id, uid, acao, tabela, registro_id, resumo) values (p_loja, auth.uid(), p_acao, p_tabela, p_id, left(p_resumo, 200))
$$;

-- ---------- RLS: só leitura para aparelhos da loja ----------
do $$
declare t text;
begin
  foreach t in array array['v3_configuracao','v3_fornecedores','v3_produtos','v3_produto_codigos','v3_produto_custos',
    'v3_entradas','v3_entrada_itens','v3_estoque_mov','v3_vendas','v3_venda_itens','v3_encomendas','v3_encomenda_itens',
    'v3_cobrancas','v3_precos_diarios','v3_promocoes_sugeridas','v3_relatorios_diarios','v3_atividades','v3_aparelhos']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists ler on %I', t);
    execute format('create policy ler on %I for select to authenticated using (loja_id in (select v3_minhas_lojas()))', t);
    execute format('revoke insert, update, delete, truncate on %I from anon, authenticated', t);
  end loop;
  foreach t in array array['v3_lojas','v3_loja_segredos','v3_convites','v3_tentativas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

alter table v3_app_versao enable row level security;
drop policy if exists ler on v3_app_versao;
create policy ler on v3_app_versao for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on v3_app_versao from anon, authenticated;

-- ---------- entrada do aparelho ----------
create or replace function v3_entrar(p_loja text, p_codigo text default null, p_nome text default null,
  p_plataforma text default null, p_versao integer default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u uuid := auth.uid(); a v3_aparelhos; s v3_loja_segredos; c v3_convites; papel_novo text; cod text;
begin
  if u is null then raise exception 'sem_login' using errcode = '28000'; end if;
  select * into a from v3_aparelhos where loja_id = p_loja and uid = u;
  if found then
    if a.bloqueado then raise exception 'bloqueado' using errcode = '42501'; end if;
    update v3_aparelhos set ultimo_acesso = now(), plataforma = coalesce(p_plataforma, plataforma),
      versao_code = coalesce(p_versao, versao_code) where loja_id = p_loja and uid = u;
    -- código de recuperação/convite também serve para virar admin num aparelho que já é caixa
    if a.papel = 'admin' or p_codigo is null or p_codigo = '' then
      return jsonb_build_object('papel', a.papel, 'nome', a.nome);
    end if;
  end if;
  if (select count(*) from v3_tentativas where uid = u and em > now() - interval '10 minutes') >= 8 then
    raise exception 'muitas_tentativas' using errcode = '42501';
  end if;
  cod := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  select * into s from v3_loja_segredos where loja_id = p_loja;
  if cod <> '' and s.codigo_recuperacao_hash is not null and crypt(cod, s.codigo_recuperacao_hash) = s.codigo_recuperacao_hash then
    papel_novo := 'admin';
  else
    select * into c from v3_convites where codigo = cod and loja_id = p_loja and usado_por is null and expira_em > now() for update;
    if found then
      papel_novo := c.papel;
      update v3_convites set usado_por = u, usado_em = now() where codigo = cod;
    elsif cod <> '' and s.codigo_entrada_hash is not null and crypt(cod, s.codigo_entrada_hash) = s.codigo_entrada_hash then
      papel_novo := 'caixa';
    end if;
  end if;
  if papel_novo is null then
    insert into v3_tentativas(uid) values (u);
    if a.uid is not null then return jsonb_build_object('papel', a.papel, 'nome', a.nome, 'erro', 'codigo_invalido'); end if;
    -- devolve (sem exceção) para a tentativa ficar registrada
    return jsonb_build_object('erro', 'codigo_invalido');
  end if;
  if a.uid is not null then
    if papel_novo = 'admin' then
      update v3_aparelhos set papel = 'admin', ultimo_acesso = now() where loja_id = p_loja and uid = u;
      perform v3_log(p_loja, 'virou_admin', 'v3_aparelhos', u::text, a.nome);
    end if;
    return jsonb_build_object('papel', case when papel_novo = 'admin' then 'admin' else a.papel end, 'nome', a.nome);
  end if;
  insert into v3_aparelhos(loja_id, uid, nome, papel, plataforma, versao_code, ultimo_acesso)
  values (p_loja, u, coalesce(nullif(left(trim(p_nome),40),''), case when papel_novo='admin' then 'Admin' else 'Caixa' end),
          papel_novo, p_plataforma, p_versao, now());
  perform v3_log(p_loja, 'entrou', 'v3_aparelhos', u::text, papel_novo);
  return jsonb_build_object('papel', papel_novo, 'nome', coalesce(nullif(left(trim(p_nome),40),''), 'Caixa'));
end $$;

create or replace function v3_criar_convite(p_loja text, p_papel text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare cod text; alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  perform v3_exigir(p_loja, true);
  if p_papel not in ('admin','caixa') then raise exception 'papel_invalido'; end if;
  loop
    cod := '';
    for i in 1..8 loop cod := cod || substr(alfabeto, 1 + (get_byte(gen_random_bytes(1),0) % 32), 1); end loop;
    exit when not exists (select 1 from v3_convites where codigo = cod);
  end loop;
  delete from v3_convites where expira_em < now() - interval '1 day';
  insert into v3_convites(codigo, loja_id, papel, criado_por, expira_em) values (cod, p_loja, p_papel, auth.uid(), now() + interval '10 minutes');
  perform v3_log(p_loja, 'convite', 'v3_convites', null, p_papel);
  return jsonb_build_object('codigo', cod, 'expira_em', now() + interval '10 minutes');
end $$;

create or replace function v3_renomear_aparelho(p_loja text, p_nome text, p_uid uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_uid is not null and p_uid <> auth.uid() then perform v3_exigir(p_loja, true); else perform v3_exigir(p_loja); end if;
  update v3_aparelhos set nome = left(trim(p_nome),40) where loja_id = p_loja and uid = coalesce(p_uid, auth.uid());
end $$;

create or replace function v3_definir_aparelho(p_loja text, p_uid uuid, p_papel text, p_bloqueado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform v3_exigir(p_loja, true);
  if p_uid = auth.uid() then raise exception 'nao_pode_alterar_a_si_mesmo'; end if;
  update v3_aparelhos set papel = coalesce(p_papel, papel), bloqueado = coalesce(p_bloqueado, bloqueado) where loja_id = p_loja and uid = p_uid;
  perform v3_log(p_loja, 'aparelho', 'v3_aparelhos', p_uid::text, coalesce(p_papel,'') || case when p_bloqueado then ' bloqueado' else '' end);
end $$;

-- ---------- preço/arredondamento ----------
create or replace function v3_arredondar(p_loja text, v numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare modo text; r numeric; inteiro numeric;
begin
  if v is null then return null; end if;
  select arredondamento into modo from v3_configuracao where loja_id = p_loja;
  modo := coalesce(modo, '49_99');
  if modo = 'nenhum' then return round(v, 2); end if;
  if modo = 'x9' then return ceil(v * 10) / 10 - 0.01; end if;
  inteiro := floor(v);
  if v <= inteiro + 0.49 then r := inteiro + 0.49; else r := inteiro + 0.99; end if;
  if r < 0.49 then r := 0.49; end if;
  return r;
end $$;

-- ---------- produtos ----------
create or replace function v3_salvar_produto(p_loja text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare papel text := v3_exigir(p_loja); existe v3_produtos; pid text := p->>'id'; c text;
begin
  if pid is null or pid = '' then raise exception 'id_obrigatorio'; end if;
  select * into existe from v3_produtos where loja_id = p_loja and id = pid;
  if found and papel <> 'admin' then raise exception 'so_admin' using errcode = '42501'; end if;
  if not found then
    insert into v3_produtos(loja_id, id, nome, categoria, unidade, preco, margem_desejada, base_custo, perda_padrao,
      estoque_minimo, validade_dias, fornecedor_id, ordem, criado_por)
    values (p_loja, pid, trim(p->>'nome'), p->>'categoria', coalesce(p->>'unidade','un'), coalesce(v3_num(p,'preco'),0),
      case when papel='admin' then v3_num(p,'margem_desejada') end, coalesce(p->>'base_custo','medio'),
      case when papel='admin' then coalesce(v3_num(p,'perda_padrao'),0) else 0 end,
      v3_num(p,'estoque_minimo'), (p->>'validade_dias')::int, nullif(p->>'fornecedor_id',''), coalesce((p->>'ordem')::int,0), auth.uid());
    insert into v3_produto_custos(loja_id, produto_id) values (p_loja, pid) on conflict do nothing;
    perform v3_log(p_loja, 'criar', 'v3_produtos', pid, p->>'nome');
  else
    update v3_produtos set
      nome = coalesce(trim(p->>'nome'), nome),
      categoria = case when p ? 'categoria' then p->>'categoria' else categoria end,
      unidade = coalesce(p->>'unidade', unidade),
      preco = coalesce(v3_num(p,'preco'), preco),
      preco_promocional = case when p ? 'preco_promocional' then v3_num(p,'preco_promocional') else preco_promocional end,
      promo_inicia_em = case when p ? 'promo_inicia_em' then (p->>'promo_inicia_em')::timestamptz else promo_inicia_em end,
      promo_expira_em = case when p ? 'promo_expira_em' then (p->>'promo_expira_em')::timestamptz else promo_expira_em end,
      margem_desejada = case when p ? 'margem_desejada' then v3_num(p,'margem_desejada') else margem_desejada end,
      base_custo = coalesce(p->>'base_custo', base_custo),
      perda_padrao = coalesce(v3_num(p,'perda_padrao'), perda_padrao),
      estoque_minimo = case when p ? 'estoque_minimo' then v3_num(p,'estoque_minimo') else estoque_minimo end,
      validade_dias = case when p ? 'validade_dias' then (p->>'validade_dias')::int else validade_dias end,
      fornecedor_id = case when p ? 'fornecedor_id' then nullif(p->>'fornecedor_id','') else fornecedor_id end,
      ativo = coalesce((p->>'ativo')::boolean, ativo),
      excluido = coalesce((p->>'excluido')::boolean, excluido),
      ordem = coalesce((p->>'ordem')::int, ordem),
      atualizado_em = now()
    where loja_id = p_loja and id = pid;
    if existe.preco is distinct from v3_num(p,'preco') and v3_num(p,'preco') is not null then
      perform v3_log(p_loja, 'preco', 'v3_produtos', pid, existe.nome || ': ' || existe.preco || ' -> ' || v3_num(p,'preco'));
    else
      perform v3_log(p_loja, 'editar', 'v3_produtos', pid, existe.nome);
    end if;
  end if;
  if p ? 'codigos' then
    if papel = 'admin' then delete from v3_produto_codigos where loja_id = p_loja and produto_id = pid
      and codigo not in (select jsonb_array_elements_text(p->'codigos')); end if;
    for c in select jsonb_array_elements_text(p->'codigos') loop
      insert into v3_produto_codigos(loja_id, codigo, produto_id) values (p_loja, c, pid)
      on conflict (loja_id, codigo) do update set produto_id = excluded.produto_id where papel = 'admin';
    end loop;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function v3_vincular_codigo(p_loja text, p_codigo text, p_produto text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare papel text := v3_exigir(p_loja); atual text;
begin
  select produto_id into atual from v3_produto_codigos where loja_id = p_loja and codigo = p_codigo;
  if atual is not null and atual <> p_produto and papel <> 'admin' then raise exception 'codigo_ja_usado'; end if;
  insert into v3_produto_codigos(loja_id, codigo, produto_id) values (p_loja, p_codigo, p_produto)
  on conflict (loja_id, codigo) do update set produto_id = excluded.produto_id;
  perform v3_log(p_loja, 'codigo', 'v3_produto_codigos', p_produto, p_codigo);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- fornecedores (admin) ----------
create or replace function v3_salvar_fornecedor(p_loja text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform v3_exigir(p_loja, true);
  insert into v3_fornecedores(loja_id, id, nome, tipo, telefone, observacoes, ativo, excluido)
  values (p_loja, p->>'id', trim(p->>'nome'), p->>'tipo', p->>'telefone', p->>'observacoes', coalesce((p->>'ativo')::boolean,true), coalesce((p->>'excluido')::boolean,false))
  on conflict (loja_id, id) do update set nome = coalesce(trim(excluded.nome), v3_fornecedores.nome), tipo = excluded.tipo,
    telefone = excluded.telefone, observacoes = excluded.observacoes, ativo = excluded.ativo, excluido = excluded.excluido, atualizado_em = now();
  perform v3_log(p_loja, 'fornecedor', 'v3_fornecedores', p->>'id', p->>'nome');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- vendas ----------
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
  insert into v3_vendas(loja_id, id, total, forma, recebido, troco, desconto, origem, aparelho, versao_code, criado_em)
  values (p_loja, vid, round(v3_num(p,'total'),2), p->>'forma', v3_num(p,'recebido'), v3_num(p,'troco'), coalesce(v3_num(p,'desconto'),0),
    'v3', auth.uid(), p_versao, least(coalesce((p->>'criado_em')::timestamptz, now()), now() + interval '5 minutes'));
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

create or replace function v3_excluir_venda(p_loja text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare papel text := v3_exigir(p_loja); v v3_vendas; m record;
begin
  select * into v from v3_vendas where loja_id = p_loja and id = p_id for update;
  if not found or v.excluido then return jsonb_build_object('ok', true); end if;
  if papel <> 'admin' and (v.aparelho is distinct from auth.uid() or v.criado_em < now() - interval '12 hours') then
    raise exception 'so_admin' using errcode = '42501';
  end if;
  update v3_vendas set excluido = true, atualizado_em = now() where loja_id = p_loja and id = p_id;
  for m in select produto_id, sum(quantidade) q from v3_estoque_mov where loja_id = p_loja and ref_id = p_id and tipo = 'venda' group by produto_id loop
    update v3_produto_custos set estoque = estoque - m.q, atualizado_em = now() where loja_id = p_loja and produto_id = m.produto_id;
    insert into v3_estoque_mov(loja_id, produto_id, tipo, quantidade, ref_id, criado_por) values (p_loja, m.produto_id, 'estorno', -m.q, p_id, auth.uid());
  end loop;
  perform v3_log(p_loja, 'excluir', 'v3_vendas', p_id, 'R$ ' || v.total);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- entrada de mercadoria ----------
create or replace function v3_registrar_entrada(p_loja text, p jsonb, p_plataforma text default 'android', p_versao integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eid text := p->>'id'; it jsonb; frete numeric := coalesce(v3_num(p,'frete'),0); total_valor numeric := 0;
  qtd numeric; valor numeric; perda numeric; util numeric; c_unit numeric; c_ef numeric; cu v3_produto_custos; est numeric;
  forn text := coalesce(nullif(p->>'fornecedor_id',''), ''); v_dia date; i int := 0; res jsonb := '[]';
begin
  perform v3_exigir(p_loja);
  perform v3_checar_versao(p_plataforma, p_versao);
  if eid is null or eid = '' then raise exception 'id_obrigatorio'; end if;
  if exists (select 1 from v3_entradas where loja_id = p_loja and id = eid) then return jsonb_build_object('ok', true, 'repetida', true); end if;
  select coalesce(sum(coalesce(v3_num(x,'valor_pago'),0)),0) into total_valor from jsonb_array_elements(coalesce(p->'itens','[]')) x;
  v_dia := (coalesce((p->>'data')::timestamptz, now()) at time zone 'America/Sao_Paulo')::date;
  insert into v3_entradas(loja_id, id, fornecedor_id, data, frete, total, observacao, criado_por)
  values (p_loja, eid, nullif(forn,''), least(coalesce((p->>'data')::timestamptz, now()), now() + interval '5 minutes'), frete, total_valor + frete, p->>'observacao', auth.uid());
  for it in select * from jsonb_array_elements(coalesce(p->'itens','[]')) loop
    i := i + 1;
    qtd := v3_num(it,'quantidade'); valor := coalesce(v3_num(it,'valor_pago'),0); perda := coalesce(v3_num(it,'perda_pct'),0);
    if qtd is null or qtd <= 0 then raise exception 'quantidade_invalida'; end if;
    if not exists (select 1 from v3_produtos where loja_id = p_loja and id = it->>'produto_id') then raise exception 'produto_inexistente'; end if;
    util := qtd * (1 - perda/100);
    c_unit := case when valor > 0 then valor / qtd end;
    c_ef := case when valor > 0 then (valor + case when total_valor > 0 then frete * valor / total_valor else 0 end) / util end;
    insert into v3_entrada_itens(loja_id, id, entrada_id, produto_id, quantidade, valor_pago, perda_pct, custo_unitario, custo_efetivo, validade_em)
    values (p_loja, coalesce(nullif(it->>'id',''), eid || '-' || i), eid, it->>'produto_id', qtd, valor, perda, round(c_unit,4), round(c_ef,4), (it->>'validade_em')::date);
    insert into v3_produto_custos(loja_id, produto_id) values (p_loja, it->>'produto_id') on conflict do nothing;
    select * into cu from v3_produto_custos where loja_id = p_loja and produto_id = it->>'produto_id' for update;
    est := greatest(cu.estoque, 0);
    update v3_produto_custos set
      estoque = greatest(estoque, 0) + util,
      custo_ultimo = coalesce(round(c_ef,4), custo_ultimo),
      custo_medio = case when c_ef is null then custo_medio
                         when custo_medio is null or est = 0 then round(c_ef,4)
                         else round((est * custo_medio + util * c_ef) / (est + util), 4) end,
      ultima_entrada_em = now(), atualizado_em = now()
    where loja_id = p_loja and produto_id = it->>'produto_id';
    if cu.estoque < 0 then
      insert into v3_estoque_mov(loja_id, produto_id, tipo, quantidade, ref_id, criado_por) values (p_loja, it->>'produto_id', 'ajuste', -cu.estoque, eid, auth.uid());
    end if;
    insert into v3_estoque_mov(loja_id, produto_id, tipo, quantidade, custo_unitario, ref_id, criado_por)
    values (p_loja, it->>'produto_id', 'entrada', util, round(c_ef,4), eid, auth.uid());
    if c_ef is not null then
      insert into v3_precos_diarios(loja_id, dia, produto_id, fornecedor_id, quantidade, valor, custo_min, custo_max, preco_venda)
      values (p_loja, v_dia, it->>'produto_id', forn, util, c_ef * util, c_ef, c_ef, (select preco from v3_produtos where loja_id=p_loja and id=it->>'produto_id'))
      on conflict (loja_id, dia, produto_id, fornecedor_id) do update set quantidade = v3_precos_diarios.quantidade + excluded.quantidade,
        valor = v3_precos_diarios.valor + excluded.valor, custo_min = least(v3_precos_diarios.custo_min, excluded.custo_min),
        custo_max = greatest(v3_precos_diarios.custo_max, excluded.custo_max), preco_venda = excluded.preco_venda;
    end if;
    res := res || jsonb_build_object('produto_id', it->>'produto_id', 'custo_efetivo', round(c_ef,4));
  end loop;
  perform v3_log(p_loja, 'entrada', 'v3_entradas', eid, i || ' itens, R$ ' || (total_valor + frete));
  return jsonb_build_object('ok', true, 'itens', res);
end $$;

-- preço (admin)
create or replace function v3_definir_preco(p_loja text, p_produto text, p_preco numeric, p_margem numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare antigo numeric; nome text;
begin
  perform v3_exigir(p_loja, true);
  if p_preco is null or p_preco < 0 then raise exception 'preco_invalido'; end if;
  select preco, v3_produtos.nome into antigo, nome from v3_produtos where loja_id = p_loja and id = p_produto;
  update v3_produtos set preco = round(p_preco,2), margem_desejada = coalesce(p_margem, margem_desejada), atualizado_em = now()
  where loja_id = p_loja and id = p_produto;
  perform v3_log(p_loja, 'preco', 'v3_produtos', p_produto, nome || ': ' || antigo || ' -> ' || round(p_preco,2));
  return jsonb_build_object('ok', true);
end $$;

-- contagem inicial / recontagem (admin)
create or replace function v3_contagem(p_loja text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; cu v3_produto_custos; qtd numeric; custo numeric; n int := 0;
begin
  perform v3_exigir(p_loja, true);
  if exists (select 1 from v3_estoque_mov where loja_id = p_loja and tipo = 'contagem' and ref_id = p->>'id') then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;
  for it in select * from jsonb_array_elements(coalesce(p->'itens','[]')) loop
    qtd := v3_num(it,'quantidade'); custo := v3_num(it,'custo');
    if qtd is null or qtd < 0 then continue; end if;
    insert into v3_produto_custos(loja_id, produto_id) values (p_loja, it->>'produto_id') on conflict do nothing;
    select * into cu from v3_produto_custos where loja_id = p_loja and produto_id = it->>'produto_id' for update;
    update v3_produto_custos set estoque = qtd,
      custo_medio = coalesce(custo, custo_medio), custo_ultimo = coalesce(custo_ultimo, custo), atualizado_em = now()
    where loja_id = p_loja and produto_id = it->>'produto_id';
    insert into v3_estoque_mov(loja_id, produto_id, tipo, quantidade, custo_unitario, ref_id, criado_por)
    values (p_loja, it->>'produto_id', 'contagem', qtd - cu.estoque, custo, p->>'id', auth.uid());
    n := n + 1;
  end loop;
  perform v3_log(p_loja, 'contagem', 'v3_estoque_mov', p->>'id', n || ' produtos');
  return jsonb_build_object('ok', true, 'produtos', n);
end $$;

-- perda/descarte (todos)
create or replace function v3_registrar_perda(p_loja text, p_produto text, p_quantidade numeric, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cu v3_produto_custos;
begin
  perform v3_exigir(p_loja);
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'quantidade_invalida'; end if;
  if exists (select 1 from v3_estoque_mov where loja_id = p_loja and tipo = 'perda' and ref_id = p_ref) then return jsonb_build_object('ok', true, 'repetida', true); end if;
  select * into cu from v3_produto_custos where loja_id = p_loja and produto_id = p_produto for update;
  update v3_produto_custos set estoque = estoque - p_quantidade, atualizado_em = now() where loja_id = p_loja and produto_id = p_produto;
  insert into v3_estoque_mov(loja_id, produto_id, tipo, quantidade, custo_unitario, ref_id, criado_por)
  values (p_loja, p_produto, 'perda', -p_quantidade, coalesce(cu.custo_medio, cu.custo_ultimo), p_ref, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function v3_salvar_configuracao(p_loja text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform v3_exigir(p_loja, true);
  insert into v3_configuracao(loja_id) values (p_loja) on conflict do nothing;
  update v3_configuracao set
    margem_padrao = coalesce(v3_num(p,'margem_padrao'), margem_padrao),
    arredondamento = coalesce(p->>'arredondamento', arredondamento),
    modo_margem = coalesce(p->>'modo_margem', modo_margem),
    telefone = case when p ? 'telefone' then p->>'telefone' else telefone end,
    atualizado_em = now()
  where loja_id = p_loja;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- permissões das funções ----------
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'v3\_%' loop
    execute format('revoke all on function %s from public, anon', f);
  end loop;
  foreach f in array array['v3_entrar(text,text,text,text,integer)','v3_criar_convite(text,text)','v3_renomear_aparelho(text,text,uuid)',
    'v3_definir_aparelho(text,uuid,text,boolean)','v3_salvar_produto(text,jsonb)','v3_vincular_codigo(text,text,text)',
    'v3_salvar_fornecedor(text,jsonb)','v3_registrar_venda(text,jsonb,text,integer)','v3_excluir_venda(text,text)',
    'v3_registrar_entrada(text,jsonb,text,integer)','v3_definir_preco(text,text,numeric,numeric)','v3_contagem(text,jsonb)',
    'v3_registrar_perda(text,text,numeric,text)','v3_salvar_configuracao(text,jsonb)','v3_arredondar(text,numeric)',
    'v3_minhas_lojas()','v3_papel(text)'] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------- tempo real ----------
do $$
declare t text;
begin
  foreach t in array array['v3_configuracao','v3_fornecedores','v3_produtos','v3_produto_codigos','v3_produto_custos','v3_entradas',
    'v3_entrada_itens','v3_vendas','v3_venda_itens','v3_encomendas','v3_encomenda_itens','v3_app_versao','v3_aparelhos','v3_promocoes_sugeridas']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
