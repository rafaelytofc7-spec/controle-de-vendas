-- v3_13: Calendário de vendas (pedido do Rafael 27/11 15:33, t775u).
-- Totais por dia no fuso de São Paulo, só vendas ativas. Qualquer aparelho da loja (Caixa ou Admin) pode ver,
-- igual às vendas (que o Caixa já lê pela RLS). Semana/mês/ano e médias são somados no app a partir dos dias.
create index if not exists v3_vendas_loja_criado on v3_vendas (loja_id, criado_em);

create or replace function v3_vendas_por_dia(p_loja text, p_de date default null, p_ate date default null)
returns table(dia date, vendas integer, total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform v3_exigir(p_loja);
  return query
    select (v.criado_em at time zone 'America/Sao_Paulo')::date as d, count(*)::integer, coalesce(sum(v.total), 0)::numeric
    from v3_vendas v
    where v.loja_id = p_loja and not v.excluido
      and (p_de is null or v.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo'))
      and (p_ate is null or v.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))
    group by 1 order by 1;
end $$;
revoke all on function v3_vendas_por_dia(text, date, date) from public, anon;
grant execute on function v3_vendas_por_dia(text, date, date) to authenticated;
