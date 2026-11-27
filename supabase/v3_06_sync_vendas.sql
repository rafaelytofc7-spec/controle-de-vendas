-- Sincronização contínua só das VENDAS antigas (rotina de hora em hora grava em public.vendas).
create or replace function v3_sincronizar_vendas(p_origem text, p_destino text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_ins int; n_upd int;
begin
  insert into v3_vendas(loja_id, id, total, origem, legado_id, excluido, criado_em, hora_servidor, atualizado_em)
  select p_destino, 'leg-' || v.id, round(v.valor,2), case when v.criado_por = 'importado' then 'app_antigo' else 'app_v2' end,
    v.id, v.excluido, v.criado_em, coalesce(v.hora_servidor, v.atualizado_em), v.atualizado_em
  from vendas v where v.loja_id = p_origem and v.valor >= 0
    and v.atualizado_em > now() - interval '3 days'
  on conflict (loja_id, id) do nothing;
  get diagnostics n_ins = row_count;
  update v3_vendas n set total = round(v.valor,2), excluido = v.excluido, atualizado_em = v.atualizado_em
  from vendas v where v.loja_id = p_origem and n.loja_id = p_destino and n.id = 'leg-' || v.id
    and v.atualizado_em > now() - interval '3 days' and v.atualizado_em > n.atualizado_em
    and (n.total <> round(v.valor,2) or n.excluido <> v.excluido);
  get diagnostics n_upd = row_count;
  return jsonb_build_object('novas', n_ins, 'atualizadas', n_upd);
end $$;
revoke all on function v3_sincronizar_vendas(text,text) from public, anon, authenticated;

select cron.unschedule('v3-sync-legado-ensaio');
select cron.schedule('v3-sync-vendas-ensaio', '*/10 * * * *', $$select public.v3_sincronizar_vendas('principal','ensaio')$$);

-- loja de ensaio: tira dados de clientes e o nome da loja (o APK de teste é público)
update v3_encomendas e set cliente = 'Cliente ' || x.n, telefone = null, endereco = null, endereco_detalhe = null
from (select id, row_number() over (order by criado_em) n from v3_encomendas where loja_id = 'ensaio') x
where e.loja_id = 'ensaio' and e.id = x.id;
update v3_cobrancas set mensagem = null, referencia = null where loja_id = 'ensaio';
update v3_configuracao set nome_loja = null, telefone = null, mensagem_cardapio = null, observacoes = null where loja_id = 'ensaio';
