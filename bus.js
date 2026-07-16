/* ================================================================
   bus.js — event bus จิ๋ว (pub/sub) สำหรับลด coupling ระหว่างระบบ
   ระบบต่างๆ emit เหตุการณ์ (เช่น 'currency:changed') แทนการเรียก
   render*() ของ UI ตรงๆ · ชั้น UI subscribe ไว้ที่เดียวตอน init
   นำเข้าได้ทั้ง game.js และโมดูลย่อยในอนาคต (fishing.js/shop.js)
   ================================================================ */
export const bus = {
  _map: Object.create(null),
  on(evt, fn) {
    (this._map[evt] || (this._map[evt] = [])).push(fn);
    return () => this.off(evt, fn);   // คืนฟังก์ชันยกเลิก subscribe
  },
  off(evt, fn) {
    const a = this._map[evt];
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  },
  emit(evt, data) {
    const a = this._map[evt];
    if (!a) return;
    // สำเนา array กันกรณี handler ยกเลิก subscribe ระหว่างวน
    for (const fn of a.slice()) {
      try { fn(data); } catch (e) { console.error(`[bus] handler error on "${evt}"`, e); }
    }
  },
};
