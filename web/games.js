"use strict";
// ============================================================
//  Мини-игры: хаб, краш, апгрейд, мины, колесо
// ============================================================

const GAMES = [
  { id: "crash", t: "Краш", s: "Забери ставку до взрыва ракеты", img: "Stellar Rocket", k: ["#6a4dff", "#160d4a"], chips: ["до x10 000", "мультиплеер"] },
  { id: "duels", t: "Дуэли", s: "Вызови друга на монетку или кости — победитель забирает банк", img: "Light Sword", k: ["#ff5470", "#3d0716"], chips: ["1 на 1", "PvP"] },
  { id: "upgrade", t: "Апгрейд", s: "Рискни подарком ради подарка дороже", img: "Mighty Arm", k: ["#16c88d", "#05362a"], chips: ["шанс до 80%"] },
  { id: "mines", t: "Мины", s: "Открывай клетки, обходи мины", img: "Ion Gem", k: ["#3aa0ff", "#0a2550"], chips: ["до x24"] },
  { id: "wheel", t: "Колесо", s: "Крути и лови множитель", img: "Hypno Lollipop", k: ["#ff4fa0", "#4c0b2c"], chips: ["до x5"] },
  { id: "swap", t: "Обменник", s: "Поменяй подарок на другой той же ценности — покрасивее", img: "Loot Bag", k: ["#ffb340", "#4a2200"], chips: ["без риска", "12 вариантов"] },
];
const gameHead = (img, t, s) => `<div class="ghead"><img src="${A.orig(img, 128)}" alt=""><div><h2>${t}</h2><span>${s}</span></div></div>`;

// ------------------------------------------------------------ хаб
let hubPoll = null;
function renderGames() {
  const v = $("#v-games");
  v.innerHTML = `<div class="bankbar" id="bank"><span class="bk-i">${ic("wallet")}</span><div><span>Банк казино</span><b id="bank-v">—</b></div><em id="bank-d"></em></div>
    <div class="ghub">${GAMES.map((g, i) => `
    <div class="gcard${(typeof WIDE_GAMES !== "undefined" ? WIDE_GAMES.has(g.id) : i < 2) ? " wide" : ""}" data-act="game" data-id="${g.id}" style="--k1:${g.k[0]};--k2:${g.k[1]}">
      <div class="gc-bg"></div><div class="gc-glow"></div>
      <img class="gc-img" src="${g.imgUrl || A.orig(g.img, 256)}" alt="">
      ${g.id === "crash" ? `<div class="gc-live" id="hub-crash"><i></i>LIVE</div>` : ""}
      <div class="gc-t">${g.t}</div><div class="gc-s">${g.s}</div>
      <div class="gc-chips">${g.chips.map(c => `<span>${c}</span>`).join("")}</div>
    </div>`).join("")}</div>
    <div class="disc">Все игры — на игровых звёздах. ${esc(ME.disclaimer)}</div>`;
  const live = async () => {
    if (TAB !== "games") return clearInterval(hubPoll);
    const el = $("#hub-crash"); if (!el) return;
    try {
      const c = await api("crash"), st = c.now;
      el.innerHTML = "<i></i>" + (c.phase === "run" ? `x${Math.exp(c.k * (st - c.start)).toFixed(2)} · в полёте`
        : c.phase === "bet" ? `старт через ${Math.max(0, c.until - st).toFixed(0)}с` : `взорвалась на x${(c.crash || 1).toFixed(2)}`) + (c.bets.length ? ` · ${c.bets.length} игр.` : "");
    } catch (e) {}
  };
  clearInterval(hubPoll); live(); hubPoll = setInterval(live, 2000);
  loadBank();
}

// ------------------------------------------------------------ общий блок ставки
const betHTML = (id, val = 100) => `
  <div class="amt"><button data-act="gamt" data-for="${id}" data-v="half">½</button>
    <label class="amtf"><span>⭐</span><input id="${id}" inputmode="numeric" value="${val}"></label>
    <button data-act="gamt" data-for="${id}" data-v="dbl">×2</button></div>
  <div class="quick">${["100", "500", "1000", "5000", "max"].map(x => `<button data-act="gamt" data-for="${id}" data-v="${x}">${x === "max" ? "MAX" : short(+x)}</button>`).join("")}</div>`;
const betVal = id => Math.floor(+document.getElementById(id).value || 0);

