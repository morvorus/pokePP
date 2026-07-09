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
```

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
