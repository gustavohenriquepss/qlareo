-- Artes das campanhas: upload por lado, versões, revisão e aprovação.
--
-- O anunciante manda a arte pronta (PDF, PNG ou JPG) de cada lado que comprou:
-- só a frente na campanha de um lado, frente e verso na de dois. Cada envio é
-- uma versão nova; nada é sobrescrito. A Qlareo confere, mostra ao restaurante
-- pelo WhatsApp e registra aqui: pede ajuste (com o motivo) ou aprova.
--
-- O arquivo vai do navegador direto para o Storage (bucket privado `artes`), por
-- uma URL assinada que o app pede com a sessão de quem envia. O app não passa o
-- arquivo pelo servidor dele. Depois do upload, o app grava a linha em
-- `artworks` com o tamanho e o tipo que o Storage registrou.
--
-- Caminho do arquivo: `<id da campanha>/<uuid>.<pdf|png|jpg>`. É a primeira
-- pasta que diz de qual campanha ele é, e as policies do Storage leem dela.

create type public.artwork_side as enum ('frente', 'verso');
create type public.artwork_status as enum (
  'em_revisao',  -- enviada; a Qlareo está conferindo
  'ajustes',     -- a Qlareo (ou o restaurante) pediu mudança; o motivo vai em `review_note`
  'aprovada'     -- conferida e aprovada pelo restaurante; vai para a gráfica
);

-- `size_bytes`: o mesmo teto do bucket.
create table public.artworks (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  side         public.artwork_side not null,
  storage_path text not null unique,
  file_name    text not null check (length(btrim(file_name)) between 1 and 200),
  content_type text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes   bigint not null check (size_bytes between 1 and 52428800),
  uploaded_by  uuid default auth.uid() references auth.users (id) on delete set null,
  status       public.artwork_status not null default 'em_revisao',
  review_note  text check (review_note is null or length(btrim(review_note)) between 1 and 1000),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint artworks_path_in_campaign check (
    storage_path ~ ('^' || campaign_id::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$')
  ),
  constraint artworks_adjust_has_note check (status <> 'ajustes' or review_note is not null)
);

create index artworks_campaign_side_created_at_idx on public.artworks (campaign_id, side, created_at);

-- ---------------------------------------------------------------------------
-- Campanha de um lado só tem arte da frente. Trigger, e não check, porque o
-- dado mora em outra tabela.
-- ---------------------------------------------------------------------------
create function private.check_artwork_side()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.side = 'verso' and not exists (
    select 1 from public.campaigns c where c.id = new.campaign_id and c.sides = 'frente_e_verso'
  ) then
    raise exception 'campanha de um lado só tem arte da frente' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger artworks_side_matches_campaign
  before insert or update of side, campaign_id on public.artworks
  for each row execute function private.check_artwork_side();

-- ---------------------------------------------------------------------------
-- Acesso.
-- ---------------------------------------------------------------------------

-- O anunciante só envia enquanto a campanha espera arte. Depois que ela vai
-- para a gráfica, uma versão nova chegaria tarde; quem reabre é o operador,
-- voltando o status.
create function private.can_send_artwork(target uuid)
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
      and c.status = 'aguardando_arte'
      and m.user_id = (select auth.uid())
  );
$$;

-- A campanha de um arquivo do bucket, pela primeira pasta do caminho. Nulo
-- quando a pasta não é um uuid (e aí nenhuma policy deixa passar).
create function private.artwork_campaign(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
  end;
$$;

grant execute on function private.can_send_artwork(uuid) to authenticated;
grant execute on function private.artwork_campaign(text) to authenticated;

alter table public.artworks enable row level security;

create policy "membro lê as artes das próprias campanhas; operador lê todas"
  on public.artworks for select
  to authenticated
  using (private.is_operator() or private.is_campaign_member(campaign_id));

-- O anunciante só cria versão nova, em revisão, em nome próprio. Não muda nem
-- apaga nenhuma: a revisão é da Qlareo.
create policy "membro envia arte para campanha que espera arte"
  on public.artworks for insert
  to authenticated
  with check (
    private.can_send_artwork(campaign_id)
    and status = 'em_revisao'
    and review_note is null
    and reviewed_at is null
    and uploaded_by = (select auth.uid())
  );

create policy "operador gerencia artes"
  on public.artworks for all
  to authenticated
  using (private.is_operator())
  with check (private.is_operator());

revoke all on public.artworks from anon;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado. Teto de 50 MiB (o mesmo do plano gratuito do
-- Supabase) e só os três formatos que a gráfica recebe.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artes', 'artes', false, 52428800, array['application/pdf', 'image/png', 'image/jpeg']);

create policy "artes: membro envia para campanha que espera arte; operador para qualquer"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'artes'
    and (private.is_operator() or private.can_send_artwork(private.artwork_campaign(name)))
  );

create policy "artes: membro baixa as das próprias campanhas; operador todas"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'artes'
    and (private.is_operator() or private.is_campaign_member(private.artwork_campaign(name)))
  );

-- Sem policy de update nem de delete: ninguém sobrescreve nem apaga uma versão
-- pela API.
