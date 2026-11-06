-- Fim dos planos Impacto e Alcance (decisão do dono em 06/11/2026).
--
-- Cada sacola tem uma marca só. O anunciante escolhe pôr a arte num lado
-- (R$ 2,00 por sacola) ou nos dois (frente e verso, 25% a mais: R$ 2,50).
-- Não existe mais lado vendido para outro anunciante, então some a coluna
-- `side` e, com ela, o risco de duas marcas no mesmo lado da mesma sacola.
--
-- O preço mora na landing (`lib/pricing.ts` de `qlareo-LP`); aqui fica só o
-- que a gráfica precisa saber: uma arte ou duas.
--
-- Campanha antiga: Impacto já era frente e verso; Alcance vira um lado (o lado
-- escolhido deixa de importar, porque o outro lado não é de ninguém).

alter table public.campaigns drop constraint campaigns_side_matches_plan;
alter table public.campaigns drop column side;
drop type public.bag_side;

alter type public.campaign_plan rename value 'impacto' to 'frente_e_verso';
alter type public.campaign_plan rename value 'alcance' to 'um_lado';
alter type public.campaign_plan rename to campaign_sides;

alter table public.campaigns rename column plan to sides;
alter table public.campaigns alter column sides set default 'um_lado';
