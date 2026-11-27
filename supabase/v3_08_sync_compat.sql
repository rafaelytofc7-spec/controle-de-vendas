-- v3_08: compatível com a rotina que também grava em v3_vendas (mesmo legado_id, qualquer id)
create or replace function v3_sincronizar_vendas(p_origem text, p_destino text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_ins int; n_upd int;
begin
  insert into v3_vendas(loja_id, id, total, origem, legado_id, excluido, criado_em, hora_servidor, atualizado_em)
  select p_destino, 'leg-' || v.id, round(v.valor,2), case when v.criado_por = 'importado' then 'app_antigo' else 'app_v2' end,
    v.id, v.excluido, v.criado_em, coalesce(v.hora_servidor, v.atualizado_em), v.atualizado_em
  from vendas v where v.loja_id = p_origem and v.valor >= 0
    and v.atualizado_em > now() - interval '3 days'
  on conflict do nothing; -- cobre id e legado_id (a rotina de hora em hora também grava aqui)
  get diagnostics n_ins = row_count;
  update v3_vendas n set total = round(v.valor,2), excluido = v.excluido, atualizado_em = v.atualizado_em
  from vendas v where v.loja_id = p_origem and n.loja_id = p_destino and n.legado_id = v.id
    and v.atualizado_em > now() - interval '3 days' and v.atualizado_em > n.atualizado_em
    and (n.total <> round(v.valor,2) or n.excluido <> v.excluido);
  get diagnostics n_upd = row_count;
  return jsonb_build_object('novas', n_ins, 'atualizadas', n_upd);
end $$;
revoke all on function v3_sincronizar_vendas(text,text) from public, anon, authenticated;