// ============================================================ КРАШ
let CRASH_ALLIN = -1, CS = null, cOff = 0, cPoll = null, cRaf = null, cBoomRound = 0, autoOn = false, CRASH_ON = false;
let cStars = [], cBoom = null, cTip = null, cLastT = 0;
const ROCKET = new Image(); ROCKET.src = A.orig("Stellar Rocket", 128);
function openCrash() {
  const el = openSheet(`${gameHead("Stellar Rocket", "Краш", "Забери ставку до взрыва ракеты")}
    <div class="crash-box" id="cbox"><canvas id="ccv"></canvas><div class="mul" id="cmul">—</div></div>
    <div class="hist" id="chist"></div>
    <div class="betp">
      ${betHTML("camt")}
      <div class="auto"><button class="sw${autoOn ? " on" : ""}" id="csw" data-act="auto-tog"></button><span style="flex:1">Автовывод</span>
        <label class="autof"><input id="cauto" inputmode="decimal" value="2.00"><span>x</span></label></div>
      <div class="cbtns"><button class="btn cta" id="cbtn" data-act="crash-btn">…</button><button class="allin" id="callin" data-act="crash-allin">${ic("flame")}<b>ALL IN</b></button></div>
    </div>
    <div class="sec-t">Игроки раунда <span id="ccount"></span></div><div class="box" id="cbets"></div>
    <div class="disc">Множитель растёт, пока ракета не взорвётся. ${esc(ME.disclaimer)}</div>`, "crash-s");
  el._onClose = () => { CRASH_ON = false; stopCrash(); };
  CRASH_ON = true; CS = null; cBoom = null;
  cStars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: .2 + Math.random() * .8 }));
  pollCrash();
  clearInterval(cPoll); cPoll = setInterval(() => CRASH_ON ? pollCrash() : stopCrash(), 600);
  cancelAnimationFrame(cRaf); cLastT = performance.now(); cRaf = requestAnimationFrame(crashFrame);
}
function stopCrash() { clearInterval(cPoll); cPoll = null; cancelAnimationFrame(cRaf); }
const mClass = m => m < 1.5 ? "m-lo" : m < 3 ? "m-mid" : m < 10 ? "m-hi" : "m-top";
const mColor = m => m < 2 ? "#ffffff" : m < 5 ? "#4cf0a0" : m < 10 ? "#ffd04d" : "#ff7ac2";
async function pollCrash() {
  try { CS = await api("crash"); } catch (e) { return; }
  if (!CRASH_ON) return;
  cOff = CS.now - Date.now() / 1000;
  setStars(CS.stars);
  $("#chist").innerHTML = CS.history.map(m => `<span class="${mClass(m)}">${m.toFixed(2)}x</span>`).join("");
  $("#ccount").textContent = CS.bets.length || "";
  $("#cbets").innerHTML = CS.bets.length ? CS.bets.map(b => `<div class="row tap" data-act="profile" data-id="${b.id}">${avaHTML(b, 34)}<div class="grow"><div class="t">${esc(b.name)}</div><div class="s">⭐ ${fmt(b.amount)}</div></div>
      ${b.cashed ? `<span class="win">x${b.cashed.toFixed(2)} · +${short(b.amount * b.cashed)}</span>` : CS.phase === "end" ? `<span class="lose">−${short(b.amount)}</span>` : `<span class="hint">в игре</span>`}</div>`).join("")
    : emptyHTML("rocket", "Пока никто не поставил — будь первым");
  if (CS.phase === "end" && cBoomRound !== CS.round) {
    cBoomRound = CS.round;
    const box = $("#cbox"); box.classList.remove("boom"); void box.offsetWidth; box.classList.add("boom");
    if (cTip) cBoom = { t0: performance.now(), x: cTip.x, y: cTip.y, p: Array.from({ length: 46 }, () => { const a = Math.random() * 6.283, v = 1 + Math.random() * 4.5; return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.5 + Math.random() * 3.5, c: ["#ff5c5c", "#ffb340", "#fff3b0"][Math.random() * 3 | 0] }; }) };
    if (CS.my && !CS.my.cashed) H.err(); else H.imp("heavy");
  }
}
function crashFrame(now) {
  cRaf = requestAnimationFrame(crashFrame);
  if (!CS || !CRASH_ON) return;
  const cv = $("#ccv"); if (!cv) return;
  const dt = Math.min(.05, (now - cLastT) / 1000); cLastT = now;
  const d = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, Hh = cv.clientHeight;
  if (cv.width !== Math.round(W * d)) { cv.width = W * d; cv.height = Hh * d; }
  const c = cv.getContext("2d"); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, Hh);
  const st = Date.now() / 1000 + cOff, mul = $("#cmul"), btn = $("#cbtn");
  let t = 0, m = 1;
  if (CS.phase === "run") { t = Math.max(0, st - CS.start); m = Math.exp(CS.k * t); }
  else if (CS.phase === "end") { m = CS.crash; t = Math.log(m) / CS.k; }
  // звёзды: летят мимо тем быстрее, чем выше множитель
  const speed = CS.phase === "run" ? .08 + Math.log(m) * .18 : .015;
  for (const s of cStars) {
    s.x -= speed * s.z * dt; s.y += speed * s.z * dt * .55;
    if (s.x < 0) s.x += 1; if (s.y > 1) s.y -= 1;
    c.globalAlpha = .25 + s.z * .6; c.fillStyle = "#fff";
    const r = s.z * 1.4;
    if (CS.phase === "run" && speed > .3) { c.fillRect(s.x * W, s.y * Hh, Math.min(28, speed * 30 * s.z), r); }
    else { c.beginPath(); c.arc(s.x * W, s.y * Hh, r, 0, 6.283); c.fill(); }
  }
  c.globalAlpha = 1;
  if (CS.phase === "bet") {
    const left = Math.max(0, CS.until - st);
    mul.style.color = "#fff";
    mul.innerHTML = `${left.toFixed(1)}<small>до старта</small>`;
    const bob = Math.sin(st * 5) * 3;
    if (ROCKET.complete) c.drawImage(ROCKET, 18, Hh - 70 + bob, 52, 52);
    c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(0, Hh - 5, W, 5);
    const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#7c5cff"); g.addColorStop(1, "#ff6fb5");
    c.fillStyle = g; c.fillRect(0, Hh - 5, W * (1 - left / 8), 5);
    cTip = null;
  } else {
    const xmax = Math.max(8, t * 1.15), ymax = Math.max(2, m * 1.18), pad = 24;
    const X = tt => pad + tt / xmax * (W - pad * 2.2), Y = mm => Hh - pad - (mm - 1) / (ymax - 1) * (Hh - pad * 2.6);
    const boom = CS.phase === "end";
    // оси: подписи множителя
    c.font = "600 10px -apple-system,Segoe UI,sans-serif"; c.fillStyle = "rgba(255,255,255,.3)"; c.textAlign = "left";
    for (let i = 1; i <= 3; i++) { const mm = 1 + (ymax - 1) * i / 4; c.fillText(mm.toFixed(1) + "x", 6, Y(mm) + 3); c.fillStyle = "rgba(255,255,255,.05)"; c.fillRect(34, Y(mm), W, 1); c.fillStyle = "rgba(255,255,255,.3)"; }
    const grad = c.createLinearGradient(0, Hh, W, 0);
    grad.addColorStop(0, boom ? "#ff5c5c" : "#7c5cff"); grad.addColorStop(1, boom ? "#ffae5c" : "#ff6fb5");
    c.beginPath(); c.moveTo(X(0), Y(1));
    const N = 70; for (let i = 1; i <= N; i++) { const tt = t * i / N; c.lineTo(X(tt), Y(Math.exp(CS.k * tt))); }
    c.save(); c.lineWidth = 4.5; c.strokeStyle = grad; c.lineCap = "round"; c.shadowColor = boom ? "#ff5c5c" : "#a77bff"; c.shadowBlur = 14; c.stroke(); c.restore();
    c.lineTo(X(t), Hh); c.lineTo(X(0), Hh); c.closePath();
    const fill = c.createLinearGradient(0, 0, 0, Hh); fill.addColorStop(0, boom ? "rgba(255,92,92,.28)" : "rgba(124,92,255,.32)"); fill.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = fill; c.fill();
    const tx = X(t), ty = Y(m), d2 = .25, ang = Math.atan2(Y(Math.exp(CS.k * Math.max(0, t - d2))) - ty, tx - X(Math.max(0, t - d2)));
    cTip = { x: tx, y: ty };
    if (!boom) {
      c.save(); c.translate(tx, ty); c.rotate(Math.PI / 4 - ang);
      const fl = 10 + Math.random() * 8;   // пламя
      const fg = c.createRadialGradient(-20, 20, 0, -20, 20, fl + 8); fg.addColorStop(0, "rgba(255,240,180,.95)"); fg.addColorStop(.5, "rgba(255,140,40,.6)"); fg.addColorStop(1, "rgba(255,60,0,0)");
      c.fillStyle = fg; c.beginPath(); c.arc(-20, 20, fl + 8, 0, 6.283); c.fill();
      if (ROCKET.complete) c.drawImage(ROCKET, -26, -26, 52, 52);
      c.restore();
    }
    mul.style.color = boom ? "#ff6b6b" : mColor(m);
    mul.innerHTML = boom ? `${m.toFixed(2)}x<small>ракета взорвалась</small>` : `${m.toFixed(2)}x<small>летим</small>`;
  }
  if (cBoom) {  // взрыв
    const k = (now - cBoom.t0) / 1000;
    if (k > 1.3) cBoom = null; else {
      for (const p of cBoom.p) {
        c.globalAlpha = Math.max(0, 1 - k / 1.3); c.fillStyle = p.c;
        c.beginPath(); c.arc(cBoom.x + p.vx * k * 60, cBoom.y + p.vy * k * 60 + 40 * k * k, p.r * (1 - k / 2), 0, 6.283); c.fill();
      }
      c.globalAlpha = Math.max(0, .9 - k * 2); c.fillStyle = "#fff3b0";
      c.beginPath(); c.arc(cBoom.x, cBoom.y, 10 + k * 70, 0, 6.283); c.fill(); c.globalAlpha = 1;
    }
  }
  const my = CS.my;
  const ai = $("#callin"); if (ai) { ai.disabled = !(CS.phase === "bet" && !my && !crashLate()) || ME.stars < 10; $("#cbox").classList.toggle("allin-on", !!(my && CRASH_ALLIN === CS.round)); }
  if (CS.phase === "bet") {
    if (my) setBtn(btn, "ghost", `Ставка ⭐ ${fmt(my.amount)} принята${my.auto ? " · авто " + my.auto + "x" : ""}`, true);
    else if (crashLate()) setBtn(btn, "ghost", "Старт — жди следующий раунд", true);
    else setBtn(btn, "cta", `Поставить ⭐ ${fmt(betVal("camt"))}`, false);
  } else if (CS.phase === "run" && my && !my.cashed) {
    setBtn(btn, "green cta", `Забрать ⭐ ${fmt(my.amount * m)}`, false);
  } else if (my && my.cashed) {
    setBtn(btn, "ghost", `Забрал x${my.cashed.toFixed(2)} · +⭐ ${fmt(my.amount * my.cashed)}`, true);
  } else setBtn(btn, "ghost", CS.phase === "end" ? "Новый раунд через пару секунд" : "Раунд идёт — жди следующий", true);
}
// сервер закрывает приём за 0,2 с до старта; с запасом на пинг гасим кнопку за 0,6 с — иначе «приём ставок закрыт»
const crashLate = () => CS && CS.phase === "bet" && Date.now() / 1000 + cOff > CS.until - 0.6;
function setBtn(b, cls, text, dis) {
  const c = "btn" + (cls ? " " + cls : "");
  if (b.className !== c) b.className = c;
  if (b._t !== text) { b._t = text; b.textContent = text; }
  b.disabled = dis;
}
// ALL IN: весь баланс одной кнопкой (лимит ставки — 1 000 000)
async function crashAllin() {
  if (!CS || CS.phase !== "bet" || CS.my) return;
  const amount = Math.min(ME.stars, 1_000_000);
  if (amount < 10) return toast("Не хватает звёзд ⭐");
  if (!await confirmM("ALL IN?", `Ставишь ⭐ ${fmt(amount)} — ${amount === ME.stars ? "весь баланс" : "максимум за раунд"}. Успей забрать до взрыва!`, "Поехали 🔥")) return;
  if (CS.phase !== "bet" || CS.my || crashLate()) return toast("Раунд уже начался — жди следующий");
  const auto = autoOn ? parseFloat(($("#cauto").value || "").replace(",", ".")) : null;
  try {
    const r = await post("crash/bet", { amount, auto }); H.imp("heavy"); setStars(ME.stars - amount);
    document.body.classList.remove("bw-shake"); void document.body.offsetWidth; document.body.classList.add("bw-shake");
    CRASH_ALLIN = CS.round; await pollCrash(); afterLevelUp(r.levelup);
  } catch (e) {}
}
async function crashBtn() {
  if (!CS) return;
  if (CS.phase === "bet" && !CS.my) {
    if (crashLate()) return;
    const amount = betVal("camt");
    const auto = autoOn ? parseFloat(($("#cauto").value || "").replace(",", ".")) : null;
    if (amount > ME.stars) return toast("Не хватает звёзд ⭐");
    try { const r = await post("crash/bet", { amount, auto }); H.imp("medium"); setStars(ME.stars - amount); await pollCrash(); afterLevelUp(r.levelup); } catch (e) {}
  } else if (CS.phase === "run" && CS.my && !CS.my.cashed) {
    try {
      const r = await post("crash/cashout"); H.ok(); toast(`x${r.mult.toFixed(2)} · +⭐ ${fmt(r.pay)}`, "ok"); coinShower($("#cbox"), Math.min(70, 10 + r.mult * 6));
      const allin = CRASH_ALLIN === CS.round; await pollCrash();
      if (r.mult >= 5 || (allin && r.mult >= 1.5)) bigWin(r.pay, r.mult, allin ? Math.max(5, r.mult * 4) : r.mult);
    } catch (e) {}
  }
}

