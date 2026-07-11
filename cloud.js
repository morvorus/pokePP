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
      const row = {
        user_id: this.user.id,
        name: (score.name || 'เทรนเนอร์').slice(0, 24),
        dex: score.dex | 0, playtime: score.playtime | 0,
        tower: score.tower | 0, caught: score.caught | 0,
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
  // ดึงอันดับสูงสุดตามคอลัมน์ (dex/playtime/tower/caught)
  async topScores(column, limit) {
    if (!this.enabled) return { error: 'cloud ปิดอยู่' };
    const col = ['dex', 'playtime', 'tower', 'caught'].includes(column) ? column : 'dex';
    try {
      const { data, error } = await this.client
        .from('leaderboard').select('name, dex, playtime, tower, caught')
        .order(col, { ascending: false }).limit(limit || 20);
      if (error) return { error: error.message };
      return { ok: true, rows: data || [], me: this.user ? this.user.id : null };
    } catch (e) { return { error: String(e) }; }
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

  email() { return this.user ? this.user.email : null; },
  loggedIn() { return this.enabled && !!this.user; },
};

window.Cloud = Cloud;   // ผูกกับ window เพื่อให้ game.js เข้าถึงได้ (window.Cloud)
Cloud.init();
