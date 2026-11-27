-- 3.0.0-teste.5 — decisão do Rafael (27/11 12:04): "Qualquer um com o APK entra como caixa" e
-- "Caixa registra entrada, preço só Admin". O APK é público, então tudo que é de Admin fica no servidor (RLS/RPC).

-- 1) liga/desliga por loja (principal começa DESLIGADO; liga junto com a virada, com o OK)
alter table v3_loja_segredos add column if not exists caixa_automatico boolean not null default false;

-- 2) leitura só de Admin para o que é sensível (histórico de custo por fornecedor, sugestões de promoção, log, cobranças)
create or replace function v3_lojas_admin() returns setof text
language sql stable security definer set search_path = public as $$
  select loja_id from v3_aparelhos where uid = auth.uid() and papel = 'admin' and not bloqueado
$$;
do $$
declare t text;
begin
  foreach t in array array['v3_precos_diarios','v3_promocoes_sugeridas','v3_atividades','v3_cobrancas'] loop
    execute format('drop policy if exists ler on %I', t);
    execute format('create policy ler on %I for select to authenticated using (loja_id in (select v3_lojas_admin()))', t);
  end loop;
end $$;

-- 3) entrar: aparelho Android novo, sem código, entra como Caixa se a loja permitir.
--    Código (recuperação / convite QR) continua sendo o único jeito de virar Admin.
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
    if a.papel = 'admin' or p_codigo is null or p_codigo = '' then
      return jsonb_build_object('papel', a.papel, 'nome', a.nome);
    end if;
  end if;
  if (select count(*) from v3_tentativas where uid = u and em > now() - interval '10 minutes') >= 8 then
    raise exception 'muitas_tentativas' using errcode = '42501';
  end if;
  cod := upper(regexp_replace(coalesce(p_codigo,''), '[^A-Za-z0-9]', '', 'g'));
  select * into s from v3_loja_segredos where loja_id = p_loja;
  if cod = '' then
    -- sem código: só a entrada automática de Caixa (APK)
    if a.uid is null and coalesce(s.caixa_automatico, false) and p_plataforma = 'android' then
      if (select count(*) from v3_aparelhos where loja_id = p_loja and criado_em > now() - interval '1 hour') >= 30 then
        raise exception 'muitas_tentativas' using errcode = '42501';
      end if;
      papel_novo := 'caixa';
    end if;
  elsif s.codigo_recuperacao_hash is not null and crypt(cod, s.codigo_recuperacao_hash) = s.codigo_recuperacao_hash then
    papel_novo := 'admin';
  else
    select * into c from v3_convites where codigo = cod and loja_id = p_loja and usado_por is null and expira_em > now() for update;
    if found then
      papel_novo := c.papel;
      update v3_convites set usado_por = u, usado_em = now() where codigo = cod;
    elsif s.codigo_entrada_hash is not null and crypt(cod, s.codigo_entrada_hash) = s.codigo_entrada_hash then
      papel_novo := 'caixa';
    end if;
  end if;
  if papel_novo is null then
    if cod <> '' then insert into v3_tentativas(uid) values (u); end if;
    if a.uid is not null then return jsonb_build_object('papel', a.papel, 'nome', a.nome, 'erro', 'codigo_invalido'); end if;
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
  perform v3_log(p_loja, case when cod = '' then 'entrou_auto' else 'entrou' end, 'v3_aparelhos', u::text, papel_novo);
  return jsonb_build_object('papel', papel_novo, 'nome', coalesce(nullif(left(trim(p_nome),40),''), case when papel_novo='admin' then 'Admin' else 'Caixa' end));
end $$;