// выбор своего подарка (апгрейд, обменник, маркет)
async function pickGift(title, cb) {
  MYP = await api("user/" + ME.id);
  const free = MYP.gifts.filter(g => g.price == null).sort((a, b) => b.value - a.value);
  openSheet(`<h2 class="gtitle">${title}</h2>${free.length
    ? `<div class="ggrid">${free.map(g => `<div class="gcell" data-act="pick-gift" data-k="${reg({ g, cb })}">${giftHTML(g, { lite: true })}<div class="cap">${giftName(g)}<br><small>⭐ ${fmt(g.value)}</small></div></div>`).join("")}</div>`
    : emptyHTML("gift", "Нет свободных подарков — открой кейс")}`);
}

// мультивыбор своих подарков (апгрейд пачкой, подарочные столы)
async function pickGifts(title, o, cb) {
  MYP = await api("user/" + ME.id);
  const free = MYP.gifts.filter(x => x.price == null).sort((a, b) => b.value - a.value);
  const sel = new Set((o.pre || []).map(x => x.id).filter(id => free.some(f => f.id === id)));
  const el = openSheet(`<h2 class="gtitle">${title}</h2>${o.min ? `<div class="hint" style="margin:-6px 0 10px;font-size:13px">Нужно подарков минимум на ⭐ ${fmt(o.min)}</div>` : ""}
    ${free.length ? `<div class="ggrid" id="pg-grid">${free.map(x => `<div class="gcell" data-pg="${x.id}">${giftHTML(x, { lite: true, tag: "⭐ " + short(x.value) })}<span class="sel"></span><div class="cap">${giftName(x)}</div></div>`).join("")}</div>
      <div class="pgbar"><div><b id="pg-n"></b><span id="pg-v"></span></div><button class="btn sm ghost" data-act="pg-all">Все</button><button class="btn sm" data-act="pg-ok">Готово</button></div>`
      : emptyHTML("gift", "Нет свободных подарков — открой кейс")}`, "pgs");
  el._pg = { sel, free, cb, max: o.max || 10, min: o.min || 0 };
  const draw = () => {
    el.querySelectorAll("[data-pg]").forEach(c => { const on = sel.has(+c.dataset.pg); c.classList.toggle("picked", on); c.querySelector(".sel").innerHTML = on ? ic("check") : ""; });
    const v = free.filter(x => sel.has(x.id)).reduce((s, x) => s + x.value, 0);
    if (el.querySelector("#pg-n")) { el.querySelector("#pg-n").textContent = `Выбрано: ${sel.size}/${el._pg.max}`; el.querySelector("#pg-v").textContent = `ценность ⭐ ${fmt(v)}`; }
  };
  el._pgDraw = draw;
  el.addEventListener("click", e => {
    const c = e.target.closest("[data-pg]"); if (!c) return;
    const id = +c.dataset.pg;
    if (sel.has(id)) sel.delete(id); else if (sel.size >= el._pg.max) return toast(`Максимум ${el._pg.max}`); else sel.add(id);
    H.sel(); draw();
  });
  draw();
}

