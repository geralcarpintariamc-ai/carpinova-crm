-- Catálogo de custos (materiais, ferragens, acabamentos, mão de obra).
-- Correr uma vez no SQL Editor do Supabase. Mesmo formato das outras tabelas do CRM.
create table if not exists public.catalogo (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.catalogo enable row level security;

drop policy if exists "catalogo autenticados" on public.catalogo;
create policy "catalogo autenticados" on public.catalogo
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.catalogo;
