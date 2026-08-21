-- ソウル犬同伴マップ / Supabase スキーマ
-- Supabase の SQL Editor にこのまま貼って実行してください。
-- 行レベルセキュリティ（RLS）により、各ユーザーは自分の行しか読み書きできません。

-- ---------- お気に入り ----------
create table if not exists public.favourites (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  place_id   integer     not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table public.favourites enable row level security;

drop policy if exists "own favourites" on public.favourites;
create policy "own favourites" on public.favourites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- 自分のピン ----------
create table if not exists public.pins (
  id         uuid        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null default '',
  note       text        not null default '',
  lat        double precision not null,
  lng        double precision not null,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists pins_user_idx on public.pins (user_id);

alter table public.pins enable row level security;

drop policy if exists "own pins" on public.pins;
create policy "own pins" on public.pins
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
