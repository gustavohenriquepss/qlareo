-- Um QR por campanha, não mais um por restaurante (decisão do dono em 06/11/2026).
--
-- Todas as sacolas de uma campanha levam o mesmo QR. A gráfica imprime um
-- arquivo só, e o anunciante vê:
--
--   - as leituras da campanha inteira (o QR não sabe de qual restaurante saiu
--     a sacola);
--   - quantas sacolas foram para cada restaurante, que o operador anota em
--     `campaign_restaurants.bags`. É isso que mostra onde a sacola rodou.
--
-- Em produção ainda não havia campanha. No banco local, a leitura antiga passa
-- para a campanha do restaurante em que foi feita, e os slugs por restaurante
-- deixam de existir.

-- ---------------------------------------------------------------------------
-- O QR passa a ser da campanha.
-- ---------------------------------------------------------------------------
-- Padrão volátil em `add column`: o Postgres calcula um slug por linha.
alter table public.campaigns
  add column slug text unique default private.new_slug()
  check (slug ~ '^[a-z0-9-]{3,40}$');
alter table public.campaigns alter column slug set not null;

-- ---------------------------------------------------------------------------
-- Leituras: da campanha, não mais do par campanha × restaurante.
-- ---------------------------------------------------------------------------
alter table public.scans
  add column campaign_id uuid references public.campaigns (id) on delete cascade;

update public.scans s
set campaign_id = cr.campaign_id
from public.campaign_restaurants cr
where cr.id = s.campaign_restaurant_id;

alter table public.scans alter column campaign_id set not null;

drop policy "membro lê as leituras das próprias campanhas; operador lê todas" on public.scans;
drop index public.scans_campaign_restaurant_scanned_at_idx;
alter table public.scans drop column campaign_restaurant_id;

create index scans_campaign_scanned_at_idx on public.scans (campaign_id, scanned_at);

create policy "membro lê as leituras das próprias campanhas; operador lê todas"
  on public.scans for select
  to authenticated
  using (private.is_operator() or private.is_campaign_member(campaign_id));

-- ---------------------------------------------------------------------------
-- Restaurante da campanha: sem QR próprio, com o número de sacolas.
--
-- Zero até o operador anotar. Teto alto só para pegar dígito a mais.
-- ---------------------------------------------------------------------------
alter table public.campaign_restaurants drop column slug;
alter table public.campaign_restaurants
  add column bags integer not null default 0 check (bags between 0 and 1000000);

-- ---------------------------------------------------------------------------
-- A porta do QR passa a resolver o slug da campanha. Mesma assinatura, então
-- os grants (anon e authenticated) continuam valendo.
-- ---------------------------------------------------------------------------
create or replace function public.record_scan(scan_slug text, visitor text, count_it boolean default true)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target uuid;
  destination text;
begin
  select c.id, c.destination_url
    into target, destination
  from public.campaigns c
  where c.slug = lower(scan_slug);

  if target is null then
    return null;
  end if;

  if count_it and visitor ~ '^[0-9a-f]{64}$' then
    insert into public.scans (campaign_id, visitor_hash)
    values (target, visitor);
  end if;

  return destination;
end;
$$;