// ============================================================ АПГРЕЙД (пачка подарков → одна или несколько целей)
const UP = { gs: [], ts: [], items: [], total: 0, cols: [], busy: false, angle: 0, fast: false, f: { col: "", qs: "", k: "all" } };
const UPK = { all: [1.2, 1000, "Все"], low: [1.2, 3, "x1.2–3"], mid: [3, 10, "x3–10"], high: [10, 1000, "x10+"] };
const RING_TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = i / 60 * Math.PI * 2, r1 = i % 5 ? 55 : 53.5;
  return `<line x1="${60 + Math.sin(a) * r1}" y1="${60 - Math.cos(a) * r1}" x2="${60 + Math.sin(a) * 57.5}" y2="${60 - Math.cos(a) * 57.5}"/>`;
}).join("");
const upSV = () => UP.gs.reduce((s, g) => s + g.value, 0);
const upTV = () => UP.ts.reduce((s, g) => s + g.value, 0);
const upgChance = (tv = upTV()) => tv ? Math.min(80, upSV() / tv * 90) : 0;
const upKey = t => t.col + "|" + t.model;
function openUpgrade() {
  UP.gs = []; UP.ts = []; UP.items = []; UP.busy = false; UP.f = { col: "", qs: "", k: "all" };
  openSheet(`${gameHead("Mighty Arm", "Апгрейд", "Рискни подарками ради подарков дороже")}
    <div class="uring" id="u-ring">
      <svg viewBox="0 0 120 120"><defs><linearGradient id="u-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dffb8"/><stop offset="1" stop-color="#16c88d"/></linearGradient></defs>
        <g class="ticks">${RING_TICKS}</g>
        <circle cx="60" cy="60" r="47" class="trk"/><circle cx="60" cy="60" r="47" class="arc" id="u-arc"/>
        <g id="u-needle"><path d="M60 15.5 L55 6 L65 6 Z" fill="#fff"/><circle cx="60" cy="13" r="1.6" fill="#16c88d"/></g></svg>
      <div class="uc" id="u-center"></div>
    </div>
    <div class="upair">
      <div class="uslot" id="u-from" data-act="upg-pick"></div>
      <div class="uarrow">${ic("chev")}</div>
      <div class="uslot" id="u-to"></div>
    </div>
    <div class="uquick" id="u-quick" style="display:none">${[1.5, 2, 3, 6, 10].map(k => `<button data-act="upg-x" data-v="${k}">x${k}</button>`).join("")}
      <button class="ufast${UP.fast ? " on" : ""}" data-act="upg-fast">${ic("trend")}Быстро</button></div>
    <div class="btns"><button class="btn cta gold" id="u-go" data-act="upg-go" disabled>Выбери подарки</button></div>
    <div id="u-pick" style="display:none">
      <div class="sec-t">Цели — можно несколько <span id="u-cnt"></span></div>
      <label class="srch" style="margin-top:0">${ic("search")}<input id="u-q" placeholder="Поиск по коллекции или модели" enterkeyhint="search"></label>
      <div class="chips" style="margin-top:8px" id="u-k"></div>
      <div class="hist" id="u-cols" style="margin:8px -16px 10px"></div>
      <div class="ggrid" id="u-targets"></div>
    </div>
    <div class="disc">Загрузи до 10 подарков и выбери до 5 целей. Шанс = ценность ставки / ценность целей × ${String(gEdge("upg")).replace(".", ",")} (максимум 80%). Проиграл — все подарки ставки сгорают.</div>`, "upgs");
  const q = $("#u-q"); let tt;
  q.oninput = () => { clearTimeout(tt); tt = setTimeout(() => { UP.f.qs = q.value.trim(); upgLoad(); }, 300); };
  upgDraw();
}
const stackHTML = (gs, label, empty) => `<span class="ulab">${label}${gs.length > 1 ? ` · ${gs.length}` : ""}</span>` + (gs.length
  ? `<div class="ustack n${Math.min(gs.length, 3)}">${gs.slice(0, 3).map((g, i) => `<div style="--i:${i}">${giftHTML(g, { lite: true, plain: true })}</div>`).join("")}</div>
     <div class="ucap">${gs.length > 1 ? `${gs.length} подарков` : esc(gs[0].col)}<small>⭐ ${fmt(gs.reduce((s, g) => s + g.value, 0))}</small></div>`
  : `<div class="uempty"><b>${ic(empty[0])}</b>${empty[1]}</div>`);
