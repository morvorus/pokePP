// ================================================================
// PokePP — Edge Function: submit-score
// ตัวอย่าง "server-authoritative" — ตรวจ+บีบค่าคะแนนฝั่ง server ก่อนบันทึก
// (ก้าวจาก client-trust → server-trust · กันโกงจริงจังกว่า trigger)
//
// Deploy: supabase functions deploy submit-score
// ต้องตั้ง secret: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (มีให้อยู่แล้วใน env ของ Edge Functions)
//
// ฝั่งเกมเรียกแทน .from('leaderboard').upsert(...) ด้วย:
//   await Cloud.client.functions.invoke('submit-score', { body: score })
// (ส่ง JWT ผู้ใช้อัตโนมัติผ่าน header — ฟังก์ชันจึงรู้ว่าใครส่ง โดยไม่เชื่อ user_id จาก client)
// ================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const clamp = (v: unknown, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // 1) ยืนยันตัวตนจาก JWT (ไม่เชื่อ user_id ที่ client ส่งมา)
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return new Response('Unauthorized', { status: 401 });
  const userId = userData.user.id;

  // 2) รับ + บีบค่า (server เป็นคนตัดสิน ไม่เชื่อค่าดิบจาก client)
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ว่าง */ }
  const row = {
    user_id: userId,
    name: String(body.name ?? 'เทรนเนอร์').slice(0, 24),
    dex: clamp(body.dex, 0, 2000),
    playtime: clamp(body.playtime, 0, 5259600),
    tower: clamp(body.tower, 0, 999),
    caught: clamp(body.caught, 0, 9999999),
    hardcore: clamp(body.hardcore, 0, 2000),
    pvp: clamp(body.pvp, 0, 5000),
    team: Array.isArray(body.team) ? (body.team as unknown[]).slice(0, 6) : null,
    updated_at: new Date().toISOString(),
  };

  // 3) upsert ด้วย service role (ผ่าน RLS ได้ เพราะ server ตรวจสอบแล้ว)
  const { error } = await admin.from('leaderboard').upsert(row);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
