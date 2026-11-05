-- Dados de desenvolvimento. Roda só no Supabase LOCAL (`supabase db reset`);
-- nunca vai para produção. Senha das duas contas: qlareo123
--
--   operador@qlareo.local   operador da Qlareo
--   anunciante@exemplo.local anunciante comum (Padaria Exemplo)
--
-- O trigger `private.handle_new_user` cria o anunciante de cada conta.

create function pg_temp.seed_user(user_id uuid, email text, full_name text, company text)
returns void
language sql
as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated', email,
    extensions.crypt('qlareo123', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', full_name, 'company_name', company),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), user_id, user_id::text,
    jsonb_build_object('sub', user_id::text, 'email', email, 'email_verified', true),
    'email', now(), now(), now()
  );
$$;

select pg_temp.seed_user('00000000-0000-4000-8000-000000000001', 'operador@qlareo.local', 'Operador Qlareo', 'Qlareo');
select pg_temp.seed_user('00000000-0000-4000-8000-000000000002', 'anunciante@exemplo.local', 'Ana Exemplo', 'Padaria Exemplo');

insert into public.operators (user_id) values ('00000000-0000-4000-8000-000000000001');
