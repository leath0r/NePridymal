"use strict";
// ============================================================
//  Звуки без файлов: синтез через WebAudio. Привязаны к вибро-откликам H.* (тик, клик, выигрыш, проигрыш),
//  плюс монеты и фанфары большого выигрыша. Выключаются в Настройках (PREF.noSound).
// ============================================================
const SND = (() => {
  let ctx = null, master = null, lastTick = 0;
  const on = () => !(typeof PREF !== "undefined" && PREF.noSound);
  function init() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }
  // браузеры разрешают звук только после касания — будим контекст на первом тапе
  addEventListener("pointerdown", () => { const c = init(); if (c && c.state === "suspended") c.resume(); }, { passive: true });
  function tone(freq, dur, { type = "sine", gain = .08, at = 0, slide = 0, attack = .004 } = {}) {
    if (!on() || !init() || ctx.state !== "running") return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  return {
    tick() { const n = performance.now(); if (n - lastTick < 40) return; lastTick = n; tone(1900, .03, { type: "triangle", gain: .035 }); },
    click(s) { const f = { light: 1100, medium: 700, heavy: 180, rigid: 900, soft: 600 }[s] || 800; tone(f, s === "heavy" ? .14 : .05, { type: s === "heavy" ? "sine" : "triangle", gain: s === "heavy" ? .16 : .05, slide: s === "heavy" ? .5 : 1 }); },
    win() { [1047, 1319, 1568].forEach((f, i) => tone(f, .22, { type: "triangle", gain: .07, at: i * .07 })); tone(2093, .35, { gain: .04, at: .21 }); },
    lose() { tone(330, .28, { type: "sawtooth", gain: .035, slide: .45 }); tone(220, .3, { type: "sine", gain: .06, at: .05, slide: .5 }); },
    coins(n = 6) { for (let i = 0; i < Math.min(n, 14); i++) { const at = i * (.045 + Math.random() * .04); tone(2400 + Math.random() * 900, .09, { gain: .03, at }); tone(3600 + Math.random() * 600, .06, { gain: .015, at: at + .01 }); } },
    fanfare() { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, .5, { type: "triangle", gain: .06, at: i * .085 })); [1047, 1319, 1568].forEach(f => tone(f, 1.2, { gain: .035, at: .62 })); },
    near() { tone(880, .12, { type: "square", gain: .03 }); tone(830, .25, { type: "square", gain: .03, at: .12, slide: .9 }); },
    whoosh() { tone(400, .35, { type: "sawtooth", gain: .02, slide: 3 }); },
  };
})();
// вибро-отклики → звуки
{
  const imp = H.imp, sel = H.sel, ok = H.ok, err = H.err;
  H.imp = s => { imp(s); SND.click(s); };
  H.sel = () => { sel(); SND.tick(); };
  H.ok = () => { ok(); SND.win(); };
  H.err = () => { err(); SND.lose(); };
}
// монеты и большой выигрыш
{
  const cs = coinShower, bw = bigWin;
  coinShower = (el, n = 40) => { SND.coins(Math.round(n / 5)); return cs(el, n); };
  bigWin = (pay, x, tierX) => { if (x >= 5 || (tierX || 0) >= 5) SND.fanfare(); return bw(pay, x, tierX); };
}
// волна от касания на кнопках
document.addEventListener("pointerdown", e => {
  const b = e.target.closest(".btn,.quick button,.seg button,.mk2-tabs button,.shop-row,.al-t .btn"); if (!b || b.disabled || window.LITE) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2, w = document.createElement("i");
  w.className = "ripple"; w.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  if (getComputedStyle(b).position === "static") b.style.position = "relative";
  b.style.overflow = "hidden"; b.appendChild(w); setTimeout(() => w.remove(), 600);
}, { passive: true });
