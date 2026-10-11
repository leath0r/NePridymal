"use strict";
// ============================================================
//  Скретч-карты: стираешь фольгу пальцем, три одинаковых подарка — выигрыш. Исход решён сервером при покупке.
// ============================================================
GAMES.push({ id: "scratch", t: "Скретч-карты", s: "Сотри фольгу — три одинаковых подарка дают приз до x100", img: "Swiss Watch", k: ["#2fd6a0", "#062e2a"], chips: ["моментально", "до x100"] });
WIDE_GAMES.add("scratch");
GAME_OPEN.scratch = () => openScratch();
GAME_SECTIONS[0][2].push("scratch");
GAME_NAMES.scratch = ["grid", "Скретч-карты"];

const SC_TIERS = [["bronze", "Бронза", "#d69a5a", "#5a3410"], ["gold", "Золото", "#ffc53d", "#5a3a00"], ["diamond", "Бриллиант", "#7cd8ff", "#0b3a5c"]];
let SCI = null, scTier = "bronze", SCR = null;
async function openScratch() {
  const el = openSheet(`<div class="ghead"><img src="${A.orig("Swiss Watch", 128)}" alt=""><div><h2>Скретч-карты</h2><span>Сотри фольгу пальцем — три одинаковых подарка = приз</span></div></div>
    <div class="sc-tiers" id="sc-tiers"></div>
    <div class="sc-ticket" id="sc-t"></div>
    <div class="wres" id="sc-res">Выбери карту и купи</div>
    <div class="btns" id="sc-btns"></div>
    <div class="sec-t">${ic("award")}Призы</div><div class="sc-pay" id="sc-pay"></div>`, "sc-s");
  SCI = SCI || await api("scratch");
  if (!el.isConnected) return;
  scPaintTiers(); scBlank(); scButtons();
  $("#sc-pay").innerHTML = SCI.prizes.slice().reverse().map(p => `<div><span class="sc-pi">${[0, 1, 2].map(() => `<img src="${A.orig(p.sym, 64)}" alt="">`).join("")}</span><b>x${p.mult}</b></div>`).join("");
}
function scPaintTiers() {
  $("#sc-tiers").innerHTML = SC_TIERS.map(([k, t, c1, c2]) => `<button data-act="sc-tier" data-v="${k}" class="${scTier === k ? "on" : ""}" style="--t1:${c1};--t2:${c2}" ${SCR && !SCR.done ? "disabled" : ""}>
    <b>${t}</b><span>⭐ ${short(SCI.tiers[k])}</span></button>`).join("");
  starify($("#sc-tiers"));
}
const scTierCol = () => SC_TIERS.find(t => t[0] === scTier);
function scBlank() {   // пустой билет-витрина до покупки
  const [, name, c1, c2] = scTierCol();
  $("#sc-t").style.setProperty("--t1", c1); $("#sc-t").style.setProperty("--t2", c2);
  $("#sc-t").innerHTML = `<div class="sc-top"><b>${name.toUpperCase()}</b><span>три одинаковых — выигрыш</span></div>
    <div class="sc-grid">${Array.from({ length: 9 }, () => `<div class="sc-cell q">?</div>`).join("")}</div>`;
}
function scButtons() {
  const b = $("#sc-btns"); if (!b) return;
  if (SCR && !SCR.done) b.innerHTML = `<button class="btn ghost" data-act="sc-all">${ic("sparkles")}Открыть всё</button>`;
  else b.innerHTML = `<button class="btn cta gold" data-act="sc-buy">${SCR ? "Ещё карта" : "Купить карту"} · ⭐ ${fmt(SCI.tiers[scTier])}</button>`;
  starify(b);
}
async function scBuy() {
  const price = SCI.tiers[scTier];
  if (price > ME.stars) return toast("Не хватает звёзд ⭐");
  const r = await post("scratch", { tier: scTier });
  setStars(ME.stars - price); H.imp("medium");
  SCR = { ...r, done: false };
  const [, name] = scTierCol();
  $("#sc-t").innerHTML = `<div class="sc-top"><b>${name.toUpperCase()}</b><span>три одинаковых — выигрыш</span></div>
    <div class="sc-grid covered" id="sc-g">${r.cells.map((c, i) => `<div class="sc-cell" data-i="${i}"><img src="${A.orig(c, 128)}" alt=""></div>`).join("")}</div>
    <canvas class="sc-foil" id="sc-c"></canvas>`;
  $("#sc-res").className = "wres"; $("#sc-res").textContent = "Стирай фольгу пальцем";
  scPaintTiers(); scButtons();
  await Promise.race([Promise.all([...$("#sc-g").querySelectorAll("img")].map(i => i.decode().catch(() => {}))), sleep(1200)]);
  scFoil();
  const g = $("#sc-g"); if (g) requestAnimationFrame(() => g.classList.remove("covered"));   // подарки показываем только под готовой фольгой
  afterLevelUp(r.levelup);
}
// фольга: металлический градиент + узор, стирается destination-out
function scFoil() {
  const cv = $("#sc-c"), grid = $("#sc-g"); if (!cv || !grid) return;
  const d = Math.min(devicePixelRatio || 1, 2), W = grid.offsetWidth, Hh = grid.offsetHeight;
  cv.style.left = grid.offsetLeft + "px"; cv.style.top = grid.offsetTop + "px"; cv.style.width = W + "px"; cv.style.height = Hh + "px";
  cv.width = W * d; cv.height = Hh * d;
  const g = cv.getContext("2d"); g.scale(d, d);
  const [, , c1, c2] = scTierCol();
  const gr = g.createLinearGradient(0, 0, W, Hh);
  gr.addColorStop(0, "#e9ecf2"); gr.addColorStop(.25, c1); gr.addColorStop(.5, "#f8f9fc"); gr.addColorStop(.75, c1); gr.addColorStop(1, "#c9ced8");
  g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  g.globalAlpha = .18; g.fillStyle = c2;
  for (let y = 10; y < Hh; y += 26) for (let x = (y / 26 % 2) * 22; x < W; x += 44) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  g.globalAlpha = .55; g.fillStyle = c2; g.font = "900 15px -apple-system,Roboto,sans-serif"; g.textAlign = "center";
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.fillText("СОТРИ", W / 6 + x * W / 3, Hh / 6 + y * Hh / 3 + 5);
  g.globalAlpha = 1; g.globalCompositeOperation = "destination-out";
  let down = false, last = null, lastH = 0, lastCheck = 0;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const rub = (x, y) => {
    g.lineWidth = 34; g.lineCap = "round";
    g.beginPath(); g.moveTo(...(last || [x, y])); g.lineTo(x, y); g.stroke();
    last = [x, y];
    const t = performance.now();
    if (t - lastH > 70) { H.sel(); lastH = t; scSpark(cv, x, y); }
    if (t - lastCheck > 250) { lastCheck = t; if (scCleared(cv) > .55) scReveal(); }
  };
  cv.onpointerdown = e => { if (SCR.done) return; down = true; last = null; cv.setPointerCapture(e.pointerId); rub(...pos(e)); };
  cv.onpointermove = e => { if (down && !SCR.done) rub(...pos(e)); };
  cv.onpointerup = cv.onpointercancel = () => { down = false; last = null; };
}
function scCleared(cv) {   // доля стёртого — по редкой сетке пикселей
  const g = cv.getContext("2d"), { width: W, height: Hh } = cv, data = g.getImageData(0, 0, W, Hh).data;
  let clear = 0, n = 0;
  for (let y = 4; y < Hh; y += 16) for (let x = 4; x < W; x += 16) { n++; if (data[(y * W + x) * 4 + 3] < 40) clear++; }
  return clear / n;
}
function scSpark(cv, x, y) {
  const r = cv.getBoundingClientRect(), s = document.createElement("i");
  s.className = "sc-spark"; s.style.left = r.left + x + "px"; s.style.top = r.top + y + "px";
  s.style.setProperty("--dx", (Math.random() - .5) * 50 + "px"); s.style.setProperty("--dy", -20 - Math.random() * 30 + "px");
  document.body.appendChild(s); setTimeout(() => s.remove(), 600);
}
async function scReveal() {
  if (!SCR || SCR.done) return;
  SCR.done = true;
  const cv = $("#sc-c"); if (cv) cv.classList.add("gone");
  const r = SCR, res = $("#sc-res");
  await sleep(450);
  if (r.mult) {
    r.win.forEach((i, k) => { const c = document.querySelector(`#sc-g .sc-cell[data-i="${i}"]`); if (c) { c.classList.add("win"); c.style.animationDelay = k * 90 + "ms"; } });
    document.querySelectorAll("#sc-g .sc-cell:not(.win)").forEach(c => c.classList.add("dim"));
    res.className = "wres win"; res.textContent = `x${r.mult} · +⭐ ${fmt(r.pay)}`;
    setStars(r.stars); H.ok(); coinShower($("#sc-g"), Math.min(70, 12 + r.mult * 3));
    if (r.mult >= 5) await bigWin(r.pay, r.mult);
  } else {
    document.querySelectorAll("#sc-g .sc-cell").forEach(c => c.classList.add("dim"));
    res.className = "wres lose"; res.textContent = "Без совпадений — повезёт в следующий раз"; H.err(); setStars(r.stars);
  }
  scPaintTiers(); scButtons();
}
Object.assign(ACT, {
  "sc-tier": el => { if (SCR && !SCR.done) return; scTier = el.dataset.v; H.sel(); scPaintTiers(); SCR = null; scBlank(); scButtons(); $("#sc-res").className = "wres"; $("#sc-res").textContent = "Выбери карту и купи"; },
  "sc-buy": () => scBuy(),
  "sc-all": () => scReveal(),
});
