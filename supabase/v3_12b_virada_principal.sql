-- v3_12b: virada para o Banca (OK do Rafael 27/11 14:56, t773u). Idempotente. Nada antigo é apagado ou alterado.
-- 1) membros do app antigo: guardados só como histórico (não viram aparelhos; ninguém ganha acesso por eles). Só Admin lê.
create table if not exists v3_membros_legado (
  loja_id text not null references v3_lojas(id) on delete cascade,
  uid text not null,
  nome text, papel text, bloqueado boolean, aparelho_id text,
  ultimo_acesso timestamptz, criado_em timestamptz,
  primary key (loja_id, uid)
);
alter table v3_membros_legado enable row level security;
drop policy if exists ler on v3_membros_legado;
create policy ler on v3_membros_legado for select to authenticated using (loja_id in (select v3_lojas_admin()));
revoke all on v3_membros_legado from anon;

-- 2) migração completa principal (antigo) → principal (v3). Dedupe por id ('leg-'||id) e legado_id.
select v3_migrar_legado('principal', 'principal');
insert into v3_membros_legado(loja_id, uid, nome, papel, bloqueado, aparelho_id, ultimo_acesso, criado_em)
select 'principal', m.uid, m.nome, m.papel, m.bloqueado, m.aparelho_id, m.ultimo_acesso, m.criado_em
from membros m where m.loja_id = 'principal'
on conflict (loja_id, uid) do nothing;

-- 3) cópia contínua das vendas do app antigo (a rotina grava em public.vendas) → loja principal da v3
do $$ begin
  if exists (select 1 from cron.job where jobname = 'v3-sync-vendas-principal') then perform cron.unschedule('v3-sync-vendas-principal'); end if;
end $$;
select cron.schedule('v3-sync-vendas-principal', '*/10 * * * *', $$select public.v3_sincronizar_vendas('principal','principal')$$);

-- 4) quem instala o APK entra como Caixa na loja real (decisão do Rafael 12:04); trava de 30/hora continua na v3_entrar
update v3_loja_segredos set caixa_automatico = true where loja_id = 'principal';