function upgDraw(result) {
  const from = $("#u-from"), to = $("#u-to"); if (!from) return;
  from.innerHTML = stackHTML(UP.gs, "Ставка", ["plus", "Выбери подарки"]);
  to.innerHTML = stackHTML(UP.ts, "Цель", ["target", UP.gs.length ? "Выбери ниже" : "—"]);
  const ch = upgChance(), t0 = UP.ts[0];
  $("#u-center").innerHTML = result ? `<div class="ures ${result}">${result === "win" ? "АПГРЕЙД!" : "СГОРЕЛ"}</div>`
    : t0 ? `<img src="${A.model(t0.col, t0.model, 256)}" alt=""><b>${ch.toFixed(ch < 10 ? 1 : 0)}%</b><span>шанс</span>` : `<b class="hint">—</b><span>шанс</span>`;
  const C = 2 * Math.PI * 47;
  $("#u-arc").style.strokeDasharray = `${C * ch / 100} ${C}`;
  $("#u-ring").className = "uring" + (result ? " " + result : "");
  const go = $("#u-go"), bad = UP.ts.length && upTV() < 1.2 * upSV();
  go.disabled = !(UP.gs.length && UP.ts.length) || UP.busy || bad;
  go.textContent = !UP.gs.length ? "Выбери подарки" : !UP.ts.length ? "Выбери цель" : bad ? "Цели должны быть дороже ставки в 1.2 раза" : `Апгрейд · шанс ${ch.toFixed(1)}%`;
  $("#u-pick").style.display = UP.gs.length ? "" : "none";
  $("#u-quick").style.display = UP.gs.length ? "" : "none";
  document.querySelectorAll("#u-quick [data-act=upg-x]").forEach(b => b.classList.toggle("on", !!(UP.ts.length && UP.gs.length && Math.abs(upTV() / upSV() - +b.dataset.v) / +b.dataset.v < .2)));
  if (!UP.gs.length) return;
  $("#u-cnt").textContent = UP.total ? `найдено ${fmt(UP.total)}` : "";
  $("#u-k").innerHTML = Object.entries(UPK).map(([k, [, , l]]) => `<button data-act="upg-k" data-v="${k}" class="${UP.f.k === k ? "on" : ""}">${l}</button>`).join("");
  $("#u-cols").innerHTML = [["", "Все коллекции"], ...UP.cols.map(c => [c, c])].map(([k, l]) => `<span data-act="upg-col" data-v="${esc(k)}" class="${UP.f.col === k ? "on" : ""}">${k ? `<img src="${A.orig(k, 64)}" alt="">` : ""}${esc(l)}</span>`).join("");
  const sel = new Set(UP.ts.map(upKey));
  $("#u-targets").innerHTML = UP.items.length ? UP.items.map(x => {
    const on = sel.has(upKey(x)), c = upgChance(on ? upTV() : upTV() + x.value);
    return `<div class="gcell item${on ? " picked" : ""}" data-act="upg-target" data-k="${reg(x)}">
      ${giftHTML(x, { lite: true, plain: true })}<span class="chance">${c.toFixed(c < 10 ? 1 : 0)}%</span>${on ? `<span class="sel">${ic("check")}</span>` : ""}
      <div class="cap">${esc(x.col)}<br><small>${esc(x.model)} · ⭐ ${short(x.value)}</small></div></div>`;
  }).join("") + (UP.total > UP.items.length ? `<div class="hint" style="grid-column:1/-1;text-align:center;font-size:12.5px;padding:6px">Показаны первые ${UP.items.length} — уточни поиск или коллекцию</div>` : "")
    : `<div style="grid-column:1/-1">${emptyHTML("search", "Ничего не нашлось")}</div>`;
}
async function upgLoad() {
  if (!UP.gs.length) return;
  const [kmin, kmax] = UPK[UP.f.k];
  const d = await api(`upgrade/targets?gid=${UP.gs.map(g => g.id).join(",")}&col=${enc(UP.f.col)}&qs=${enc(UP.f.qs)}&kmin=${kmin}&kmax=${kmax}`);
  UP.items = d.items; UP.total = d.total; UP.cols = d.cols;
  if (!UP.ts.length && d.items.length) UP.ts = [d.items[Math.min(5, d.items.length - 1)]];
  upgDraw();
}
function upgPick() { if (!UP.busy) pickGifts("Какие подарки ставим?", { pre: UP.gs, max: 10 }, gs => { UP.gs = gs; UP.ts = []; UP.items = []; upgDraw(); upgLoad(); }); }
async function upgGo() {
  if (UP.busy || !UP.gs.length || !UP.ts.length) return;
  const ch = upgChance();
  if (!UP.fast && !await confirmM("Апгрейд?", `Шанс ${ch.toFixed(1)}%. Если не повезёт, ${UP.gs.length > 1 ? `все ${UP.gs.length} подарков ставки сгорят` : `${esc(UP.gs[0].col)} #${fmt(UP.gs[0].num)} сгорит`}.`, "Крутим")) return;
  UP.busy = true; upgDraw();
  let r;
  try { r = await post("upgrade", { gids: UP.gs.map(g => g.id), targets: UP.ts.map(t => ({ col: t.col, model: t.model })) }); }
  catch (e) { UP.busy = false; upgDraw(); return; }
  const arc = r.chance / 100 * 360;
  const stop = r.win ? Math.random() * arc * .9 + arc * .05 : arc + 4 + Math.random() * (352 - arc);
  const start = UP.angle, to = start - (start % 360) + 360 * 5 + stop;
  const needle = $("#u-needle"), t0 = performance.now(), dur = UP.fast ? 700 : 4300;
  let lastTick = start;
  await new Promise(done => (function f(now) {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3.6), a = start + (to - start) * e;
    needle.style.transform = `rotate(${a}deg)`;
    if (a - lastTick > 18) { lastTick = a; H.sel(); }
    k < 1 && needle.isConnected ? requestAnimationFrame(f) : done();
  })(t0));
  UP.angle = to;
  if (!needle.isConnected) { UP.busy = false; MYP = null; loadMe(); return; }
  if (r.win) {
    H.ok(); upgDraw("win"); burstAt($("#u-ring"), r.gifts[0]); setTimeout(() => burstAt($("#u-to"), r.gifts[0]), 250);
    toast(r.gifts.length > 1 ? `Апгрейд! +${r.gifts.length} подарков` : `${r.gifts[0].col} теперь твой!`);
  } else {
    H.err(); upgDraw("lose"); $("#u-from").classList.add("burn");
    toast("Не повезло — подарки сгорели");
  }
  await sleep(UP.fast ? 700 : 1600);
  $("#u-from") && $("#u-from").classList.remove("burn");
  UP.busy = false; UP.ts = []; MYP = null;
  UP.gs = r.win ? r.gifts : [];
  upgDraw();
  if (UP.gs.length) upgLoad();
  loadMe(); afterLevelUp(r.levelup);
}

// ============================================================ МИНЫ
let MS = { active: false }, minesN = 3, mineBusy = false;
// возврат игроку — с сервера (учитывает акцию), иначе базовый
const gEdge = k => (ME && ME.edges && ME.edges[k]) || .96;
const minesMult = (n, k) => { let m = gEdge("mines"); for (let i = 0; i < k; i++) m *= (25 - i) / (25 - n - i); return k ? m : 1; };
async function openMines() {
  mineBusy = false;
  openSheet(`${gameHead("Ion Gem", "Мины", "Открывай клетки и не наступи на мину")}
    <div class="ladder" id="m-lad"></div>
    <div class="mgrid" id="m-grid">${Array.from({ length: 25 }, (_, i) => `<button class="mc" data-act="mine" data-i="${i}"><span></span></button>`).join("")}</div>
    <div class="mstat"><div><span>Выигрыш</span><b id="m-win">—</b></div><div><span>Следующий</span><b id="m-next">—</b></div></div>
    <div class="betp" id="m-ctl">
      ${betHTML("m-amt")}
      <div class="mn"><span>Мин</span><div class="quick" id="m-n">${[1, 3, 5, 10, 24].map(n => `<button data-act="mines-n" data-v="${n}" class="${n === minesN ? "on" : ""}">${n}</button>`).join("")}</div></div>
      <button class="btn cta" id="m-btn" data-act="mines-btn">Играть</button>
    </div>`, "mines-s");
  MS = await api("mines");
  if (MS.active) minesN = MS.n;
  minesDraw();
}
const GEM = () => `<img src="${A.orig("Ion Gem", 128)}" alt="">`;
function minesDraw(boomCell) {
  const grid = $("#m-grid"); if (!grid) return;
  const opened = new Set(MS.opened || []), bombs = new Set(MS.bombs || []);
  grid.querySelectorAll(".mc").forEach((b, i) => {
    let cls = "mc", html = "<span></span>";
    if (opened.has(i)) { cls += " gem"; html = GEM(); }
    else if (bombs.has(i)) { cls += i === boomCell ? " boom" : " bomb"; html = ic("bomb", "bombic"); }
    else if (!MS.active && MS.bombs) cls += " dim";
    if (b.className !== cls) { b.className = cls; b.innerHTML = html; }
    b.disabled = !MS.active;
  });
  grid.classList.toggle("live", !!MS.active);
  // лесенка множителей
  const n = MS.active ? MS.n : minesN, k = (MS.opened || []).length, maxK = 25 - n;
  const from = Math.max(1, Math.min(k, maxK - 5)), steps = [];
  for (let i = from; i <= Math.min(maxK, from + 5); i++) steps.push(i);
  $("#m-lad").innerHTML = steps.map(i => `<div class="${MS.active && i === k ? "cur" : MS.active && i === k + 1 ? "nxt" : i <= k && MS.active ? "done" : ""}"><b>x${minesMult(n, i).toFixed(2)}</b><span>${i} шаг</span></div>`).join("");
  $("#m-next").textContent = MS.active && k < maxK ? "x" + minesMult(n, k + 1).toFixed(2) : "—";
  $("#m-win").textContent = MS.active && k ? "⭐ " + fmt(MS.bet * MS.mult) : MS.pay ? "⭐ " + fmt(MS.pay) : "—";
  const btn = $("#m-btn");
  if (MS.active) setBtn(btn, k ? "green cta" : "ghost", k ? `Забрать ⭐ ${fmt(MS.bet * MS.mult)}` : "Открой первую клетку", !k);
  else setBtn(btn, "cta", "Играть", false);
  document.querySelectorAll("#m-ctl .amt button, #m-ctl .quick button, #m-amt").forEach(x => x.disabled = !!MS.active);
}
async function minesBtn() {
  if (MS.active) {
    if (!MS.opened.length) return;
    const r = await post("mines/cashout"); MS = r; H.ok(); toast(`+⭐ ${fmt(r.pay)}`, "ok"); burstAt($("#m-grid")); setStars(r.stars); minesDraw(); winFx(null, r.pay, r.bet);
  } else {
    const bet = betVal("m-amt");
    if (bet > ME.stars) return toast("Не хватает звёзд ⭐");
    const r = await post("mines/start", { bet, n: minesN }); MS = r; setStars(r.stars); H.imp("medium"); minesDraw(); afterLevelUp(r.levelup);
  }
}
async function mineClick(i) {
  if (!MS.active || mineBusy || (MS.opened || []).includes(i)) return;
  mineBusy = true;
  try {
    const r = await post("mines/reveal", { cell: i });
    MS = r;
    if (r.boom != null) { H.err(); const g = $("#m-grid"); g.classList.remove("shake"); void g.offsetWidth; g.classList.add("shake"); toast("Мина!", "err"); minesDraw(r.boom); loadMe(); }
    else { H.imp("light"); if (r.pay) { H.ok(); toast(`Поле зачищено! +⭐ ${fmt(r.pay)}`, "ok"); setStars(r.stars); burstAt($("#m-grid")); winFx(null, r.pay, r.bet); } minesDraw(); }
  } finally { mineBusy = false; }
}

// ============================================================ КОЛЕСО
let WH = null, whAngle = 0, whBusy = false;
const WCOL = { 0: ["#363a48", "#1d2029"], 0.5: ["#64708a", "#363d4d"], 1.2: ["#4f9bff", "#1b4fb0"], 1.5: ["#a57bff", "#5a2fc0"], 2: ["#ff6fb5", "#b5216a"], 3: ["#ffa24a", "#c2560c"], 5: ["#ffe27a", "#d79a00"] };
async function openWheel() {
  whBusy = false;
  openSheet(`${gameHead("Hypno Lollipop", "Колесо", "Крути и лови множитель")}
    <div class="wheel"><div class="bulbs" id="w-bulbs">${Array.from({ length: 20 }, (_, i) => `<i style="transform:rotate(${i * 18 + 9}deg) translateY(calc(var(--wr) * -1))"></i>`).join("")}</div>
      <canvas id="w-cv" width="640" height="640"></canvas><div class="wptr"></div>
      <div class="whub"><span>⭐</span></div></div>
    <div class="wres" id="w-res">Сделай ставку и крути</div>
    <div class="wleg" id="w-leg"></div>
    <div class="betp">${betHTML("w-amt")}<button class="btn cta gold" id="w-btn" data-act="wheel-spin">Крутить</button></div>`, "wheel-s");
  if (!WH) WH = (await api("wheel")).segments;
  wheelDraw();
  const cnt = {}; WH.forEach(m => cnt[m] = (cnt[m] || 0) + 1);
  $("#w-leg").innerHTML = Object.keys(cnt).map(Number).sort((a, b) => a - b).map(m =>
    `<span style="--wc:${WCOL[m][0]}"><i></i>x${m} · ${Math.round(cnt[m] / WH.length * 100)}%</span>`).join("");
}
function wheelDraw() {
  const cv = $("#w-cv"); if (!cv) return;
  const c = cv.getContext("2d"), R = 320, n = WH.length, step = Math.PI * 2 / n;
  c.clearRect(0, 0, 640, 640);
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step, [l, dk] = WCOL[WH[i]];
    const g = c.createRadialGradient(R, R, 40, R, R, R);
    g.addColorStop(0, dk); g.addColorStop(.55, l); g.addColorStop(1, dk);
    c.beginPath(); c.moveTo(R, R); c.arc(R, R, R - 4, a0, a0 + step); c.closePath();
    c.fillStyle = g; c.fill();
    c.strokeStyle = "rgba(255,215,120,.55)"; c.lineWidth = 2.5; c.stroke();
    c.save(); c.translate(R, R); c.rotate(a0 + step / 2);
    c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 6;
    c.fillStyle = WH[i] ? "#fff" : "rgba(255,255,255,.4)"; c.font = "800 34px -apple-system,Segoe UI,sans-serif"; c.textAlign = "right"; c.textBaseline = "middle";
    c.fillText(WH[i] ? "x" + WH[i] : "x0", R - 30, 0); c.restore();
  }
  const gl = c.createRadialGradient(R, R * .6, 0, R, R, R);   // блик сверху
  gl.addColorStop(0, "rgba(255,255,255,.14)"); gl.addColorStop(.6, "rgba(255,255,255,0)");
  c.fillStyle = gl; c.beginPath(); c.arc(R, R, R - 4, 0, 6.283); c.fill();
}
async function wheelSpin() {
  if (whBusy) return;
  const bet = betVal("w-amt");
  if (bet > ME.stars) return toast("Не хватает звёзд ⭐");
  whBusy = true; $("#w-btn").disabled = true;
  let r;
  try { r = await post("wheel", { bet }); } catch (e) { whBusy = false; $("#w-btn").disabled = false; return; }
  setStars(ME.stars - bet);
  const n = WH.length, seg = 360 / n;
  const target = 360 - (r.idx * seg + seg / 2) + (Math.random() - .5) * seg * .6;
  const start = whAngle, end = start - (start % 360) + 360 * 6 + target;
  const cv = $("#w-cv"), t0 = performance.now(), dur = 5200, res = $("#w-res");
  $("#w-bulbs").classList.add("fast"); res.className = "wres"; res.textContent = "Крутится…";
  let lastSeg = -1;
  await new Promise(done => (function f(now) {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4), a = start + (end - start) * e;
    cv.style.transform = `rotate(${a}deg)`;
    const s = Math.floor((a + seg / 2) / seg); if (s !== lastSeg) { lastSeg = s; H.sel(); }
    k < 1 && cv.isConnected ? requestAnimationFrame(f) : done();
  })(t0));
  whAngle = end;
  if (!cv.isConnected) { whBusy = false; loadMe(); return; }
  $("#w-bulbs").classList.remove("fast");
  setStars(r.stars);
  if (r.pay > bet) { H.ok(); res.className = "wres win"; res.textContent = `x${r.mult} · +⭐ ${fmt(r.pay)}`; burstAt(cv); winFx(null, r.pay, bet); }
  else if (r.pay) { H.imp("medium"); res.className = "wres meh"; res.textContent = `x${r.mult} · ⭐ ${fmt(r.pay)}`; }
  else { H.err(); res.className = "wres lose"; res.textContent = "Пусто — попробуй ещё"; }
  whBusy = false; $("#w-btn").disabled = false;
  afterLevelUp(r.levelup);
}

