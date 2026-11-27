
-- 4) Caixa pode cadastrar produto novo (na chegada de mercadoria), mas sem preço: preço é só do Admin
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
    values (p_loja, pid, trim(p->>'nome'), p->>'categoria', coalesce(p->>'unidade','un'), case when papel='admin' then coalesce(v3_num(p,'preco'),0) else 0 end,
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

