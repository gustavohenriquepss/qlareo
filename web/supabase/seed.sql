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

-- ---------------------------------------------------------------------------
-- Rede, campanha e leituras de exemplo (fatia 2).
--
-- QR codes locais: http://localhost:3001/r/padaria-itaborai
--                  http://localhost:3001/r/padaria-icarai
-- ---------------------------------------------------------------------------
insert into public.restaurants (id, name, city, neighborhood) values
  ('00000000-0000-4000-9000-000000000001', 'Cantina da Praça', 'Itaboraí', 'Centro'),
  ('00000000-0000-4000-9000-000000000002', 'Pizzaria Manilha', 'Itaboraí', 'Manilha'),
  ('00000000-0000-4000-9000-000000000003', 'Sushi Icaraí', 'Niterói', 'Icaraí'),
  ('00000000-0000-4000-9000-000000000004', 'Burger da Moreira', 'Niterói', 'Icaraí');

insert into public.campaigns (id, advertiser_id, name, sides, status, destination_url, starts_on, ends_on)
select
  '00000000-0000-4000-a000-000000000001', m.advertiser_id, 'Lançamento do pão de fermentação natural',
  'um_lado', 'em_circulacao', 'https://wa.me/5521999999999?text=Vi%20na%20sacola',
  current_date - 14, current_date + 16
from public.advertiser_members m
where m.user_id = '00000000-0000-4000-8000-000000000002';

insert into public.campaign_restaurants (id, campaign_id, restaurant_id, slug) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-9000-000000000001', 'padaria-itaborai'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-9000-000000000003', 'padaria-icarai');

-- Leituras espalhadas nos últimos 14 dias; cerca de 1 em cada 4 repete o
-- visitante do dia (mesma pessoa lendo de novo).
insert into public.scans (campaign_restaurant_id, scanned_at, visitor_hash)
select
  qr.id,
  date_trunc('day', now()) - (d || ' days')::interval + (random() * interval '14 hours') + interval '9 hours',
  encode(extensions.digest(qr.id::text || d || (n / 4 * 4 + case when random() < 0.25 then 0 else n % 4 end), 'sha256'), 'hex')
from public.campaign_restaurants qr
cross join generate_series(0, 13) as d
cross join lateral generate_series(1, (3 + floor(random() * 9))::int) as n;
