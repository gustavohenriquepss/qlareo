-- Identidade: quem é anunciante e quem é operador da Qlareo.
--
-- O cadastro é aberto (qualquer pessoa cria conta com e-mail e senha). Por isso
-- nenhuma tabela confia em "só existe conta de cliente pago": o que um usuário
-- enxerga sai SEMPRE do vínculo explícito em `advertiser_members`, conferido pela
-- RLS. Conta recém-criada vê o próprio anunciante (vazio) e mais nada.

-- Funções auxiliares ficam fora do schema `public`, que a API expõe. Elas são
-- `security definer` para a policy poder consultar tabelas que o próprio
-- usuário não lê, e por isso não devem ser chamáveis via RPC.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Operadores: a equipe da Qlareo. Não há tela para virar operador; a linha é
-- inserida à mão (ver README). Sem policy de escrita: o cliente nunca grava aqui.
-- ---------------------------------------------------------------------------
create table public.operators (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.operators enable row level security;

create policy "operador lê a própria linha"
  on public.operators for select
  to authenticated
  using (user_id = (select auth.uid()));

create function private.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operators where user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Anunciantes e quem pertence a cada um.
-- ---------------------------------------------------------------------------
create table public.advertisers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.advertiser_members (
  advertiser_id uuid not null references public.advertisers (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (advertiser_id, user_id)
);

-- A PK cobre buscas por anunciante; esta cobre "de quais anunciantes sou membro",
-- que é a pergunta de toda policy.
create index advertiser_members_user_id_idx on public.advertiser_members (user_id);

create function private.is_advertiser_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.advertiser_members
    where advertiser_id = target
      and user_id = (select auth.uid())
  );
$$;

grant execute on function private.is_operator() to authenticated;
grant execute on function private.is_advertiser_member(uuid) to authenticated;

alter table public.advertisers enable row level security;
alter table public.advertiser_members enable row level security;

create policy "membro ou operador lê o anunciante"
  on public.advertisers for select
  to authenticated
  using (private.is_advertiser_member(id) or private.is_operator());

create policy "membro ou operador renomeia o anunciante"
  on public.advertisers for update
  to authenticated
  using (private.is_advertiser_member(id) or private.is_operator())
  with check (private.is_advertiser_member(id) or private.is_operator());

create policy "operador cria anunciante"
  on public.advertisers for insert
  to authenticated
  with check (private.is_operator());

create policy "operador apaga anunciante"
  on public.advertisers for delete
  to authenticated
  using (private.is_operator());

create policy "usuário lê os próprios vínculos; operador lê todos"
  on public.advertiser_members for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_operator());

create policy "operador gerencia vínculos"
  on public.advertiser_members for all
  to authenticated
  using (private.is_operator())
  with check (private.is_operator());

-- Visitante sem login não lê nada destas tabelas, nem com RLS ligada.
revoke all on public.operators, public.advertisers, public.advertiser_members from anon;

-- ---------------------------------------------------------------------------
-- Cadastro aberto: cada conta nova nasce com um anunciante próprio, com o nome
-- da empresa informado no formulário. A Qlareo liga campanhas a esse anunciante
-- depois do pagamento. Roda como `security definer` porque o usuário recém-
-- criado ainda não tem permissão de inserir em `advertisers`.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_advertiser_id uuid;
  company text := nullif(btrim(new.raw_user_meta_data ->> 'company_name'), '');
begin
  insert into public.advertisers (name)
  values (left(coalesce(company, new.email, 'Anunciante'), 120))
  returning id into new_advertiser_id;

  insert into public.advertiser_members (advertiser_id, user_id)
  values (new_advertiser_id, new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
