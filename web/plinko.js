"use strict";
// ============================================================
//  «Плинко» — шарик падает по штырькам в лунку с множителем. Путь шарика решает сервер, клиент только рисует.
//  1, 5 или 10 шариков за раз; три риска. Рисуем canvas только пока что-то движется (батарея).
// ============================================================
const PK_RISK = [["low", "Низкий", "#35d07f"], ["mid", "Средний", "#ffc53d"], ["high", "Высокий", "#ff4d5e"]];
// цвет лунки по множителю: холодный центр → горячие края
const pkCol = m => m >= 50 ? ["#ff3d6e", "#a3103a"] : m >= 10 ? ["#ff5a3d", "#b3210f"] : m >= 3 ? ["#ff9a2e", "#c25a06"] : m >= 1.5 ? ["#ffd23f", "#c98a00"]
  : m >= 1 ? ["#4cf0a0", "#12935a"] : m >= .5 ? ["#5aa8ff", "#2259c9"] : ["#8a7bff", "#4a35c9"];
const pkFmt = m => (m >= 100 ? Math.round(m) : m >= 10 ? m.toFixed(1).replace(/\.0$/, "") : String(m)).replace(".", ",");
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
    <div class="ar-stage pk-stage" id="pk-stage"><canvas id="pk-cv"></canvas><div class="pk-pops" id="pk-pops"></div></div>
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
// геометрия доски
function pkGeom(cv) {
  const W = cv.clientWidth, Hh = cv.clientHeight, rows = PKS.d.rows, sp = W / (rows + 2.4), top = 30, slotH = 34, rowH = (Hh - top - slotH - 24) / rows;
  return { W, Hh, rows, sp, top, rowH, cx: W / 2, slotY: top + rows * rowH + 8, slotH };
}
// путь шарика: для шага j — смещение по горизонтали (в долях шага штырьков)
const pkOff = (path, j) => { let s = 0; for (let i = 0; i < j; i++) s += path[i] ? .5 : -.5; return s; };
function pkKick() { if (!PKS.raf) PKS.raf = requestAnimationFrame(pkDraw); }
function pkDraw(now) {
  PKS.raf = 0;
  const cv = $("#pk-cv"); if (!cv || !PKS.d) return;
  const d = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(cv.clientWidth * d) || cv.height !== Math.round(cv.clientHeight * d)) { cv.width = Math.round(cv.clientWidth * d); cv.height = Math.round(cv.clientHeight * d); }
  const c = cv.getContext("2d"); c.setTransform(d, 0, 0, d, 0, 0);
  const g = pkGeom(cv); c.clearRect(0, 0, g.W, g.Hh);
  // штырьки: мягкий свет, вспышка при ударе
  for (let r = 0; r < g.rows; r++) for (let i = 0; i <= r + 2; i++) {
    const x = g.cx + (i - (r + 2) / 2) * g.sp, y = g.top + r * g.rowH, f = PKS.flash[r + ":" + i], k = f ? Math.max(0, 1 - (now - f) / 380) : 0;
    if (k > 0) { c.beginPath(); c.arc(x, y, 4 + k * 9, 0, 6.283); c.fillStyle = `rgba(255,214,110,${.35 * k})`; c.fill(); }
    c.beginPath(); c.arc(x, y, 3.2 + k * 1.2, 0, 6.283);
    const pg = c.createRadialGradient(x - 1, y - 1, .5, x, y, 4); pg.addColorStop(0, "#fff"); pg.addColorStop(1, k > 0 ? "#ffd76a" : "rgba(200,205,255,.75)");
    c.fillStyle = pg; c.fill();
  }
  // лунки: градиент по множителю, при попадании — проседают и светятся
  const tab = PKS.d.tables[PKS.risk], bw = g.sp - 3;
  tab.forEach((m, k) => {
    const x = g.cx + (k - g.rows / 2) * g.sp, h = PKS.hits[k], hk = h ? Math.max(0, 1 - (now - h) / 450) : 0, y = g.slotY + Math.sin(hk * Math.PI) * 6;
    const [c1, c2] = pkCol(m), gr = c.createLinearGradient(0, y, 0, y + g.slotH);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    if (hk > 0) { c.shadowColor = c1; c.shadowBlur = 18 * hk; }
    c.fillStyle = gr; c.beginPath(); c.roundRect ? c.roundRect(x - bw / 2, y, bw, g.slotH, 7) : c.rect(x - bw / 2, y, bw, g.slotH); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = "rgba(255,255,255,.28)"; c.beginPath(); c.roundRect ? c.roundRect(x - bw / 2 + 2, y + 2, bw - 4, 5, 3) : c.rect(x - bw / 2 + 2, y + 2, bw - 4, 5); c.fill();
    c.fillStyle = m >= 1 && m < 50 ? "#1a1203" : "#fff";
    c.font = `900 ${bw < 22 ? 8.5 : bw < 26 ? 9.5 : 11}px -apple-system,Roboto,"Segoe UI",sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(pkFmt(m), x, y + g.slotH / 2 + 2);
  });
  // шарики: дуга от штырька к штырьку, шлейф и свечение
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
      if (i !== b.last) {   // удар о штырёк этого ряда
        b.last = i;
        const pegI = Math.round(pkOff(b.path, i) + (i + 2) / 2);
        PKS.flash[i + ":" + pegI] = now; if (i % 2 === 0) SND.tick();
      }
    } else {   // последний отрезок — в лунку
      const xs = g.cx + pkOff(b.path, steps) * g.sp;
      x = xs; y = g.top - g.rowH * .55 + steps * g.rowH + fr * (g.slotY - (g.top - g.rowH * .55 + steps * g.rowH) + 8);
      if (fr > .85) { b.done = true; pkLanded(b, now, xs, g.slotY); }
    }
    b.trail.push([x, y]); if (b.trail.length > 7) b.trail.shift();
    b.trail.forEach(([tx, ty], j) => { c.beginPath(); c.arc(tx, ty, 2 + j * .55, 0, 6.283); c.fillStyle = `rgba(255,190,70,${(j + 1) / b.trail.length * .22})`; c.fill(); });
    const bg = c.createRadialGradient(x - 2.2, y - 2.2, .8, x, y, 7.5);
    bg.addColorStop(0, "#fffbe6"); bg.addColorStop(.45, "#ffcf4a"); bg.addColorStop(1, "#c26a00");
    c.shadowColor = "#ffb340"; c.shadowBlur = 14; c.beginPath(); c.arc(x, y, 6.8, 0, 6.283); c.fillStyle = bg; c.fill(); c.shadowBlur = 0;
  }
  PKS.balls = PKS.balls.filter(b => !b.done);
  const flashing = Object.values(PKS.flash).some(t => now - t < 400) || Object.values(PKS.hits).some(t => now - t < 460);
  if (moving || flashing) PKS.raf = requestAnimationFrame(pkDraw);
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
    PKS.risk = el.dataset.v; H.sel();
    el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === el));
    pkKick();
  },
  "pk-drop": el => pkDrop(+el.dataset.n || 1),
});
addEventListener("resize", () => { if ($("#pk-cv")) pkKick(); });
