/* ================================================================
   fish-minigame.js — มินิเกมตกปลาแบบจับจังหวะ (UI ล้วน)
   แยกออกมาแบบ self-contained: ไม่รู้จัก state/เกม เลย
   รับ callback onResolve(quality) กลับไปให้ game.js คิดผลรางวัลเอง
   quality ∈ 'perfect' | 'good' | 'ok' | 'miss' | 'early'
   (ตัวอย่างการแยกระบบเป็นโมดูล + dependency injection ผ่าน callback)
   ================================================================ */

const BITE_MIN = 1000, BITE_MAX = 3000;   // ปลากินเบ็ดหลังสุ่ม 1–3 วิ
const REACT_WINDOW = 1500;                 // หน้าต่างกดหลังปลากินเบ็ด
const SAFETY_MS = 12000;                   // กันค้างถ้าไม่มีอินพุต

// เริ่มมินิเกม 1 รอบ · เมื่อจบเรียก onResolve(quality) ครั้งเดียว
export function startFishMinigame(onResolve) {
  const timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };

  const ov = document.createElement('div');
  ov.className = 'fish-mini';
  ov.innerHTML = `<div class="fm-card">
      <div class="fm-water">🎣</div>
      <div class="fm-msg" id="fmMsg">เหวี่ยงเบ็ดลงน้ำ... รอปลากินเบ็ด</div>
      <button class="fm-tap" id="fmTap" hidden>❗ กด!</button>
      <div class="fm-hint" id="fmHint">อย่าเพิ่งกด — รอจนขึ้น "กด!"</div>
    </div>`;
  document.body.appendChild(ov);
  const msg = ov.querySelector('#fmMsg'), tap = ov.querySelector('#fmTap'), hint = ov.querySelector('#fmHint');

  let biteAt = 0, done = false;
  const finish = q => {
    if (done) return;
    done = true;
    clearTimers();
    ov.remove();
    if (typeof onResolve === 'function') onResolve(q);
  };
  const onEarly = e => { if (biteAt || done) return; e.preventDefault(); finish('early'); };
  ov.addEventListener('pointerdown', onEarly);

  const biteDelay = BITE_MIN + Math.floor(Math.random() * (BITE_MAX - BITE_MIN));
  timers.push(setTimeout(() => {
    biteAt = performance.now();
    ov.removeEventListener('pointerdown', onEarly);
    ov.classList.add('bite');
    msg.textContent = 'ปลากินเบ็ดแล้ว! กดเร็ว!';
    hint.textContent = '';
    tap.hidden = false;
    tap.onclick = () => { const rt = performance.now() - biteAt; finish(rt < 350 ? 'perfect' : rt < 750 ? 'good' : 'ok'); };
    timers.push(setTimeout(() => finish('miss'), REACT_WINDOW));
  }, biteDelay));
  timers.push(setTimeout(() => finish('miss'), SAFETY_MS));   // กันค้าง
}
