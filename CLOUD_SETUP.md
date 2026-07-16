# ☁️ ตั้งค่า Cloud Save + Login (Supabase)

เกมทำงานแบบออฟไลน์ (localStorage) ได้อยู่แล้ว — ทำตามนี้ถ้าอยากเปิด "เซฟบนคลาวด์ + ล็อกอินข้ามเครื่อง"
ฟรีทั้งหมด ใช้เวลา ~10 นาที

## 1. สร้างโปรเจกต์ Supabase
1. ไปที่ https://supabase.com → Sign up (ใช้ GitHub/Google ได้)
2. กด **New project** → ตั้งชื่อ (เช่น `pokepp`) → ตั้ง Database password (จดไว้) → เลือก Region ใกล้ไทย (Singapore) → **Create**
3. รอสร้างเสร็จ ~2 นาที

## 2. สร้างตารางเก็บเซฟ
เมนูซ้าย → **SQL Editor** → **New query** → วางโค้ดนี้ → กด **Run**:

```sql
-- ตารางเก็บเซฟผู้เล่น (1 แถวต่อ 1 บัญชี)
create table public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- เปิด Row Level Security: ผู้เล่นเห็น/แก้ได้เฉพาะเซฟตัวเอง
alter table public.saves enable row level security;

create policy "own save select" on public.saves for select using (auth.uid() = user_id);
create policy "own save insert" on public.saves for insert with check (auth.uid() = user_id);
create policy "own save update" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== (ตัวเลือก) ตารางกระดานจัดอันดับ =====
-- ทุกคนอ่านได้ (ดูอันดับคนอื่น) แต่แก้ได้เฉพาะแถวตัวเอง
create table public.leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  dex int default 0,
  playtime int default 0,
  tower int default 0,
  caught int default 0,
  team jsonb,          -- สแนปช็อตทีม สำหรับ Ghost Battle (สู้กับทีมผู้เล่นคนอื่นแบบ AI)
  updated_at timestamptz default now()
);
alter table public.leaderboard enable row level security;
create policy "lb public read"  on public.leaderboard for select using (true);
create policy "lb own insert" on public.leaderboard for insert with check (auth.uid() = user_id);
create policy "lb own update" on public.leaderboard for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lb own delete" on public.leaderboard for delete using (auth.uid() = user_id);

-- ===== (ตัวเลือก) ตารางเทรดโปเกมอนระหว่างผู้เล่น =====
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  from_user uuid not null references auth.users(id) on delete cascade,
  from_name text,
  to_user uuid references auth.users(id),
  offer_mon jsonb not null,     -- ตัวที่ผู้สร้างเสนอ
  return_mon jsonb,             -- ตัวที่ผู้รับส่งกลับ
  status text default 'open',   -- open | completed
  from_collected boolean default false,
  created_at timestamptz default now()
);
alter table public.trades enable row level security;
-- อ่านได้: รายการ open (ค้นด้วยโค้ด) หรือของที่เกี่ยวกับตัวเอง
create policy "trade read"   on public.trades for select using (status = 'open' or auth.uid() = from_user or auth.uid() = to_user);
create policy "trade insert" on public.trades for insert with check (auth.uid() = from_user);
-- อัปเดต: เจ้าของ หรือผู้เล่นที่กำลังรับเทรด open อยู่
create policy "trade update" on public.trades for update using (status = 'open' or auth.uid() = from_user or auth.uid() = to_user) with check (true);
-- ลบ: เจ้าของยกเลิกข้อเสนอ open ของตัวเอง
create policy "trade delete" on public.trades for delete using (auth.uid() = from_user);

-- ===== (ตัวเลือก) เพิ่มคอลัมน์ Hardcore เข้ากระดานจัดอันดับเดิม =====
-- ⚠️ ต้องรันก่อนใช้งาน ไม่งั้นการส่งสถิติ/โหลดกระดานจัดอันดับ (ทุกแท็บ) จะ error ทันที เพราะโค้ดฝั่งเกมส่งคอลัมน์นี้ไปด้วยเสมอ
alter table public.leaderboard add column if not exists hardcore int default 0;
alter table public.leaderboard add column if not exists pvp int default 1000;   -- คะแนน PvP จัดอันดับตามฤดูกาล

-- ===== (แนะนำ) 🛡️ กันโกงพื้นฐาน server-side — บีบค่าให้สมเหตุสมผลก่อนบันทึกเสมอ =====
-- ผู้เล่นที่ดัดแปลงโค้ดฝั่ง client จะยัดค่าเวอร์ๆ ขึ้นกระดานไม่ได้ (ค่าถูก clamp อัตโนมัติ ไม่ error)
-- หมายเหตุ: ตรรกะเกมยังอยู่ฝั่ง client — นี่คือ "กันค่าที่เป็นไปไม่ได้" ไม่ใช่กันโกงสมบูรณ์
-- รันหลัง alter คอลัมน์ด้านบนแล้ว (ฟังก์ชันอ้างถึง hardcore/pvp)
create or replace function public.lb_sanitize() returns trigger
language plpgsql as $$
begin
  new.dex      := greatest(0, least(coalesce(new.dex, 0),      2000));
  new.playtime := greatest(0, least(coalesce(new.playtime, 0), 5259600));   -- ~60 วัน (วินาที)
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

-- ===== (ตัวเลือก) ตาราง Raid บอสรายสัปดาห์ (ร่วมมือหลายคน) =====
create table public.raid_contrib (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_key text not null,
  name text,
  damage bigint default 0,
  updated_at timestamptz default now(),
  primary key (user_id, week_key)
);
alter table public.raid_contrib enable row level security;
create policy "raid public read"  on public.raid_contrib for select using (true);
create policy "raid own insert" on public.raid_contrib for insert with check (auth.uid() = user_id);
create policy "raid own update" on public.raid_contrib for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== (ตัวเลือก) 🎛️ Live-Ops: คุมอีเวนต์สดโดยไม่ต้อง deploy =====
-- แก้แถว id=1 คอลัมน์ config (JSONB) ในแดชบอร์ด → ผู้เล่นทุกคนเห็นภายใน ~5 นาที
-- อ่านสาธารณะ · ไม่มี write policy = แก้ได้เฉพาะแดชบอร์ด/service-role (ปลอดภัย)
create table if not exists public.live_config (
  id int primary key default 1,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.live_config enable row level security;
create policy "live read" on public.live_config for select using (true);
insert into public.live_config (id, config) values (1, '{}'::jsonb) on conflict (id) do nothing;
```

