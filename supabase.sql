-- Rode no Supabase: SQL Editor > New query > Run
create table if not exists items (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists trades (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  data jsonb not null
);
alter table items  enable row level security;
alter table trades enable row level security;

-- Itens: lista GLOBAL (qualquer conta logada lê e edita)
drop policy if exists "items read" on items;
create policy "items read" on items for select to authenticated using (true);
drop policy if exists "items insert" on items;
create policy "items insert" on items for insert to authenticated with check (true);
drop policy if exists "items update" on items;
create policy "items update" on items for update to authenticated using (true);
drop policy if exists "items delete" on items;
create policy "items delete" on items for delete to authenticated using (true);

-- Trades: cada conta só vê/cria/apaga as suas
drop policy if exists "trades read" on trades;
create policy "trades read" on trades for select to authenticated using (user_id = auth.uid());
drop policy if exists "trades insert" on trades;
create policy "trades insert" on trades for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "trades delete" on trades;
create policy "trades delete" on trades for delete to authenticated using (user_id = auth.uid());
