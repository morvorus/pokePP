/* ================================================================
   cloud.js — Cloud Save + Login ด้วย Supabase
   วิธีตั้งค่า: ดู CLOUD_SETUP.md แล้ววาง URL + anon key ด้านล่าง
   ถ้ายังไม่ตั้งค่า เกมจะทำงานแบบออฟไลน์ (localStorage) เหมือนเดิมทุกอย่าง
   ================================================================ */

// 🔧 วางค่าจาก Supabase ที่นี่ (Project Settings → API)
const SUPABASE_URL = 'https://sldugzvfpcuefqfckbcn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9kpTxZmur4ZItJUpHVNUVw_XWPzmxHM';

const Cloud = {
  enabled: false,
  client: null,
  user: null,
  _authCb: null,

  init() {
    if (!window.supabase || !SUPABASE_URL || SUPABASE_URL.startsWith('PASTE')) {
      console.log('[Cloud] ยังไม่ได้ตั้งค่า Supabase — เล่นแบบออฟไลน์');
      return;
    }
    try {
      this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      this.enabled = true;
      this.client.auth.onAuthStateChange((_event, session) => {
        this.user = session ? session.user : null;
        if (this._authCb) this._authCb();
      });
      console.log('[Cloud] Supabase พร้อมใช้งาน');
    } catch (e) {
      console.warn('[Cloud] init ล้มเหลว', e);
      this.enabled = false;
    }
  },

  onAuth(cb) { this._authCb = cb; },

  async restoreSession() {
    if (!this.enabled) return null;
    try {
      const { data } = await this.client.auth.getSession();
      this.user = data && data.session ? data.session.user : null;
      return this.user;
    } catch (e) { return null; }
  },

  async signUp(email, password) {
    if (!this.enabled) return { error: 'ยังไม่ได้ตั้งค่า cloud' };
    try {
      const { data, error } = await this.client.auth.signUp({ email, password });
      if (error) return { error: error.message };
      this.user = data.user || null;
      // ถ้าเปิด email confirmation จะยังไม่มี session
      const hasSession = !!(data.session);
      return { ok: true, needConfirm: !hasSession };
    } catch (e) { return { error: String(e) }; }
  },

  async signIn(email, password) {
    if (!this.enabled) return { error: 'ยังไม่ได้ตั้งค่า cloud' };
    try {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      this.user = data.user || null;
      return { ok: true };
    } catch (e) { return { error: String(e) }; }
  },

  async signOut() {
    if (!this.enabled) return;
    try { await this.client.auth.signOut(); } catch (e) {}
    this.user = null;
  },

  // ดึงเซฟจากคลาวด์ (คืน object หรือ null)
  async pull() {
    if (!this.enabled || !this.user) return null;
    try {
      const { data, error } = await this.client
        .from('saves').select('data, updated_at')
        .eq('user_id', this.user.id).maybeSingle();
      if (error) { console.warn('[Cloud] pull error', error.message); return null; }
      return data ? { data: data.data, updatedAt: data.updated_at } : null;
    } catch (e) { console.warn('[Cloud] pull ex', e); return null; }
  },

  // อัปโหลดเซฟขึ้นคลาวด์
  async push(saveObj) {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { error } = await this.client.from('saves').upsert({
        user_id: this.user.id,
        data: saveObj,
        updated_at: new Date().toISOString(),
      });
      if (error) { console.warn('[Cloud] push error', error.message); return { error: error.message }; }
      return { ok: true };
    } catch (e) { return { error: String(e) }; }
  },

  // ===== กระดานจัดอันดับ (ต้องสร้างตาราง public.leaderboard ก่อน — ดู CLOUD_SETUP.md) =====
  // ส่งสถิติของผู้เล่นขึ้นกระดาน (upsert แถวของตัวเอง)
  async submitScore(score) {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const cap = (v, max) => Math.max(0, Math.min(max, v | 0));   // กันค่าเว่อร์ชั้นที่สอง
      const row = {
        user_id: this.user.id,
        name: (score.name || 'เทรนเนอร์').slice(0, 24),
        dex: cap(score.dex, 2000), playtime: cap(score.playtime, 5259600),
        tower: cap(score.tower, 999), caught: cap(score.caught, 9999999),
        hardcore: cap(score.hardcore, 2000),   // เดกซ์ที่ทำได้ระหว่างเปิดโหมด Hardcore (0 ถ้าไม่เคยเปิด)
        pvp: cap(score.pvp, 5000),             // คะแนน PvP จัดอันดับตามฤดูกาล
        updated_at: new Date().toISOString(),
      };
      if (score.team) row.team = score.team;   // สแนปช็อตทีมสำหรับ Ghost Battle (ถ้ามีคอลัมน์ team)
      const { error } = await this.client.from('leaderboard').upsert(row);
      if (error) return { error: error.message };
      return { ok: true };
    } catch (e) { return { error: String(e) }; }
  },
  // ดึงทีมของผู้เล่นคนอื่นมาเป็นคู่ต่อสู้ (Ghost Battle) — สุ่มจากคนที่อัปทีมล่าสุด
  async ghostList(limit) {
    if (!this.enabled) return { error: 'cloud ปิดอยู่' };
    try {
      const { data, error } = await this.client
        .from('leaderboard').select('user_id, name, team, dex, tower')
        .not('team', 'is', null)
        .order('updated_at', { ascending: false }).limit(limit || 40);
      if (error) return { error: error.message };
      const meId = this.user ? this.user.id : null;
      const rows = (data || []).filter(r => r.user_id !== meId && Array.isArray(r.team) && r.team.length);
      return { ok: true, rows };
    } catch (e) { return { error: String(e) }; }
  },
  // ท้าเพื่อนเจาะจงด้วยชื่อ (friend code = ชื่อที่แสดงบนกระดาน)
  async ghostByName(name) {
    if (!this.enabled) return { error: 'cloud ปิดอยู่' };
    try {
      const { data, error } = await this.client
        .from('leaderboard').select('user_id, name, team, dex, tower')
        .eq('name', name).not('team', 'is', null)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) return { error: error.message };
      if (!data || !Array.isArray(data.team) || !data.team.length) return { ok: true, ghost: null };
      if (this.user && data.user_id === this.user.id) return { ok: true, ghost: null, own: true };
      return { ok: true, ghost: data };
    } catch (e) { return { error: String(e) }; }
  },
  // ลบสถิติของตัวเองออกจากกระดาน (ต้องมี delete policy)
  async deleteMyScore() {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { data, error } = await this.client.from('leaderboard').delete().eq('user_id', this.user.id).select();
      if (error) return { error: error.message };
      if (!data || !data.length) return { error: 'ลบไม่สำเร็จ — ยังไม่ได้เพิ่ม delete policy (ดู CLOUD_SETUP.md)' };
      return { ok: true };
    } catch (e) { return { error: String(e) }; }
  },
  // ดึงอันดับสูงสุดตามคอลัมน์ (dex/playtime/tower/caught)
  async topScores(column, limit) {
    if (!this.enabled) return { error: 'cloud ปิดอยู่' };
    const col = ['dex', 'playtime', 'tower', 'caught', 'hardcore', 'pvp'].includes(column) ? column : 'dex';
    try {
      const { data, error } = await this.client
        .from('leaderboard').select('name, dex, playtime, tower, caught, hardcore, pvp')
        .order(col, { ascending: false }).limit(limit || 20);
      if (error) return { error: error.message };
      return { ok: true, rows: data || [], me: this.user ? this.user.id : null };
    } catch (e) { return { error: String(e) }; }
  },

  // ===== Live-Ops: ดึงคอนฟิกอีเวนต์สด (แก้ในแดชบอร์ด Supabase ได้เลย ไม่ต้อง deploy) =====
  // อ่านสาธารณะ ไม่ต้องล็อกอิน · ถ้าไม่ได้ตั้งค่า/ผิดพลาด คืน {} (เกมใช้ค่าเริ่มต้น = ไม่มีอีเวนต์)
  async getLiveConfig() {
    if (!this.enabled) return {};
    try {
      const { data, error } = await this.client
        .from('live_config').select('config').eq('id', 1).maybeSingle();
      if (error || !data) return {};
      return (data.config && typeof data.config === 'object') ? data.config : {};
    } catch (e) { return {}; }
  },

  // ===== ฟีดแจ้งเตือนทั้งเซิร์ฟเวอร์ (จับเทพ/ไชนี่, ได้กำไรเมก้า ฯลฯ) — ผ่านตาราง feed =====
  // ใช้ DB insert + poll (เสถียรกว่า Realtime broadcast มาก) · ถ้าไม่มีตาราง/ผิดพลาดก็เงียบ ไม่กระทบเกม
  async pushFeed(row) {
    if (!this.enabled) return;
    try {
      await this.client.from('feed').insert({
        name: String(row.name || 'เทรนเนอร์').slice(0, 24),
        kind: String(row.kind || '').slice(0, 16),
        mon: String(row.mon || '').slice(0, 24),
      });
    } catch (e) { /* เงียบ */ }
  },
  async recentFeed(sinceIso) {
    if (!this.enabled) return [];
    try {
      const { data, error } = await this.client.from('feed')
        .select('id, name, kind, mon, created_at')
        .gt('created_at', sinceIso).order('created_at', { ascending: true }).limit(20);
      return error ? [] : (data || []);
    } catch (e) { return []; }
  },

  // ===== Analytics: log เหตุการณ์สำคัญ (fire-and-forget · ไม่บล็อกเกม · ไม่ล้ม) =====
  // ต้องสร้างตาราง public.events (ดู CLOUD_SETUP.md) · ถ้าไม่มี/ผิดพลาด เงียบไป ไม่กระทบเกม
  logEvent(name, meta) {
    if (!this.enabled || !name) return;
    try {
      this.client.from('events').insert({
        user_id: this.user ? this.user.id : null,
        name: String(name).slice(0, 40),
        meta: meta || {},
      }).then(() => {}, () => {});   // fire-and-forget, กลืน error
    } catch (e) { /* เงียบ */ }
  },

  // ===== เทรดโปเกมอนระหว่างผู้เล่น (ต้องสร้างตาราง public.trades — ดู CLOUD_SETUP.md) =====
  async createTrade(code, fromName, offerMon) {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { error } = await this.client.from('trades').insert({
        code, from_user: this.user.id, from_name: (fromName || 'เทรนเนอร์').slice(0, 24),
        offer_mon: offerMon, status: 'open',
      });
      if (error) return { error: error.message };
      return { ok: true, code };
    } catch (e) { return { error: String(e) }; }
  },
  async findTrade(code) {
    if (!this.enabled) return { error: 'cloud ปิดอยู่' };
    try {
      const { data, error } = await this.client.from('trades')
        .select('id, code, from_user, from_name, offer_mon, status').eq('code', code).eq('status', 'open').maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { ok: true, trade: null };
      if (data.from_user === this.user.id) return { ok: true, trade: null, own: true };
      return { ok: true, trade: data };
    } catch (e) { return { error: String(e) }; }
  },
  async completeTrade(id, returnMon) {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { data, error } = await this.client.from('trades')
        .update({ to_user: this.user.id, return_mon: returnMon, status: 'completed' })
        .eq('id', id).eq('status', 'open').select().maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'เทรดนี้ถูกรับไปแล้วหรือไม่พบ' };
      return { ok: true, trade: data };
    } catch (e) { return { error: String(e) }; }
  },
  async myOpenTrades() {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { data, error } = await this.client.from('trades')
        .select('id, code, offer_mon, created_at').eq('from_user', this.user.id).eq('status', 'open').order('created_at', { ascending: false });
      if (error) return { error: error.message };
      return { ok: true, rows: data || [] };
    } catch (e) { return { error: String(e) }; }
  },
  async myIncomingTrades() {   // เทรดที่คนอื่นแลกแล้ว รอเรารับตัวที่เขาส่งกลับ
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { data, error } = await this.client.from('trades')
        .select('id, return_mon, from_name, to_user').eq('from_user', this.user.id).eq('status', 'completed').eq('from_collected', false);
      if (error) return { error: error.message };
      return { ok: true, rows: data || [] };
    } catch (e) { return { error: String(e) }; }
  },
  async markTradeCollected(id) {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { error } = await this.client.from('trades').update({ from_collected: true }).eq('id', id);
      if (error) return { error: error.message };
      return { ok: true };
    } catch (e) { return { error: String(e) }; }
  },
  async cancelTrade(id) {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    try {
      const { data, error } = await this.client.from('trades').delete().eq('id', id).eq('from_user', this.user.id).eq('status', 'open').select().maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: 'ยกเลิกไม่ได้ (อาจถูกรับไปแล้ว)' };
      return { ok: true, trade: data };
    } catch (e) { return { error: String(e) }; }
  },

  // ===== Raid บอสรายสัปดาห์ (ร่วมมือ) — ต้องสร้างตาราง public.raid_contrib ก่อน — ดู CLOUD_SETUP.md =====
  // ส่งความเสียหายที่ทำได้ในรอบนี้ไปสมทบยอดรวมของสัปดาห์ (บวกเข้ากับที่มีอยู่ ไม่ทับ)
  async raidAddDamage(weekKey, name, dmg) {
    if (!this.enabled || !this.user) return { error: 'ไม่ได้ล็อกอิน' };
    if (!(dmg > 0)) return { ok: true, total: 0 };
    try {
      const { data: existing, error: selErr } = await this.client
        .from('raid_contrib').select('damage')
        .eq('user_id', this.user.id).eq('week_key', weekKey).maybeSingle();
      if (selErr) return { error: selErr.message };
      const total = Math.max(0, (existing ? existing.damage : 0) + Math.floor(dmg));
      const { error } = await this.client.from('raid_contrib').upsert({
        user_id: this.user.id, week_key: weekKey,
        name: (name || 'เทรนเนอร์').slice(0, 24), damage: total,
        updated_at: new Date().toISOString(),
      });
      if (error) return { error: error.message };
      return { ok: true, total };
    } catch (e) { return { error: String(e) }; }
  },
  // ยอดรวมความเสียหายทั้งเซิร์ฟเวอร์ของสัปดาห์นี้ + อันดับผู้ร่วมสมทบสูงสุด
  async raidTotal(weekKey) {
    if (!this.enabled) return { error: 'cloud ปิดอยู่' };
    try {
      const { data, error } = await this.client
        .from('raid_contrib').select('name, damage, user_id').eq('week_key', weekKey);
      if (error) return { error: error.message };
      const rows = data || [];
      const total = rows.reduce((s, r) => s + (r.damage || 0), 0);
      const top = [...rows].sort((a, b) => (b.damage || 0) - (a.damage || 0)).slice(0, 10);
      const mine = this.user ? rows.find(r => r.user_id === this.user.id) : null;
      return { ok: true, total, top, mine: mine ? mine.damage : 0, contributors: rows.length };
    } catch (e) { return { error: String(e) }; }
  },

  email() { return this.user ? this.user.email : null; },
  loggedIn() { return this.enabled && !!this.user; },
};

window.Cloud = Cloud;   // ผูกกับ window เพื่อให้ game.js เข้าถึงได้ (window.Cloud)
Cloud.init();
