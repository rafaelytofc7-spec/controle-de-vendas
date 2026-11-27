-- v3_12a: exporta as tabelas ANTIGAS de uma loja (só leitura), protegido pela mesma chave de backup.
-- Não exporta loja_acesso (código de recuperação do app antigo).
create or replace function v3_backup_legado(p_loja text, p_chave text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select exists (select 1 from v3_backup_chaves where hash = crypt(p_chave, hash)) into ok;
  if not ok or p_chave is null or length(p_chave) < 32 then raise exception 'chave_invalida' using errcode = '42501'; end if;
  return jsonb_build_object('gerado_em', now(), 'loja', p_loja,
    'lojas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from lojas x where x.id = p_loja),
    'configuracao', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from configuracao x where x.loja_id = p_loja),
    'membros', (select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em), '[]') from membros x where x.loja_id = p_loja),
    'vendas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em, x.id), '[]') from vendas x where x.loja_id = p_loja),
    'encomendas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em, x.id), '[]') from encomendas x where x.loja_id = p_loja),
    'cobrancas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em, x.id), '[]') from cobrancas x where x.loja_id = p_loja),
    'produtos', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from produtos x where x.loja_id = p_loja),
    'codigos_barras', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from codigos_barras x where x.loja_id = p_loja),
    'entregas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from entregas x where x.loja_id = p_loja),
    'reabastecimentos', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from reabastecimentos x where x.loja_id = p_loja),
    'atividades', (select coalesce(jsonb_agg(to_jsonb(x) order by x.em), '[]') from atividades x where x.loja_id = p_loja));
end $$;
revoke all on function v3_backup_legado(text,text) from public, authenticated;
grant execute on function v3_backup_legado(text,text) to anon;
