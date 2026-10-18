"use strict";
// ============================================================
//  «Плинко» — шарик падает по штырькам в лунку с множителем. Путь шарика решает сервер, клиент только рисует.
//  1, 5 или 10 шариков за раз; три риска. Рисуем canvas только пока что-то движется (батарея).
// ============================================================
const PK_RISK = [["low", "Низкий", "#35d07f"], ["mid", "Средний", "#ffc53d"], ["high", "Высокий", "#ff4d5e"]];
// цвет лунки по множителю: холодный центр → горячие края
const pkCol = m => m >= 50 ? ["#ff3d6e", "#a3103a"] : m >= 10 ? ["#ff5a3d", "#b3210f"] : m >= 3 ? ["#ff9a2e", "#c25a06"] : m >= 1.5 ? ["#ffd23f", "#c98a00"]
  : m >= 1 ? ["#4cf0a0", "#12935a"] : m >= .5 ? ["#5aa8ff", "#2259c9"] : ["#8a7bff", "#4a35c9"];
const pkFmt = m => String(m >= 100 ? Math.round(m) : m >= 10 ? m.toFixed(1).replace(/\.0$/, "") : String(m)).replace(".", ",");
GAMES.push({ id: "plinko", t: "Плинко", s: "Шарик падает по штырькам — лови иксы по краям", imgUrl: "", k: ["#7b5cff", "#130b33"], chips: ["до x150", "10 шариков"] });
GAMES[GAMES.length - 1].imgUrl = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>
  <radialGradient id="b" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fffbe6"/><stop offset=".5" stop-color="#ffc53d"/><stop offset="1" stop-color="#c26a00"/></radialGradient>
  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a66"/><stop offset="1" stop-color="#120a33"/></linearGradient></defs>
  <rect x="4" y="4" width="112" height="112" rx="26" fill="url(#g)"/>
  ${[0, 1, 2, 3, 4].map(r => Array.from({ length: r + 2 }, (_, i) => `<circle cx="${60 + (i - (r + 1) / 2) * 16}" cy="${24 + r * 14}" r="2.6" fill="#fff" opacity=".85"/>`).join("")).join("")}
  ${["#8a7bff", "#5aa8ff", "#4cf0a0", "#ffd23f", "#ff9a2e", "#ff3d6e"].map((c, i) => `<rect x="${11 + i * 16.5}" y="96" width="14" height="12" rx="3.5" fill="${["#ff3d6e", "#ff9a2e", "#4cf0a0", "#4cf0a0", "#ff9a2e", "#ff3d6e"][i]}"/>`).join("")}
  <circle cx="68" cy="52" r="7" fill="url(#b)"/></svg>`);
WIDE_GAMES.add("plinko");
GAME_OPEN.plinko = () => openPlinko();
AR_NEW.push("plinko");
GAME_NAMES.plinko = ["target", "Плинко"];

const PKS = { risk: "mid", d: null, balls: [], fx: [], flash: {}, hits: {}, raf: 0, busy: 0, lastT: 0 };
async function openPlinko() {
  const el = openSheet(`<div class="ghead"><img src="${GAMES.find(g => g.id === "plinko").imgUrl}" alt=""><div><h2>Плинко</h2><span>Шарик падает по штырькам — лови иксы по краям</span></div></div>
    <div class="pk-hist" id="pk-hist"><span class="pk-h0">Здесь будут твои броски</span></div>
    <div class="ar-stage pk-stage" id="pk-stage"><canvas id="pk-cv"></canvas><div class="pk-pops" id="pk-pops"></div>
      <div class="pk-board" id="pk-board"><span>Последний</span><b>—</b></div></div>
    <div class="betp">
      <div class="seg ar-seg" id="pk-risk">${PK_RISK.map(([k, t, c]) => `<button data-act="pk-risk" data-v="${k}" style="--c:${c}" class="${PKS.risk === k ? "on" : ""}"><i></i>${t}</button>`).join("")}</div>
      ${betHTML("pk-amt")}
      <div class="pk-drops"><button class="btn cta gold" data-act="pk-drop" data-n="1">${ic("target")}Бросить</button>
        <button class="btn cta pk-many" data-act="pk-drop" data-n="5">×5</button><button class="btn cta pk-many" data-act="pk-drop" data-n="10">×10</button></div>
    </div>`, "pk-s");
  el._onClose = () => { cancelAnimationFrame(PKS.raf); PKS.raf = 0; PKS.balls = []; PKS.fx = []; };
  PKS.d = await api("plinko").catch(() => null);
  if (!PKS.d || !$("#pk-cv")) return;
  pkDraw(performance.now());
}
// геометрия доски: треугольник штырьков, воронка сверху, лунки-корзины снизу
function pkGeom(cv) {
  const W = cv.clientWidth, Hh = cv.clientHeight, rows = PKS.d.rows, sp = Math.min(34, W / (rows + 2.2)), top = 54, slotH = 40;
  const rowH = (Hh - top - slotH - 30) / rows, pr = Math.max(3, Math.min(5, sp * .15));
  return { W, Hh, rows, sp, top, rowH, pr, cx: W / 2, slotY: top + rows * rowH + 6, slotH, bw: sp - 4 };
}
const pkPeg = (g, r, i) => [g.cx + (i - (r + 2) / 2) * g.sp, g.top + r * g.rowH];
// статичный слой (фон, направляющие, штырьки, воронка) — рисуем один раз в кэш, в кадре только копируем
function pkStatic(g, d) {
  const key = [g.W, g.Hh, d].join("x");
  if (PKS.st && PKS.st.key === key) return PKS.st.cv;
  const cv = document.createElement("canvas"); cv.width = Math.round(g.W * d); cv.height = Math.round(g.Hh * d);
  const c = cv.getContext("2d"); c.setTransform(d, 0, 0, d, 0, 0);
  // свет за треугольником
  const [lx, ly] = pkPeg(g, 0, 1), [bx0] = pkPeg(g, g.rows - 1, 0), [bx1, by] = pkPeg(g, g.rows - 1, g.rows + 1);
  const glow = c.createRadialGradient(g.cx, g.top + g.rows * g.rowH * .55, 10, g.cx, g.top + g.rows * g.rowH * .55, g.W * .7);
  glow.addColorStop(0, "rgba(140,110,255,.32)"); glow.addColorStop(1, "rgba(140,110,255,0)");
  c.fillStyle = glow; c.fillRect(0, 0, g.W, g.Hh);
  // тонкая сетка-«пол»
  c.strokeStyle = "rgba(255,255,255,.035)"; c.lineWidth = 1;
  for (let x = (g.cx % 24); x < g.W; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, g.Hh); c.stroke(); }
  for (let y = 0; y < g.Hh; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(g.W, y); c.stroke(); }
  // треугольная «стеклянная» подложка доски
  c.beginPath(); c.moveTo(lx - g.sp * .9, ly - g.rowH * .7); c.lineTo(pkPeg(g, 0, 2)[0] + g.sp * .9, ly - g.rowH * .7);
  c.lineTo(bx1 + g.sp * .75, by + g.rowH * .55); c.lineTo(bx0 - g.sp * .75, by + g.rowH * .55); c.closePath();
  const pane = c.createLinearGradient(0, ly, 0, by);
  pane.addColorStop(0, "rgba(255,255,255,.06)"); pane.addColorStop(1, "rgba(255,255,255,.015)");
  c.fillStyle = pane; c.fill();
  // светящиеся направляющие по краям
  const rail = (x0, y0, x1, y1) => {
    const gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(255,215,106,.85)"); gr.addColorStop(1, "rgba(167,123,255,.65)");
    c.save(); c.shadowColor = "#a77bff"; c.shadowBlur = 10; c.strokeStyle = gr; c.lineWidth = 2.2; c.lineCap = "round";
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore();
  };
  rail(lx - g.sp * .9, ly - g.rowH * .7, bx0 - g.sp * .75, by + g.rowH * .55);
  rail(pkPeg(g, 0, 2)[0] + g.sp * .9, ly - g.rowH * .7, bx1 + g.sp * .75, by + g.rowH * .55);
  // штырьки: тень, металлический шарик, блик
  for (let r = 0; r < g.rows; r++) for (let i = 0; i <= r + 2; i++) {
    const [x, y] = pkPeg(g, r, i);
    c.beginPath(); c.ellipse(x + 1, y + g.pr * .9, g.pr * 1.05, g.pr * .5, 0, 0, 6.283); c.fillStyle = "rgba(0,0,0,.45)"; c.fill();
    const pg = c.createRadialGradient(x - g.pr * .4, y - g.pr * .45, g.pr * .1, x, y, g.pr * 1.1);
    pg.addColorStop(0, "#ffffff"); pg.addColorStop(.45, "#d9d4ff"); pg.addColorStop(1, "#6b5fb8");
    c.beginPath(); c.arc(x, y, g.pr, 0, 6.283); c.fillStyle = pg; c.fill();
  }
  // воронка-раздатчик сверху
  const fy = 6, fw = g.sp * 1.9;
  const fg = c.createLinearGradient(g.cx - fw, 0, g.cx + fw, 0);
  fg.addColorStop(0, "#5d6275"); fg.addColorStop(.4, "#f1f3f8"); fg.addColorStop(.6, "#b3b8c8"); fg.addColorStop(1, "#4a4f60");
  c.beginPath(); c.moveTo(g.cx - fw, fy); c.lineTo(g.cx + fw, fy); c.lineTo(g.cx + g.sp * .42, fy + 22); c.lineTo(g.cx - g.sp * .42, fy + 22); c.closePath();
  c.fillStyle = fg; c.fill();
  c.fillStyle = "#ffc53d"; c.beginPath(); c.roundRect ? c.roundRect(g.cx - fw - 2, fy - 3, fw * 2 + 4, 5, 2.5) : c.rect(g.cx - fw - 2, fy - 3, fw * 2 + 4, 5); c.fill();
  c.fillStyle = "#0b0722"; c.beginPath(); c.roundRect ? c.roundRect(g.cx - g.sp * .42, fy + 20, g.sp * .84, 5, 2) : c.rect(g.cx - g.sp * .42, fy + 20, g.sp * .84, 5); c.fill();
  // «пол» под лунками — отражение
  const fl = c.createLinearGradient(0, g.slotY + g.slotH, 0, g.Hh);
  fl.addColorStop(0, "rgba(167,123,255,.18)"); fl.addColorStop(1, "rgba(167,123,255,0)");
  c.fillStyle = fl; c.fillRect(0, g.slotY + g.slotH, g.W, g.Hh);
  PKS.st = { key, cv };
  return cv;
}
// путь шарика: для шага j — смещение по горизонтали (в долях шага штырьков)
const pkOff = (path, j) => { let s = 0; for (let i = 0; i < j; i++) s += path[i] ? .5 : -.5; return s; };
function pkKick() { if (!PKS.raf) PKS.raf = requestAnimationFrame(pkDraw); }
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
function pkDraw(now) {
  PKS.raf = 0;
  const cv = $("#pk-cv"); if (!cv || !PKS.d) return;
  const d = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(cv.clientWidth * d) || cv.height !== Math.round(cv.clientHeight * d)) { cv.width = Math.round(cv.clientWidth * d); cv.height = Math.round(cv.clientHeight * d); }
  const c = cv.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0);
  const g = pkGeom(cv);
  c.clearRect(0, 0, cv.width, cv.height);
  c.drawImage(pkStatic(g, d), 0, 0);
  c.setTransform(d, 0, 0, d, 0, 0);
  // вспышки штырьков: кольцо расходится от удара
  for (const [k, t] of Object.entries(PKS.flash)) {
    const a = (now - t) / 420; if (a >= 1) { delete PKS.flash[k]; continue; }
    const [r, i] = k.split(":").map(Number), [x, y] = pkPeg(g, r, i);
    c.beginPath(); c.arc(x, y, g.pr + a * 12, 0, 6.283); c.strokeStyle = `rgba(255,215,106,${.7 * (1 - a)})`; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(x, y, g.pr + .6, 0, 6.283); c.fillStyle = `rgba(255,230,150,${1 - a})`; c.fill();
  }
  // лунки-корзины
  const tab = PKS.d.tables[PKS.risk];
  tab.forEach((m, k) => {
    const x = g.cx + (k - g.rows / 2) * g.sp - g.bw / 2, h = PKS.hits[k], hk = h ? Math.max(0, 1 - (now - h) / 520) : 0;
    const y = g.slotY + Math.sin(Math.min(1, hk * 1.4) * Math.PI) * 7, [c1, c2] = pkCol(m);
    c.save();
    c.shadowColor = c1; c.shadowBlur = 6 + 22 * hk;
    const gr = c.createLinearGradient(0, y, 0, y + g.slotH); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    rr(c, x, y, g.bw, g.slotH, 8); c.fillStyle = gr; c.fill();
    c.restore();
    rr(c, x + 2, y + 2, g.bw - 4, g.slotH * .38, 6); c.fillStyle = "rgba(255,255,255,.3)"; c.fill();   // блик
    rr(c, x, y + g.slotH - 5, g.bw, 5, 3); c.fillStyle = "rgba(0,0,0,.22)"; c.fill();                  // донышко
    if (hk > 0) { rr(c, x - 2, y - 2, g.bw + 4, g.slotH + 4, 10); c.strokeStyle = `rgba(255,255,255,${.8 * hk})`; c.lineWidth = 2; c.stroke(); }
    c.fillStyle = m >= 1 && m < 50 ? "#1a1203" : "#fff";
    c.font = `900 ${g.bw < 20 ? 8.5 : g.bw < 24 ? 10 : 11.5}px -apple-system,Roboto,"Segoe UI",sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    const t = pkFmt(m); if (g.bw < 22 && t.length > 3) { c.save(); c.translate(x + g.bw / 2, y + g.slotH / 2 + 1); c.scale(.85, 1); c.fillText(t, 0, 0); c.restore(); }
    else c.fillText(t, x + g.bw / 2, y + g.slotH / 2 + 1);
    // отражение лунки на полу
    c.globalAlpha = .14 + .3 * hk; rr(c, x, g.slotY + g.slotH + 4, g.bw, 10, 4); c.fillStyle = c1; c.fill(); c.globalAlpha = 1;
  });
  // шарики
  let moving = false;
  for (const b of PKS.balls) {
    if (b.done) continue;
    moving = true;
    if (now < b.t0) continue;
    const steps = g.rows, f = Math.min(steps + .999, (now - b.t0) / b.dur * (steps + 1)), i = Math.floor(f), fr = f - i;
    let x, y;
    if (i < steps) {
      const x0 = g.cx + pkOff(b.path, i) * g.sp, x1 = g.cx + pkOff(b.path, i + 1) * g.sp;
      const y0 = g.top - g.rowH * .55 + i * g.rowH, y1 = y0 + g.rowH;
      x = x0 + (x1 - x0) * fr; y = y0 + (y1 - y0) * fr - Math.sin(fr * Math.PI) * g.rowH * .42;
      if (i !== b.last) { b.last = i; PKS.flash[i + ":" + Math.round(pkOff(b.path, i) + (i + 2) / 2)] = now; if (i % 2 === 0) SND.tick(); }
    } else {
      const xs = g.cx + pkOff(b.path, steps) * g.sp, ys = g.top - g.rowH * .55 + steps * g.rowH;
      x = xs; y = ys + fr * (g.slotY - ys + 10);
      if (fr > .85) { b.done = true; pkLanded(b, now, xs, g.slotY); }
    }
    b.trail.push([x, y]); if (b.trail.length > 8) b.trail.shift();
    b.trail.forEach(([tx, ty], j) => { c.beginPath(); c.arc(tx, ty, 1.8 + j * .6, 0, 6.283); c.fillStyle = `rgba(255,190,70,${(j + 1) / b.trail.length * .25})`; c.fill(); });
    const R = Math.max(5.5, g.pr * 1.45), bg = c.createRadialGradient(x - R * .35, y - R * .4, R * .1, x, y, R * 1.1);
    bg.addColorStop(0, "#fffbe6"); bg.addColorStop(.4, "#ffd34d"); bg.addColorStop(1, "#b85e00");
    c.save(); c.shadowColor = "#ffb340"; c.shadowBlur = 16; c.beginPath(); c.arc(x, y, R, 0, 6.283); c.fillStyle = bg; c.fill(); c.restore();
    c.beginPath(); c.arc(x - R * .35, y - R * .4, R * .28, 0, 6.283); c.fillStyle = "rgba(255,255,255,.85)"; c.fill();
  }
  PKS.balls = PKS.balls.filter(b => !b.done);
  const busy = moving || Object.keys(PKS.flash).length || Object.values(PKS.hits).some(t => now - t < 540);
  if (busy) PKS.raf = requestAnimationFrame(pkDraw);
}
function pkLanded(b, now, x, y) {
  PKS.hits[b.slot] = now;
  const win = b.mult > 1, big = b.mult >= 10;
  if (big) H.ok(); else if (win) H.imp("light"); else H.sel();
  if (win) SND.coins(Math.min(8, 2 + Math.round(b.mult / 3)));
  setStars(ME.stars + b.pay);
  // всплывающий икс над лункой
  const pops = $("#pk-pops");
  if (pops) {
    const p = document.createElement("i"); p.className = "pk-pop" + (win ? " w" : "") + (big ? " big" : "");
    p.style.cssText = `left:${x}px;top:${y - 6}px;--c:${pkCol(b.mult)[0]}`; p.textContent = "x" + pkFmt(b.mult);
    pops.appendChild(p); setTimeout(() => p.remove(), 1100);
  }
  const bd = $("#pk-board");
  if (bd) { bd.className = "pk-board" + (win ? " w" : " l") + (big ? " big" : ""); bd.style.setProperty("--c", pkCol(b.mult)[0]);
    bd.innerHTML = `<span>x${pkFmt(b.mult)}</span><b>${win ? "+" : ""}⭐ ${short(b.pay)}</b>`; starify(bd); arBump(bd.querySelector("b")); }
  const h = $("#pk-hist");
  if (h) {
    const z = h.querySelector(".pk-h0"); if (z) z.remove();
    h.insertAdjacentHTML("afterbegin", `<span style="--c:${pkCol(b.mult)[0]}">x${pkFmt(b.mult)}</span>`);
    while (h.children.length > 14) h.lastElementChild.remove();
  }
  if (big) coinShower($("#pk-stage"), Math.min(60, 12 + b.mult / 2));
  if (b.final) { setStars(b.final.stars); if (b.final.levelup) afterLevelUp(b.final.levelup); if (b.final.big) bigWin(b.final.big.pay, b.final.big.mult); }
}
async function pkDrop(n) {
  if (!PKS.d) return;
  const bet = betVal("pk-amt"), now0 = Date.now();
  if (now0 - PKS.lastT < 300) return;   // сервер принимает не чаще 4 раз в секунду
  if (bet * n > ME.stars) return toast("Не хватает звёзд ⭐");
  if (PKS.balls.length + n > 40) return toast("Подожди, пока упадут шарики");
  PKS.lastT = now0;
  setStars(ME.stars - bet * n); H.imp(n > 1 ? "medium" : "light");
  let r;
  try { r = await post("plinko", { bet, risk: PKS.risk, n }); } catch (e) { loadMe(); return; }
  if (!$("#pk-cv")) { setStars(r.stars); return; }
  const now = performance.now(), top = r.balls.reduce((a, x) => x.mult > a.mult ? x : a, r.balls[0]);
  r.balls.forEach((x, i) => PKS.balls.push({ ...x, t0: now + i * 160, dur: 1900, last: -1, trail: [],
    final: i === r.balls.length - 1 ? { stars: r.stars, levelup: r.levelup, big: top.mult >= 25 ? { pay: top.pay, mult: top.mult } : null } : null }));
  pkKick();
}
Object.assign(ACT, {
  "pk-risk": el => {
    if (PKS.balls.length) return toast("Дождись, пока упадут шарики");
    PKS.risk = el.dataset.v; H.sel(); PKS.st = null;
    el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === el));
    pkKick();
  },
  "pk-drop": el => pkDrop(+el.dataset.n || 1),
});
addEventListener("resize", () => { if ($("#pk-cv")) pkKick(); });