### 🎛️ วิธีจัดอีเวนต์สด (หลังสร้างตาราง live_config)
เมนูซ้าย **Table Editor → live_config →** แก้ช่อง `config` ของแถว id=1 เป็น JSON เช่น:
```json
{
  "message": "สุดสัปดาห์ Double XP! 🎉",
  "messageUntil": "2026-07-20T17:00:00Z",
  "eventEmoji": "🎉",
  "xpMult": 2,
  "shinyMult": 1.5,
  "coinMult": 1
}
```
- `message` + `messageUntil` — ป้ายประกาศบนหน้าล่า (หมดเวลาแล้วหายเอง) · เว้นว่าง = ไม่โชว์
- `xpMult` (1–5) · `shinyMult` (0.1–10) · `coinMult` (1–5) — ตัวคูณ (เกม clamp กันค่าเพี้ยนอยู่แล้ว)
- อยากปิดอีเวนต์: ตั้งค่ากลับเป็น `{}` หรือ mult=1 · ไม่สร้างตารางนี้เกมก็เล่นได้ปกติ (ไม่มีอีเวนต์สด)

## 2.1 (ตัวเลือก) 📊 Analytics — ดูข้อมูลผู้เล่นจริง
สร้างตารางเก็บเหตุการณ์ (เปิดเล่น/ผ่านทิวทอเรียล/ก้าวหน้ามือใหม่) เพื่อดู DAU / retention / จุดที่ผู้เล่นเลิก
```sql
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  meta jsonb,
  created_at timestamptz default now()
);
alter table public.events enable row level security;
-- ให้ทุกคน (รวมยังไม่ล็อกอิน) "เขียน" log ได้ แต่ "อ่าน" ไม่ได้ (อ่านได้เฉพาะแดชบอร์ด/service-role = ความเป็นส่วนตัว)
grant insert on public.events to anon, authenticated;
drop policy if exists "events insert" on public.events;
create policy "events insert" on public.events for insert with check (true);
create index if not exists events_name_time on public.events (name, created_at desc);
```
> เกม log แค่เหตุการณ์รวมๆ ไม่มีข้อมูลส่วนตัว · ถ้าไม่สร้างตารางนี้เกมก็เล่นได้ปกติ (ไม่ log อะไร)

