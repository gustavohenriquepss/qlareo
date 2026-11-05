-- Campanhas, QR codes e leituras.
--
-- Cada campanha passa por N restaurantes, e cada par campanha × restaurante tem
-- o seu QR code (`campaign_restaurants.slug`). Quem lê o QR cai em /r/:slug, que
-- grava uma linha em `scans` e redireciona para o destino do anunciante.
--
-- O visitante que lê o QR não tem conta. Ele não lê nem grava tabela nenhuma:
-- a única porta aberta para ele é `public.record_scan`, que resolve o slug e
-- registra a leitura numa chamada só.

-- ---------------------------------------------------------------------------
-- Restaurantes da rede. Só o operador cadastra.
-- ---------------------------------------------------------------------------
create table public.restaurants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 120),
  city         text not null check (length(btrim(city)) between 1 and 80),
  neighborhood text check (neighborhood is null or length(btrim(neighborhood)) between 1 and 80),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Campanhas.
--
-- Impacto: um anunciante na sacola inteira (frente e verso), então `side` é
-- nulo. Alcance: um anunciante por lado, então `side` diz qual.
-- ---------------------------------------------------------------------------
create type public.campaign_plan as enum ('impacto', 'alcance');
create type public.bag_side as enum ('frente', 'verso');
create type public.campaign_status as enum (
  'aguardando_arte',  -- pagou; falta a arte
  'em_producao',      -- arte aprovada; sacolas na gráfica
  'em_circulacao',    -- sacolas nos restaurantes
  'encerrada'
);

create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  advertiser_id   uuid not null references public.advertisers (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  plan            public.campaign_plan not null,
  side            public.bag_side,
  status          public.campaign_status not null default 'aguardando_arte',
  -- Para onde o QR leva. Só http(s): `javascript:` ou `data:` aqui viraria um
  -- redirect perigoso servido com o nosso domínio.
  destination_url text not null check (destination_url ~* '^https?://[^\s/$.?#][^\s]*$'),
  starts_on       date,
  ends_on         date,
  created_at      timestamptz not null default now(),
  constraint campaigns_side_matches_plan check (
    (plan = 'impacto' and side is null) or (plan = 'alcance' and side is not null)
  ),
  constraint campaigns_period check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index campaigns_advertiser_id_idx on public.campaigns (advertiser_id);

-- ---------------------------------------------------------------------------
-- Um QR code por restaurante dentro da campanha.
--
-- Slug curto (7 caracteres) porque cada caractere a mais deixa o QR mais denso
-- e mais difícil de ler numa sacola amassada. O alfabeto tira 0/o, 1/l/i: quem
-- precisar digitar o link à mão não erra.
-- ---------------------------------------------------------------------------
create function private.new_slug()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  result text := '';
  bytes bytea := extensions.gen_random_bytes(7);
begin
  for i in 0..6 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create table public.campaign_restaurants (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete restrict,
  slug          text not null unique default private.new_slug()
                check (slug ~ '^[a-z0-9-]{3,40}$'),
  created_at    timestamptz not null default now(),
  unique (campaign_id, restaurant_id)
);

create index campaign_restaurants_restaurant_id_idx on public.campaign_restaurants (restaurant_id);

-- ---------------------------------------------------------------------------
-- Leituras. Uma linha por leitura, sem IP nem user agent: `visitor_hash` é um
-- SHA-256 de (segredo + dia + IP + user agent) feito no app. Serve para contar
-- pessoas únicas POR DIA e não permite voltar ao IP nem ligar a mesma pessoa
-- entre dias diferentes.
-- ---------------------------------------------------------------------------
create table public.scans (
  id                     bigint generated always as identity primary key,
  campaign_restaurant_id uuid not null references public.campaign_restaurants (id) on delete cascade,
  scanned_at             timestamptz not null default now(),
  visitor_hash           text not null check (visitor_hash ~ '^[0-9a-f]{64}$')
);

create index scans_campaign_restaurant_scanned_at_idx
  on public.scans (campaign_restaurant_id, scanned_at);

-- ---------------------------------------------------------------------------
-- Acesso.
-- ---------------------------------------------------------------------------
create function private.is_campaign_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.advertiser_members m on m.advertiser_id = c.advertiser_id
    where c.id = target
      and m.user_id = (select auth.uid())
  );
$$;

grant execute on function private.is_campaign_member(uuid) to authenticated;

alter table public.restaurants enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_restaurants enable row level security;
alter table public.scans enable row level security;

-- Restaurantes: o anunciante vê só os restaurantes das campanhas dele.
create policy "membro lê restaurantes das próprias campanhas; operador lê todos"
  on public.restaurants for select
  to authenticated
  using (
    private.is_operator()
    or exists (
      select 1 from public.campaign_restaurants cr
      where cr.restaurant_id = restaurants.id
        and private.is_campaign_member(cr.campaign_id)
    )
  );

create policy "operador gerencia restaurantes"
  on public.restaurants for all
  to authenticated
  using (private.is_operator())
  with check (private.is_operator());

-- Campanhas: o anunciante só lê. Quem cria, muda e encerra é o operador.
create policy "membro lê as próprias campanhas; operador lê todas"
  on public.campaigns for select
  to authenticated
  using (private.is_advertiser_member(advertiser_id) or private.is_operator());

create policy "operador gerencia campanhas"
  on public.campaigns for all
  to authenticated
  using (private.is_operator())
  with check (private.is_operator());

create policy "membro lê os QR das próprias campanhas; operador lê todos"
  on public.campaign_restaurants for select
  to authenticated
  using (private.is_campaign_member(campaign_id) or private.is_operator());

create policy "operador gerencia QR"
  on public.campaign_restaurants for all
  to authenticated
  using (private.is_operator())
  with check (private.is_operator());

-- Leituras: ninguém grava pela API; só `record_scan`. Ninguém apaga nem muda.
create policy "membro lê as leituras das próprias campanhas; operador lê todas"
  on public.scans for select
  to authenticated
  using (
    private.is_operator()
    or exists (
      select 1 from public.campaign_restaurants cr
      where cr.id = scans.campaign_restaurant_id
        and private.is_campaign_member(cr.campaign_id)
    )
  );

revoke all on public.restaurants, public.campaigns, public.campaign_restaurants, public.scans from anon;
revoke insert, update, delete on public.scans from authenticated;

-- ---------------------------------------------------------------------------
-- A porta do QR code.
--
-- Resolve o slug e, se `count_it`, grava a leitura. Devolve o destino, ou nulo
-- quando o slug não existe. `security definer` porque o visitante (anon) não
-- tem acesso às tabelas; a função expõe só o destino de um slug que ele já tem
-- impresso na sacola.
-- ---------------------------------------------------------------------------
create function public.record_scan(scan_slug text, visitor text, count_it boolean default true)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  qr_id uuid;
  destination text;
begin
  select cr.id, c.destination_url
    into qr_id, destination
  from public.campaign_restaurants cr
  join public.campaigns c on c.id = cr.campaign_id
  where cr.slug = lower(scan_slug);

  if qr_id is null then
    return null;
  end if;

  if count_it and visitor ~ '^[0-9a-f]{64}$' then
    insert into public.scans (campaign_restaurant_id, visitor_hash)
    values (qr_id, visitor);
  end if;

  return destination;
end;
$$;

revoke all on function public.record_scan(text, text, boolean) from public;
grant execute on function public.record_scan(text, text, boolean) to anon, authenticated;
