-- Área do operador.
--
-- O anunciante nasce do cadastro aberto, com o nome da empresa que a pessoa
-- digitou. Para o operador saber quem é quem, ele precisa do e-mail de quem tem
-- acesso, e o e-mail mora em `auth.users`, que o cliente não lê. Esta função é a
-- porta: devolve a lista só para operador e, para qualquer outra conta, nada.

create function public.operator_advertisers()
returns table (
  id             uuid,
  name           text,
  created_at     timestamptz,
  member_emails  text[],
  campaign_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.name,
    a.created_at,
    coalesce(array_agg(distinct u.email::text) filter (where u.email is not null), '{}'),
    (select count(*) from public.campaigns c where c.advertiser_id = a.id)
  from public.advertisers a
  left join public.advertiser_members m on m.advertiser_id = a.id
  left join auth.users u on u.id = m.user_id
  where private.is_operator()
  group by a.id
  order by a.created_at desc;
$$;

revoke all on function public.operator_advertisers() from public, anon;
grant execute on function public.operator_advertisers() to authenticated;
