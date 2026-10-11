"use strict";
// ============================================================
//  Ещё игры: плинко, башня, кубик, лимбо, слоты
// ============================================================
GAMES.splice(2, 0,
  { id: "tower", t: "Башня", s: "Лезь вверх и не наступи на бомбу", img: "Artisan Brick", k: ["#ff9a3d", "#4a1d02"], chips: ["8 этажей"] });
GAMES.splice(6, 0,
  { id: "slots", t: "Слоты", s: "Три барабана с подарками — джекпот на трёх Plush Pepe", img: "Money Pot", k: ["#ffcf3d", "#4a2c00"], chips: ["джекпот x505"] });
GAMES.push(
  { id: "dice", t: "Кубик", s: "Больше или меньше — сам выбираешь шанс", img: "Evil Eye", k: ["#8a5cff", "#1f0b4a"], chips: ["x1.01–x48"] },
  { id: "limbo", t: "Лимбо", s: "Загадай икс — выпадет больше, и ты в плюсе", img: "Astral Shard", k: ["#4ad0ff", "#0b2550"], chips: ["до x1000"] });
const WIDE_GAMES = new Set(["crash", "duels", "slots"]);
const GAME_OPEN = { plinko: () => openPlinko(), tower: () => openTower(), slots: () => openSlots(), dice: () => openDice(), limbo: () => openLimbo() };

