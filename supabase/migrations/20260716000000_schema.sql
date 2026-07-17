-- ================================================================
-- PokePP — schema แบบไฟล์ (Supabase migrations)
-- รันด้วย Supabase CLI: `supabase db push` (แทนการก๊อป SQL ไปวางในแดชบอร์ด)
-- idempotent: รันซ้ำได้ ไม่ลบข้อมูล (if not exists / drop policy if exists)
-- ================================================================

-- ===== SAVES (เซฟผู้เล่น 1 แถว/บัญชี) =====
create table if not exists public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table public.saves enable row level security;
drop policy if exists "own save select" on public.saves;
drop policy if exists "own save insert" on public.saves;
drop policy if exists "own save update" on public.saves;
create policy "own save select" on public.saves for select using (auth.uid() = user_id);
create policy "own save insert" on public.saves for insert with check (auth.uid() = user_id);
create policy "own save update" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== LEADERBOARD =====
create table if not exists public.leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text, dex int default 0, playtime int default 0,
  tower int default 0, caught int default 0, team jsonb,
  updated_at timestamptz default now()
);
alter table public.leaderboard add column if not exists hardcore int default 0;
alter table public.leaderboard add column if not exists pvp int default 1000;
alter table public.leaderboard enable row level security;
drop policy if exists "lb public read" on public.leaderboard;
drop policy if exists "lb own insert" on public.leaderboard;
drop policy if exists "lb own update" on public.leaderboard;
drop policy if exists "lb own delete" on public.leaderboard;
create policy "lb public read"  on public.leaderboard for select using (true);
create policy "lb own insert" on public.leaderboard for insert with check (auth.uid() = user_id);
create policy "lb own update" on public.leaderboard for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lb own delete" on public.leaderboard for delete using (auth.uid() = user_id);

-- กันโกงพื้นฐาน server-side: บีบค่าให้อยู่ในช่วงสมเหตุสมผลก่อนบันทึกเสมอ
create or replace function public.lb_sanitize() returns trigger
language plpgsql as $$
begin
  new.dex      := greatest(0, least(coalesce(new.dex, 0),      2000));
  new.playtime := greatest(0, least(coalesce(new.playtime, 0), 5259600));
  new.tower    := greatest(0, least(coalesce(new.tower, 0),    999));
  new.caught   := greatest(0, least(coalesce(new.caught, 0),   9999999));
  new.hardcore := greatest(0, least(coalesce(new.hardcore, 0), 2000));
  new.pvp      := greatest(0, least(coalesce(new.pvp, 1000),   5000));
  new.name     := left(coalesce(new.name, ''), 24);
  return new;
end;
$$;
drop trigger if exists lb_sanitize_trg on public.leaderboard;
create trigger lb_sanitize_trg before insert or update on public.leaderboard
  for each row execute function public.lb_sanitize();

-- ===== TRADES (เทรดระหว่างผู้เล่น) =====
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  from_user uuid not null references auth.users(id) on delete cascade,
  from_name text, to_user uuid references auth.users(id),
  offer_mon jsonb not null, return_mon jsonb,
  status text default 'open', from_collected boolean default false,
  created_at timestamptz default now()
);
alter table public.trades enable row level security;
drop policy if exists "trade read" on public.trades;
drop policy if exists "trade insert" on public.trades;
drop policy if exists "trade update" on public.trades;
drop policy if exists "trade delete" on public.trades;
create policy "trade read"   on public.trades for select using (status='open' or auth.uid()=from_user or auth.uid()=to_user);
create policy "trade insert" on public.trades for insert with check (auth.uid()=from_user);
create policy "trade update" on public.trades for update using (status='open' or auth.uid()=from_user or auth.uid()=to_user) with check (true);
create policy "trade delete" on public.trades for delete using (auth.uid()=from_user);

-- ===== RAID บอสรายสัปดาห์ =====
create table if not exists public.raid_contrib (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_key text not null, name text, damage bigint default 0,
  updated_at timestamptz default now(),
  primary key (user_id, week_key)
);
alter table public.raid_contrib enable row level security;
drop policy if exists "raid public read" on public.raid_contrib;
drop policy if exists "raid own insert" on public.raid_contrib;
drop policy if exists "raid own update" on public.raid_contrib;
create policy "raid public read"  on public.raid_contrib for select using (true);
create policy "raid own insert" on public.raid_contrib for insert with check (auth.uid() = user_id);
create policy "raid own update" on public.raid_contrib for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== LIVE-OPS (คอนฟิกอีเวนต์สด) =====
create table if not exists public.live_config (
  id int primary key default 1,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.live_config enable row level security;
drop policy if exists "live read" on public.live_config;
create policy "live read" on public.live_config for select using (true);
insert into public.live_config (id, config) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- ===== ANALYTICS (เหตุการณ์) =====
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null, meta jsonb,
  created_at timestamptz default now()
);
alter table public.events enable row level security;
grant insert on public.events to anon, authenticated;
drop policy if exists "events insert" on public.events;
create policy "events insert" on public.events for insert with check (true);
create index if not exists events_name_time on public.events (name, created_at desc);
