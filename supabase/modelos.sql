-- Modelos de artigo (custo por unidade reutilizável). Correr uma vez no SQL Editor do Supabase.
create table if not exists public.modelos (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.modelos enable row level security;
drop policy if exists "modelos autenticados" on public.modelos;
create policy "modelos autenticados" on public.modelos
  for all to authenticated using (true) with check (true);
do $$ begin
  alter publication supabase_realtime add table public.modelos;
exception when duplicate_object then null; end $$;