// ============================================================ ПЛИНКО
const PL = { risk: "mid", tables: null, rows: 12, balls: [], raf: 0, hits: {} };
async function openPlinko() {
  const el = openSheet(`${gameHead("Snow Globe", "Плинко", "Шарик падает по штырькам — лови иксы по краям")}
    <div class="plinko"><canvas id="pl-cv"></canvas></div>
    <div class="plast" id="pl-last"></div>
    <div class="betp">
      <div class="seg" id="pl-risk">${[["low", "Низкий"], ["mid", "Средний"], ["high", "Высокий"]].map(([k, t]) => `<button data-act="pl-risk" data-v="${k}" class="${PL.risk === k ? "on" : ""}">${t} риск</button>`).join("")}</div>
      ${betHTML("pl-amt")}
      <div class="pl-drops"><button class="btn cta" data-act="pl-drop" data-n="1">${ic("plus")}Бросить</button><button class="btn cta gold" data-act="pl-drop" data-n="5">×5</button><button class="btn cta gold" data-act="pl-drop" data-n="10">×10</button></div>
    </div>`, "plinko-s");
  el._onClose = () => cancelAnimationFrame(PL.raf);
  if (!PL.tables) { const d = await api("plinko"); PL.tables = d.tables; PL.rows = d.rows; }
  PL.balls = []; PL.hits = {};
  cancelAnimationFrame(PL.raf); PL.raf = requestAnimationFrame(plFrame);
}
const plColor = m => m >= 10 ? "#ff3d6e" : m >= 3 ? "#ff8a3d" : m >= 1.5 ? "#ffc53d" : m >= 1 ? "#4cf0a0" : "#4b5a78";
function plGeom(cv) {
  const W = cv.clientWidth, H = cv.clientHeight, rows = PL.rows, sp = W / (rows + 2.2), top = 26, rowH = (H - top - 46) / rows;
  return { W, H, rows, sp, top, rowH, cx: W / 2 };
}
function plFrame(now) {
  PL.raf = requestAnimationFrame(plFrame);
  const cv = $("#pl-cv"); if (!cv || !PL.tables) return;
  const d = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(cv.clientWidth * d)) { cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; }
  const c = cv.getContext("2d"); c.setTransform(d, 0, 0, d, 0, 0);
  const g = plGeom(cv); c.clearRect(0, 0, g.W, g.H);
  // штырьки
  for (let r = 0; r < g.rows; r++) for (let i = 0; i <= r + 2; i++) {
    const x = g.cx + (i - (r + 2) / 2) * g.sp, y = g.top + r * g.rowH;
    c.beginPath(); c.arc(x, y, 3, 0, 6.283); c.fillStyle = "rgba(255,255,255,.75)"; c.fill();
  }
  // лунки
  const tab = PL.tables[PL.risk], sy = g.top + g.rows * g.rowH + 6, bw = g.sp - 4;
  tab.forEach((m, k) => {
    const x = g.cx + (k - g.rows / 2) * g.sp, hit = PL.hits[k] && now - PL.hits[k] < 400;
    const y = sy + (hit ? 4 : 0);
    c.fillStyle = plColor(m); c.globalAlpha = hit ? 1 : .88;
    c.beginPath(); c.roundRect ? c.roundRect(x - bw / 2, y, bw, 26, 6) : c.rect(x - bw / 2, y, bw, 26); c.fill(); c.globalAlpha = 1;
    c.fillStyle = m >= 1 ? "#1a1203" : "#fff"; c.font = `800 ${g.sp < 26 ? 8.5 : 10}px -apple-system,Segoe UI,sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(m >= 100 ? Math.round(m) : m, x, y + 13);
  });
  // шарики
  for (const b of PL.balls) {
    if (now < b.t0) continue;   // шарик из очереди ещё не стартовал
    const k = Math.min(1, (now - b.t0) / b.dur), steps = g.rows, f = k * steps, i = Math.min(steps - 1, Math.floor(f)), fr = f - i;
    const off = j => b.path.slice(0, j).reduce((s, v) => s + (v ? .5 : -.5), 0);
    const x0 = g.cx + off(i) * g.sp, x1 = g.cx + off(i + 1) * g.sp;
    const y0 = g.top - g.rowH * .6 + i * g.rowH, y1 = y0 + g.rowH;
    const x = x0 + (x1 - x0) * fr, y = y0 + (y1 - y0) * fr - Math.sin(fr * Math.PI) * g.rowH * .35;
    if (Math.floor(f) !== b.last) { b.last = Math.floor(f); if (b.last < steps) H.sel(); }
    const gr = c.createRadialGradient(x - 2, y - 2, 1, x, y, 7); gr.addColorStop(0, "#fff7d1"); gr.addColorStop(1, "#ff9d1f");
    c.beginPath(); c.arc(x, y, 6.5, 0, 6.283); c.fillStyle = gr; c.shadowColor = "#ffb340"; c.shadowBlur = 10; c.fill(); c.shadowBlur = 0;
    if (k >= 1 && !b.done) { b.done = true; PL.hits[b.slot] = now; plLanded(b); }
  }
  PL.balls = PL.balls.filter(b => !b.done || now - b.t0 < b.dur + 50);
}
function plLanded(b) {
  const win = b.pay > b.bet;
  win ? H.ok() : H.imp("light");
  const el = $("#pl-last");
  if (el) el.insertAdjacentHTML("afterbegin", `<span style="--c:${plColor(b.mult)}">x${b.mult}</span>`);
  if (el && el.children.length > 12) el.lastElementChild.remove();
  if (b.multi) { setStars(ME.stars + b.pay); if (b.final) { setStars(b.final.stars); if (b.final.levelup) afterLevelUp(b.final.levelup); } }
  else { setStars(b.stars); if (b.levelup) afterLevelUp(b.levelup); }
  if (b.mult >= 10) coinShower($("#pl-cv"), Math.min(60, 10 + b.mult));
  if (b.mult >= 50 && !document.querySelector(".bw-ov")) bigWin(b.pay, b.mult);
}
async function plDrop(n = 1) {
  const bet = betVal("pl-amt");
  if (bet * n > ME.stars) return toast("Не хватает звёзд ⭐");
  if (PL.balls.filter(b => !b.done).length + n > 30) return;
  setStars(ME.stars - bet * n);
  try {
    const r = await post("plinko", { bet, risk: PL.risk, n });
    const now = performance.now();
    if (r.balls) r.balls.forEach((x, i) => PL.balls.push({ ...x, bet, t0: now + i * 140, dur: 2300, last: -1, multi: true, final: i === r.balls.length - 1 ? r : null }));   // очередь шариков
    else PL.balls.push({ ...r, bet, t0: now, dur: 2300, last: -1 });
    H.imp(n > 1 ? "medium" : "light");
  } catch (e) { loadMe(); }
}

// ============================================================ БАШНЯ
let TW = { active: false }, twMode = "mid", twBusy = false, TWM = null;
const TW_N = { easy: 4, mid: 3, hard: 2 };
async function openTower() {
  twBusy = false;
  openSheet(`${gameHead("Artisan Brick", "Башня", "Лезь вверх и не наступи на бомбу")}
    <div class="tower" id="tw"></div>
    <div class="mstat"><div><span>Выигрыш</span><b id="tw-win">—</b></div><div><span>Следующий</span><b id="tw-next">—</b></div></div>
    <div class="betp" id="tw-ctl">
      <div class="seg" id="tw-mode">${[["easy", "Лёгкая"], ["mid", "Средняя"], ["hard", "Сложная"]].map(([k, t]) => `<button data-act="tw-mode" data-v="${k}" class="${twMode === k ? "on" : ""}">${t}</button>`).join("")}</div>
      ${betHTML("tw-amt")}
      <button class="btn cta" id="tw-btn" data-act="tw-btn">Играть</button>
    </div>`, "tower-s");
  const d = await api("tower"); TWM = d.modes; TW = d; if (TW.active) twMode = TW.mode;
  twDraw();
}
function twDraw(boom) {
  const box = $("#tw"); if (!box || !TWM) return;
  const mode = TW.active ? TW.mode : twMode, n = TW_N[mode], picks = TW.picks || [], bombs = TW.bombs, floor = picks.length;
  let h = "";
  for (let f = 7; f >= 0; f--) {
    const cur = TW.active && f === floor, passed = f < floor;
    h += `<div class="tfl${cur ? " cur" : ""}${passed ? " done" : ""}"><span class="tm">x${TWM[mode][f]}</span><div class="tts" style="grid-template-columns:repeat(${n},1fr)">`;
    for (let t = 0; t < n; t++) {
      let cls = "tt", inner = "";
      if (passed && picks[f] === t) { cls += " gem"; inner = `<img src="${A.orig("Hanging Star", 64)}" alt="">`; }
      else if (bombs && bombs[f] === t) { cls += boom && boom[0] === f && boom[1] === t ? " boom" : " bomb"; inner = ic("bomb", "bombic"); }
      h += `<button class="${cls}" data-act="tw-step" data-f="${f}" data-t="${t}" ${cur ? "" : "disabled"}>${inner}</button>`;
    }
    h += `</div></div>`;
  }
  box.innerHTML = h;
  $("#tw-next").textContent = TW.active && floor < 8 ? "x" + TW.next.toFixed(2) : "—";
  $("#tw-win").textContent = TW.active && floor ? "⭐ " + fmt(TW.bet * TW.mult) : TW.pay ? "⭐ " + fmt(TW.pay) : "—";
  const btn = $("#tw-btn");
  if (TW.active) setBtn(btn, floor ? "green cta" : "ghost", floor ? `Забрать ⭐ ${fmt(TW.bet * TW.mult)}` : "Выбери плитку на 1 этаже", !floor);
  else setBtn(btn, "cta", "Играть", false);
  document.querySelectorAll("#tw-ctl .amt button, #tw-ctl .quick button, #tw-amt, #tw-mode button").forEach(x => x.disabled = !!TW.active);
}
async function twBtn() {
  if (TW.active) {
    const r = await post("tower/cashout"); TW = { ...TW, ...r }; H.ok(); toast(`+⭐ ${fmt(r.pay)}`, "ok"); burstAt($("#tw")); setStars(r.stars); twDraw(); winFx(null, r.pay, r.bet);
  } else {
    const bet = betVal("tw-amt");
    if (bet > ME.stars) return toast("Не хватает звёзд ⭐");
    const r = await post("tower/start", { bet, mode: twMode }); TW = r; setStars(r.stars); H.imp("medium"); twDraw(); afterLevelUp(r.levelup);
  }
}
async function twStep(t) {
  if (!TW.active || twBusy) return;
  twBusy = true;
  try {
    const r = await post("tower/step", { tile: t }); TW = r;
    if (r.boom) { H.err(); const b = $("#tw"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); toast("Бомба!"); twDraw(r.boom); loadMe(); }
    else { H.imp("light"); if (r.pay) { H.ok(); toast(`Башня пройдена! +⭐ ${fmt(r.pay)}`, "ok"); setStars(r.stars); burstAt($("#tw")); winFx(null, r.pay, r.bet); } twDraw(); }
  } finally { twBusy = false; }
}

// ============================================================ КУБИК
const DC = { target: 50, over: true, busy: false };
function openDice() {
  DC.busy = false;
  openSheet(`${gameHead("Evil Eye", "Кубик", "Больше или меньше — сам выбираешь шанс")}
    <div class="dicebig"><b id="dc-roll">50.00</b><span id="dc-res">Выбери порог и бросай</span></div>
    <div class="dbar"><div class="dzone" id="dc-zone"></div><div class="dmark" id="dc-mark" style="left:50%"></div></div>
    <input type="range" class="drange" id="dc-t" min="2" max="98" step="1" value="${DC.target}">
    <div class="seg" style="margin-top:12px">${[[true, "Больше"], [false, "Меньше"]].map(([k, t]) => `<button data-act="dc-dir" data-v="${k ? 1 : 0}" class="${DC.over === k ? "on" : ""}">${t} <span id="dc-tl${k ? 1 : 0}"></span></button>`).join("")}</div>
    <div class="dstats"><div><span>Шанс</span><b id="dc-ch"></b></div><div><span>Множитель</span><b id="dc-mu"></b></div><div><span>Выигрыш</span><b id="dc-pw"></b></div></div>
    <div class="betp">${betHTML("dc-amt")}<button class="btn cta" data-act="dc-roll">Бросить кубик</button></div>`, "dice-s");
  const r = $("#dc-t");
  r.oninput = () => { DC.target = +r.value; H.sel(); dcDraw(); };
  $("#dc-amt").addEventListener("input", dcDraw);
  dcDraw();
}
// шанс не больше 95% — иначе «выигрыш» меньше ставки; ползунок подтягиваем
function dcClamp() {
  const lim = DC.over ? [5, 98] : [2, 95], r = $("#dc-t");
  DC.target = Math.min(lim[1], Math.max(lim[0], DC.target));
  if (r && +r.value !== DC.target) r.value = DC.target;
}
function dcDraw() {
  if (!$("#dc-zone")) return;
  dcClamp();
  const t = DC.target, ch = DC.over ? 100 - t : t, mu = gEdge("x") * 100 / ch;
  $("#dc-zone").style.cssText = DC.over ? `left:${t}%;right:0` : `left:0;right:${100 - t}%`;
  $("#dc-tl1").textContent = t; $("#dc-tl0").textContent = t;
  $("#dc-ch").textContent = ch.toFixed(0) + "%";
  $("#dc-mu").textContent = "x" + mu.toFixed(2);
  $("#dc-pw").textContent = "⭐ " + fmt(betVal("dc-amt") * mu);
}
async function dcRoll() {
  if (DC.busy) return;
  const bet = betVal("dc-amt");
  if (bet > ME.stars) return toast("Не хватает звёзд ⭐");
  DC.busy = true;
  try {
    const r = await post("dice", { bet, target: DC.target, over: DC.over });
    const el = $("#dc-roll"), mark = $("#dc-mark"), t0 = performance.now();
    el.className = "";
    await new Promise(done => (function f(now) {
      const k = Math.min(1, (now - t0) / 650), v = k < 1 ? Math.random() * 100 : r.roll;
      el.textContent = v.toFixed(2); mark.style.left = v + "%";
      k < 1 && el.isConnected ? requestAnimationFrame(f) : done();
    })(t0));
    if (!el.isConnected) return;
    el.className = r.win ? "win" : "lose";
    $("#dc-res").textContent = r.win ? `Победа x${r.mult} · +⭐ ${fmt(r.pay)}` : "Мимо";
    r.win ? H.ok() : H.err();
    setStars(r.stars); afterLevelUp(r.levelup);
  } finally { DC.busy = false; }
}

// ============================================================ ЛИМБО
const LB = { busy: false };
function openLimbo() {
  LB.busy = false;
  openSheet(`${gameHead("Astral Shard", "Лимбо", "Загадай икс — выпадет больше, и ты в плюсе")}
    <div class="limbo" id="lb-box"><b id="lb-v">1.00x</b><span id="lb-s">Цель x2.00</span></div>
    <div class="betp">
      <div class="lbt"><span>Цель</span><label class="autof"><input id="lb-t" inputmode="decimal" value="2.00"><span>x</span></label>
        <div class="lbc"><span>Шанс</span><b id="lb-ch">48.50%</b></div></div>
      <div class="quick">${[1.5, 2, 5, 10, 100].map(x => `<button data-act="lb-q" data-v="${x}">x${x}</button>`).join("")}</div>
      <div style="height:8px"></div>${betHTML("lb-amt")}
      <button class="btn cta" data-act="lb-go">Играть</button>
    </div>`, "limbo-s");
  $("#lb-t").oninput = lbDraw; lbDraw();
}
const lbTarget = () => Math.max(1.01, Math.min(1000, parseFloat(($("#lb-t").value || "2").replace(",", ".")) || 2));
function lbDraw() { if (!$("#lb-ch")) return; const t = lbTarget(); $("#lb-ch").textContent = (gEdge("x") * 100 / t).toFixed(2) + "%"; $("#lb-s").textContent = "Цель x" + t.toFixed(2); }
async function lbGo() {
  if (LB.busy) return;
  const bet = betVal("lb-amt"), target = lbTarget();
  if (bet > ME.stars) return toast("Не хватает звёзд ⭐");
  LB.busy = true;
  try {
    const r = await post("limbo", { bet, target });
    const v = $("#lb-v"), box = $("#lb-box"), t0 = performance.now(), dur = Math.min(1100, 350 + Math.log(r.result) * 260);
    box.className = "limbo";
    await new Promise(done => (function f(now) {
      const k = Math.min(1, (now - t0) / dur), cur = Math.exp(Math.log(r.result) * (1 - Math.pow(1 - k, 3)));
      v.textContent = cur.toFixed(2) + "x";
      k < 1 && v.isConnected ? requestAnimationFrame(f) : done();
    })(t0));
    if (!v.isConnected) return;
    box.className = "limbo " + (r.win ? "win" : "lose");
    $("#lb-s").textContent = r.win ? `Победа · +⭐ ${fmt(r.pay)}` : `Цель x${target.toFixed(2)} — мимо`;
    r.win ? (H.ok(), burstAt(box), winFx(null, r.pay, r.pay / target)) : H.err();
    setStars(r.stars); afterLevelUp(r.levelup);
  } finally { LB.busy = false; }
}

// ============================================================ СЛОТЫ
let SL = null, slBusy = false, slN = 1, slFast = false;
const slMachine = (m, small) => `<div class="slot${small ? " sm" : ""}" id="sl-m${m}"><div class="sreels">${[0, 1, 2].map(i =>
  `<div class="sreel"><div class="sstrip" id="sl-s${m}-${i}"></div></div>`).join("")}</div><div class="sline"></div><div class="swin" id="sl-w${m}"></div></div>`;
async function openSlots() {
  slBusy = false;
  openSheet(`${gameHead("Money Pot", "Слоты", "Три барабана с подарками")}
    <div class="slots" id="sl-box"></div>
    <div class="wres" id="sl-res">Крути барабаны</div>
    <div class="betp">
      <div class="mn" style="margin:0 0 10px"><span>Автоматы</span><div class="quick" id="sl-n">${[1, 2, 3, 5].map(n => `<button data-act="sl-n" data-v="${n}" class="${slN === n ? "on" : ""}">x${n}</button>`).join("")}</div></div>
      ${betHTML("sl-amt")}<div class="dgbtns"><button class="btn cta gold" id="sl-btn" data-act="sl-spin">Крутить</button><button class="ufast${slFast ? " on" : ""}" data-act="sl-fast">${ic("trend")}Быстро</button></div></div>
    <div class="sec-t">Выплаты на один автомат</div><div class="box" id="sl-pay"></div>`, "slots-s");
  if (!SL) SL = await api("slots");
  slBuild();
  $("#sl-amt").addEventListener("input", slBtnText);
  $("#sl-pay").innerHTML = SL.syms.map((s, i) => `<div class="row kv"><img class="spi" src="${A.orig(s, 64)}" alt=""><img class="spi" src="${A.orig(s, 64)}" alt=""><img class="spi" src="${A.orig(s, 64)}" alt="">
    <span class="v" style="text-align:right">x${SL.three[i]}</span><span class="hint" style="font-size:12px;width:62px;text-align:right">два: x${SL.two[i]}</span></div>`).reverse().join("");
}
function slBuild() {
  const box = $("#sl-box"); if (!box || !SL) return;
  box.className = "slots n" + slN;
  box.innerHTML = Array.from({ length: slN }, (_, m) => slMachine(m, slN > 1)).join("");
  for (let m = 0; m < slN; m++) for (let i = 0; i < 3; i++) $(`#sl-s${m}-${i}`).innerHTML = slSym((SL.syms.length - 1 - i - m) % SL.syms.length);
  slBtnText();
}
function slBtnText() { const b = $("#sl-btn"); if (b && !slBusy) b.textContent = slN > 1 ? `Крутить x${slN} · ⭐ ${fmt(betVal("sl-amt") * slN)}` : "Крутить"; }
const slSym = i => `<div class="ssym"><img src="${A.orig(SL.syms[i], 128)}" alt=""></div>`;
async function slSpin() {
  if (slBusy || !SL) return;
  const bet = betVal("sl-amt"), n = slN;
  if (bet * n > ME.stars) return toast("Не хватает звёзд ⭐");
  slBusy = true; $("#sl-btn").disabled = true;
  document.querySelectorAll("#sl-n button").forEach(b => b.disabled = true);
  setStars(ME.stars - bet * n);
  let r;
  try { r = await post("slots", { bet, n }); } catch (e) { slBusy = false; $("#sl-btn").disabled = false; document.querySelectorAll("#sl-n button").forEach(b => b.disabled = false); loadMe(); return; }
  const res = $("#sl-res"); res.className = "wres"; res.textContent = "…";
  const H0 = $("#sl-box .sreel").clientHeight;
  document.querySelectorAll("#sl-box .swin").forEach(w => { w.className = "swin"; w.textContent = ""; });
  document.querySelectorAll("#sl-box .slot").forEach(m => { m.classList.remove("hit", "jp"); m.classList.add("spin"); });
  await Promise.all(r.spins.map((sp, m) => Promise.all(sp.reels.map((sym, i) => new Promise(done => {
    const strip = $(`#sl-s${m}-${i}`), cnt = slFast ? 7 + i * 2 : 16 + i * 6 + m * 2, d = slFast ? .4 + i * .1 + m * .04 : 1.3 + i * .4 + m * .12;
    let html = ""; for (let k = 0; k < cnt; k++) html += slSym(Math.random() * SL.syms.length | 0);
    strip.innerHTML = slSym(sym) + html;
    strip.style.transition = "none"; strip.style.transform = `translateY(${-cnt * H0}px)`;
    void strip.offsetWidth;
    strip.style.transition = `transform ${d}s cubic-bezier(.2,.8,.25,1.02)`;
    strip.style.transform = "translateY(0)";
    setTimeout(() => { if (m === 0) H.imp("medium"); done(); }, d * 1000);
  }))).then(() => {
    const box = $("#sl-m" + m); if (box) box.classList.remove("spin");
    // «почти!»: два дорогих символа из трёх — подсвечиваем пару, третий барабан вздрагивает
    const cnt = {}; sp.reels.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
    const pair = Object.keys(cnt).find(x => cnt[x] === 2 && +x >= 3);
    if (box && pair != null) {
      const odd = sp.reels.findIndex(x => x !== +pair);
      box.querySelectorAll(".sreel").forEach((r, i) => r.classList.toggle(i === odd ? "near-odd" : "near-pair", true));
      box.insertAdjacentHTML("beforeend", `<span class="snear">${+pair === SL.syms.length - 1 ? "Почти джекпот!" : "Почти!"}</span>`);
      if (typeof SND !== "undefined") SND.near();
      setTimeout(() => { box.querySelectorAll(".sreel").forEach(r => r.classList.remove("near-odd", "near-pair")); const n = box.querySelector(".snear"); if (n) n.remove(); }, 1800);
    }
    const w = $("#sl-w" + m); if (!w || !sp.mult) return;
    w.className = "swin on" + (sp.mult >= 10 ? " jp" : sp.mult < 1 ? " meh" : "");
    w.textContent = "x" + sp.mult;
    if (sp.mult > 1) { box.classList.add("hit"); coinShower(box, Math.min(70, 10 + sp.mult * 3)); }
    if (sp.mult >= 10) box.classList.add("jp");
  })));
  slBusy = false;
  if ($("#sl-btn")) { $("#sl-btn").disabled = false; document.querySelectorAll("#sl-n button").forEach(b => b.disabled = false); slBtnText(); }
  setStars(r.stars);
  const total = r.pay, spent = bet * n, best = Math.max(...r.spins.map(x => x.mult));
  if (best >= 10) { H.ok(); res.className = "wres win"; res.textContent = `ДЖЕКПОТ x${best}! Итого +⭐ ${fmt(total)}`; }
  else if (total > spent) { H.ok(); res.className = "wres win"; res.textContent = n > 1 ? `Итого ⭐ ${fmt(total)} (+${fmt(total - spent)})` : `x${best} · +⭐ ${fmt(total)}`; }
  else if (total > 0) { H.imp("medium"); res.className = "wres meh"; res.textContent = n > 1 ? `Итого ⭐ ${fmt(total)} (−${fmt(spent - total)})` : `x${best} · ⭐ ${fmt(total)}`; }
  else { H.err(); res.className = "wres lose"; res.textContent = "Пусто — ещё разок?"; }
  if (total / spent >= 5) await bigWin(total, total / spent);
  afterLevelUp(r.levelup);
}

// ============================================================ действия
const _gameAct = ACT.game;
Object.assign(ACT, {
  game: el => GAME_OPEN[el.dataset.id] ? (H.imp("light"), GAME_OPEN[el.dataset.id]()) : _gameAct(el),
  "pl-risk": el => { PL.risk = el.dataset.v; H.sel(); document.querySelectorAll("#pl-risk button").forEach(b => b.classList.toggle("on", b === el)); },
  "pl-drop": el => plDrop(+el.dataset.n || 1),
  "tw-mode": el => { if (TW.active) return; twMode = el.dataset.v; H.sel(); document.querySelectorAll("#tw-mode button").forEach(b => b.classList.toggle("on", b === el)); twDraw(); },
  "tw-btn": () => twBtn(),
  "tw-step": el => twStep(+el.dataset.t),
  "dc-dir": el => { DC.over = el.dataset.v === "1"; H.sel(); el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === el)); dcDraw(); },
  "dc-roll": () => dcRoll(),
  "lb-q": el => { $("#lb-t").value = (+el.dataset.v).toFixed(2); H.sel(); lbDraw(); },
  "lb-go": () => lbGo(),
  "sl-spin": () => slSpin(),
  "sl-fast": el => { slFast = !slFast; el.classList.toggle("on", slFast); H.sel(); },
  "sl-n": el => { if (slBusy) return; slN = +el.dataset.v; H.sel(); document.querySelectorAll("#sl-n button").forEach(b => b.classList.toggle("on", b === el)); slBuild(); },
});
