# PokePP — Supabase (Infrastructure as Code)

โฟลเดอร์นี้ทำให้ backend เป็น **มืออาชีพ**: schema เก็บเป็นไฟล์ (ทำซ้ำ/รีวิว/rollback ได้)
แทนการก๊อป SQL ไปวางในแดชบอร์ดทีละครั้ง

```
supabase/
  migrations/20260716000000_schema.sql   # ทั้ง schema (idempotent)
  functions/submit-score/index.ts        # Edge Function ตรวจคะแนนฝั่ง server (กันโกงจริง)
```

## ติดตั้ง Supabase CLI (ครั้งเดียว)
```bash
npm i -g supabase          # หรือ: brew install supabase/tap/supabase
supabase login             # เปิดเบราว์เซอร์ยืนยัน
supabase link --project-ref <project-ref>   # ref อยู่ใน URL แดชบอร์ด /project/<ref>
```

## 1) รัน migrations (schema ทั้งหมด)
```bash
supabase db push
```
> รันซ้ำได้ปลอดภัย (idempotent) — ไม่ลบข้อมูลเดิม · แทนการรัน SQL มือในแดชบอร์ด
> แก้ schema ครั้งหน้า = เพิ่มไฟล์ `migrations/<timestamp>_ชื่อ.sql` แล้ว `db push` อีกครั้ง

## 2) (ตัวเลือก) Deploy Edge Function กันโกงจริง
```bash
supabase functions deploy submit-score
```
แล้วเปลี่ยนฝั่งเกม `cloud.js` ให้ส่งคะแนนผ่านฟังก์ชันแทน upsert ตรง:
```js
// เดิม: await this.client.from('leaderboard').upsert(row)
const { error } = await this.client.functions.invoke('submit-score', { body: score });
```
ข้อดี: server เป็นคนบีบ/ตรวจค่า (ไม่เชื่อ client เลย) · `user_id` มาจาก JWT ไม่ใช่จาก client
> ก้าวถัดไปของ "server-authoritative": ย้ายการตรวจผล PvP / เทรด ไปเป็น Edge Function แบบเดียวกัน

## หมายเหตุ
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` มีให้ใน env ของ Edge Functions อยู่แล้ว (ไม่ต้องตั้งเอง)
- **service_role key ห้ามใส่ในโค้ดฝั่ง client เด็ดขาด** — ใช้เฉพาะใน Edge Function (ฝั่ง server)
- ตอนนี้เกมยัง upsert ตรง + มี trigger `lb_sanitize` กันค่าเพี้ยนอยู่แล้ว — Edge Function เป็น "อัปเกรด" เมื่อพร้อม