### 📊 วิธีดูข้อมูล (Supabase → SQL Editor)
```sql
-- ผู้เล่นใช้งานต่อวัน (DAU) 14 วันล่าสุด
select date(created_at) วัน, count(distinct user_id) คน, count(*) เซสชัน
from public.events where name='session_start' and created_at > now()-interval '14 days'
group by 1 order by 1 desc;

-- funnel มือใหม่: แต่ละด่านมีคนทำกี่คน (จับ→สู้→ร้าน→ตกปลา→เควส)
select meta->>'step' ด่าน, count(distinct user_id) คน
from public.events where name='onboarding' group by 1 order by 2 desc;

-- อัตราผ่านทิวทอเรียล
select
  (select count(*) from public.events where name='tutorial_done') ผ่านทิวทอเรียล,
  (select count(distinct user_id) from public.events where name='session_start') ผู้เล่นทั้งหมด;
```
> **ข้อมูลผู้เล่นแบบสแนปช็อต** ดูได้จากตาราง **`leaderboard`** อยู่แล้ว (dex/playtime/tower/caught/pvp ต่อคน) — เมนูซ้าย **Table Editor → leaderboard**

## 3. (แนะนำ) ปิดยืนยันอีเมล เพื่อล็อกอินง่ายขึ้น
เมนูซ้าย → **Authentication** → **Providers** → **Email** → ปิด **Confirm email** → Save
> ถ้าเปิดไว้ ผู้เล่นต้องยืนยันอีเมลก่อนล็อกอิน (ปลอดภัยกว่าแต่ยุ่งกว่า)

## 4. เอา URL + Key มาวางในเกม
เมนูซ้าย → **Project Settings** (⚙️) → **API** → คัดลอก 2 ค่า:
- **Project URL** (เช่น `https://abcd1234.supabase.co`)
- **anon public** key (ยาวๆ ขึ้นต้น `eyJ...`)

เปิดไฟล์ **`cloud.js`** แก้ 2 บรรทัดบนสุด:
```js
const SUPABASE_URL = 'https://abcd1234.supabase.co';        // ← Project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';                  // ← anon public key
```
> `anon key` เปิดเผยได้ปลอดภัย (ออกแบบมาให้ใช้ฝั่ง client) เพราะมี RLS ปกป้องอยู่

## 5. เสร็จ!
รีเฟรชเกม → ไปแท็บ **⚙️ เมนู** → หัวข้อ **☁️ บัญชี / เซฟคลาวด์** → สมัคร/เข้าสู่ระบบ
- เซฟจะ sync ขึ้นคลาวด์อัตโนมัติ (ทุกครั้งที่มีการเปลี่ยนแปลง)
- ล็อกอินเครื่องอื่นด้วยบัญชีเดิม → เซฟตามไปด้วย

---

## ⚠️ หมายเหตุ
- **การกันโกง:** ตรรกะเกมอยู่ฝั่ง client ผู้เล่นที่ตั้งใจโกงยังแก้เซฟตัวเองได้ (เหมาะกับเล่นแคชวล/กับเพื่อน) — ถ้าจะทำ leaderboard/ตลาดแข่งขันจริงจัง ต้องย้ายตรรกะบางส่วนไป server ทีหลัง
- **ฟรี tier Supabase:** เพียงพอสำหรับผู้เล่นหลักพัน (500MB DB, 50,000 auth users/เดือน)
- **ความขัดแย้งของเซฟ:** ตอนล็อกอิน เกมจะโหลดเซฟจาก "คลาวด์" มาทับเครื่องปัจจุบัน (คลาวด์เป็นหลัก) — ถ้าเพิ่งเล่นในเครื่องนี้แบบยังไม่ล็อกอิน ให้ Sync ขึ้นก่อนล็อกอินเครื่องอื่น
- ถ้าไม่ตั้งค่า cloud.js เกมจะเล่นออฟไลน์เหมือนเดิมทุกอย่าง (ไม่พัง)
