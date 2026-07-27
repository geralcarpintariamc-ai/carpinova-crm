-- Carpinova CRM — esquema Supabase
-- Corre isto em: Supabase > SQL Editor > New query > Run

create table if not exists obras (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: aqui abrimos tudo (leitura + escrita) para quem tiver
-- a URL e a "anon key" do projeto. Serve para uma ferramenta interna entre
-- duas pessoas de confiança. Não partilhes a key publicamente (ex: repo
-- privado ou variável de ambiente no GitHub Actions, não hardcoded num
-- repo público sem cuidado).
alter table obras enable row level security;

drop policy if exists "acesso total uso interno" on obras;
create policy "acesso total uso interno" on obras
  for all
  using (true)
  with check (true);

-- Liga o Realtime nesta tabela (para os dois computadores verem as
-- alterações um do outro sem refrescar a página).
alter publication supabase_realtime add table obras;