// ============================================================ ОБМЕННИК
const SW = { g: null, opts: [], busy: false };
function openSwap() {
  SW.g = null; SW.opts = [];
  openSheet(`${gameHead("Loot Bag", "Обменник", "Поменяй подарок на другой той же ценности")}
    <div class="swtop"><div class="uslot" id="s-from" data-act="swap-pick"></div>
      <div class="swinfo"><b>Как это работает</b><span>Выбери свой подарок, а потом один из 12 вариантов на 85–100% его ценности. Без риска: подарок просто меняется.</span>
      <button class="btn sm ghost" data-act="swap-more" id="s-more" style="margin-top:8px;display:none">${ic("refresh")}Другие варианты</button></div></div>
    <div class="sec-t" id="s-tt"></div><div class="ggrid" id="s-opts"></div>`, "swap-s");
  swapDraw();
}
function swapDraw() {
  const f = $("#s-from"); if (!f) return;
  f.innerHTML = `<span class="ulab">Твой подарок</span>` + (SW.g ? `${giftHTML(SW.g, { lite: true, plain: true })}<div class="ucap">${esc(SW.g.col)}<small>⭐ ${fmt(SW.g.value)}</small></div>`
    : `<div class="uempty"><b>${ic("plus")}</b>Выбрать</div>`);
  $("#s-more").style.display = SW.g ? "" : "none";
  $("#s-tt").textContent = SW.g ? (SW.opts.length ? "Можно поменять на" : "Ищем варианты…") : "";
  $("#s-opts").innerHTML = SW.opts.map((x, i) => `<div class="gcell item" data-act="swap-go" data-i="${i}">${giftHTML(x, { lite: true })}
    <span class="chance">${Math.round(x.value / SW.g.value * 100)}%</span>
    <div class="cap">${esc(x.col)}<br><small>${esc(x.model)} · ⭐ ${short(x.value)}</small></div></div>`).join("")
    || (SW.g ? `<div style="grid-column:1/-1">${emptyHTML("search", "Подходящих вариантов не нашлось — обнови список")}</div>` : "");
}
async function swapChoose(g) {
  SW.g = g; SW.opts = []; swapDraw();
  SW.opts = await api("swap/options?gid=" + g.id);
  swapDraw();
}
async function swapGo(i) {
  if (SW.busy) return;
  const t = SW.opts[i];
  if (!await confirmM("Поменять?", `${esc(SW.g.col)} (⭐ ${fmt(SW.g.value)}) → ${esc(t.col)} · ${esc(t.model)} (⭐ ${fmt(t.value)})`, "Поменять")) return;
  SW.busy = true;
  try {
    const r = await post("swap", { gid: SW.g.id, idx: i });
    H.ok(); toast(`Теперь у тебя ${r.gift.col}`, "ok");
    SW.g = r.gift; SW.opts = []; MYP = null; swapDraw();
    burstAt($("#s-from"), r.gift);
    swapChoose(r.gift);
  } finally { SW.busy = false; }
}

