-- App novo "Banca" (Flutter) usa a mesma base v3. Ele tem a própria linha de versão
-- (atualização obrigatória por plataforma), sem mexer nas linhas do app v3 (android/web).
alter table v3_app_versao drop constraint if exists v3_app_versao_plataforma_check;
alter table v3_app_versao add constraint v3_app_versao_plataforma_check
  check (plataforma in ('android','web','banca-android','banca-web','banca-windows'));
insert into v3_app_versao(plataforma, minima, atual, nome_atual, url, novidades)
values ('banca-android', 0, 0, null, null, null), ('banca-web', 0, 0, null, null, null), ('banca-windows', 0, 0, null, null, null)
on conflict (plataforma) do nothing;