// ============================================================ действия
Object.assign(ACT, {
  game: el => { H.imp("light"); ({ crash: openCrash, upgrade: openUpgrade, mines: openMines, wheel: openWheel, swap: openSwap, duels: () => openDuels() })[el.dataset.id](); },
  gamt: el => {
    const i = document.getElementById(el.dataset.for), v = el.dataset.v, cur = +i.value || 0;
    i.value = v === "half" ? Math.max(10, Math.floor(cur / 2)) : v === "dbl" ? Math.min(ME.stars, cur * 2) : v === "max" ? ME.stars : v;
    H.sel();
  },
  "upg-pick": () => upgPick(),
  "pick-gift": el => { const o = REG.get(el.dataset.k); closeSheet(); o.cb(o.g); },
  "swap-pick": () => { if (!SW.busy) pickGift("Что меняем?", swapChoose); },
  "swap-go": el => swapGo(+el.dataset.i),
  "swap-more": () => SW.g && swapChoose(SW.g),
  "upg-target": el => {
    if (UP.busy) return;
    const x = REG.get(el.dataset.k), i = UP.ts.findIndex(t => upKey(t) === upKey(x));
    if (i >= 0) UP.ts.splice(i, 1); else if (UP.ts.length >= 5) return toast("Максимум 5 целей"); else UP.ts.push(x);
    H.sel(); upgDraw();
  },
  "pg-all": () => { const s = topSheet(), p = s && s._pg; if (!p) return; p.free.slice(0, p.max).forEach(x => p.sel.add(x.id)); H.sel(); s._pgDraw(); },
  "pg-ok": () => {
    const s = topSheet(), p = s && s._pg; if (!p) return;
    const list = p.free.filter(x => p.sel.has(x.id)), v = list.reduce((a, x) => a + x.value, 0);
    if (!list.length) return toast("Выбери хотя бы один подарок");
    if (p.min && v < p.min) return toast(`Нужно минимум на ⭐ ${fmt(p.min)}`);
    closeSheet(); H.ok(); p.cb(list);
  },
  "upg-x": async el => {
    if (!UP.gs.length || UP.busy) return;
    const k = +el.dataset.v, want = upSV() * k;
    const d = await api(`upgrade/targets?gid=${UP.gs.map(g => g.id).join(",")}&kmin=${Math.max(1.2, k * .75)}&kmax=${k * 1.35}`);
    if (!d.items.length) return toast("Нет подходящих целей");
    UP.ts = [d.items.reduce((a, b) => Math.abs(b.value - want) < Math.abs(a.value - want) ? b : a)];
    H.sel(); upgDraw();
  },
  "upg-fast": el => { UP.fast = !UP.fast; el.classList.toggle("on", UP.fast); H.sel(); },
  "upg-k": el => { UP.f.k = el.dataset.v; H.sel(); upgLoad(); },
  "upg-col": el => { UP.f.col = el.dataset.v; H.sel(); upgLoad(); },
  "upg-go": () => upgGo(),
  mine: el => mineClick(+el.dataset.i),
  "mines-n": el => { if (MS.active) return; minesN = +el.dataset.v; H.sel(); document.querySelectorAll("#m-n button").forEach(b => b.classList.toggle("on", b === el)); minesDraw(); },
  "mines-btn": () => minesBtn(),
  "wheel-spin": () => wheelSpin(),
});

// ------------------------------------------------------------ банк казино
async function loadBank() {
  try {
    const d = await api("bank");
    document.querySelectorAll("#bank-v").forEach(e => e.textContent = "⭐ " + fmt(d.bank));
    document.querySelectorAll("#bank-d").forEach(e => { e.className = d.today >= 0 ? "up" : "down"; e.textContent = `сегодня ${d.today >= 0 ? "+" : "−"}${short(Math.abs(d.today))}`; });
  } catch (e) {}
}
