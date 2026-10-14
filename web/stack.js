"use strict";
// ============================================================
//  «Стопка» — игра на ловкость без ставок: тап ставит блок на башню, свисающее отрезается.
//  Недельный турнир (stack.py). Движение блока — целочисленная формула, та же, что на сервере:
//  сервер пересчитывает башню по присланным тапам, поэтому нарисовать себе рекорд нельзя.
// ============================================================
const STK_ICON = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs>
<linearGradient id="a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ff9d2e"/></linearGradient>
<linearGradient id="b" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7ce0ff"/><stop offset="1" stop-color="#3a7dff"/></linearGradient>
<linearGradient id="c" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff8ad0"/><stop offset="1" stop-color="#d93d8f"/></linearGradient></defs>
<rect x="14" y="66" width="68" height="18" rx="4" fill="url(#b)"/><rect x="45" y="66" width="6" height="18" fill="#fff" opacity=".55"/>
<rect x="20" y="46" width="58" height="18" rx="4" fill="url(#c)"/><rect x="46" y="46" width="6" height="18" fill="#fff" opacity=".55"/>
<rect x="24" y="26" width="44" height="18" rx="4" fill="url(#a)"/><rect x="43" y="26" width="6" height="18" fill="#fff" opacity=".6"/>
<path d="M46 26c-6-10-16-8-12-1 2 3 8 2 12 1zm0 0c6-10 16-8 12-1-2 3-8 2-12 1z" fill="#fff" opacity=".9"/></svg>`);
ICONS.play = ICONS.play || '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke-linejoin="round"/>';
GAMES.push({ id: "stack", t: "Стопка", s: "Ставь блоки ровно — турнир на ловкость, без ставок", imgUrl: STK_ICON, k: ["#2ec4ff", "#0b1d4a"], chips: ["бесплатно", "турнир недели"] });
WIDE_GAMES.add("stack");
GAME_OPEN.stack = () => openStack();
GAME_SECTIONS.splice(1, 0, ["Ловкость", "target", ["stack"]]);
GAME_NAMES.stack = ["target", "Стопка"];

const STK = { d: null, run: null, busy: false };
const STK_BH = 24;   // высота этажа, px

// позиция левого края блока i через e мс после появления — бит в бит как simulate() в stack.py
function stkX(c, off, i, w, e) {
  const d = c.F + 2 * c.OVER - w, p = Math.max(c.PMIN, c.P0 - c.PSTEP * i);
  const s = (Math.floor(off * 2 * d / 10000) + Math.floor(e * 2 * d / p)) % (2 * d);
  return -c.OVER + (s < d ? s : 2 * d - s);
}
const stkHue = i => (196 + i * 11) % 360;
const stkLeft = s => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600); return d ? `${d} д ${h} ч` : `${h} ч ${Math.floor(s % 3600 / 60)} мин`; };

async function openStack() {
  const el = openSheet(`<div class="stk-head"><img src="${STK_ICON}" alt=""><div><h2>Стопка</h2><span>Ставь блоки точно друг на друга. Чем выше башня — тем выше в турнире</span></div></div>
    <div class="stk-stats" id="stk-stats"></div>
    <div class="stk-play" id="stk-play">
      <canvas id="stk-cv"></canvas>
      <div class="stk-score" id="stk-score">0</div>
      <div class="stk-pop" id="stk-pop"></div>
      <div class="stk-ov" id="stk-ov"></div>
    </div>
    <div id="stk-info">${emptyHTML("hourglass", "Загружаем турнир…")}</div>`, "stk-s");
  el._onClose = () => { STK.run = null; };
  stkScene(el);
  stkOverlay("start");
  await stkLoad();
}

async function stkLoad(d) {
  if (!d) { try { d = await api("stack"); } catch (e) { return; } }
  STK.d = d;
  const st = $("#stk-stats"), info = $("#stk-info"); if (!st || !info) return;
  st.innerHTML = `<div><span>Рекорд недели</span><b>${d.week || "—"}</b></div><div><span>Место</span><b>${d.rank ? "#" + d.rank : "—"}</b></div><div><span>Лучший</span><b>${d.best || "—"}</b></div>`;
  const row = (x, i, extra) => `<div class="stk-row${x.user.id === ME.id ? " me" : ""}"><i class="stk-pl p${i + 1}">${i + 1}</i>${avaHTML(x.user, 30)}<span class="grow">${esc(x.user.name)}</span>${extra || ""}<b>${x.score}</b></div>`;
  info.innerHTML = `<div class="sec-t">${ic("trophy")}Призы недели<em class="stk-end">ещё ${stkLeft(d.endsIn)}</em></div>
    <div class="stk-prz">${d.prizes.map((p, i) => `<div class="${i < 3 ? "t" + (i + 1) : ""}"><span>${i + 1}</span><b>${short(p)} ⭐</b></div>`).join("")}</div>
    <p class="stk-rule">${ic("lock")}Приз — только от <b>${d.min} этажей</b> и с ${d.minLevel} уровня. Новичку столько не построить: блоки ускоряются с каждым этажом, тренируйся</p>
    <div class="sec-t">${ic("users")}Топ недели</div>
    <div class="box stk-top">${d.top.length ? d.top.map((x, i) => row(x, i, x.score >= d.min && i < d.prizes.length ? `<em>+${short(d.prizes[i])}</em>` : "")).join("") : `<div class="hint stk-none">Пока никто не играл — стань первым</div>`}</div>
    ${d.last && d.last.length ? `<div class="sec-t">${ic("award")}Победители прошлой недели</div><div class="box stk-top">${d.last.map((x, i) => row(x, i, `<em>+${short(x.prize)}</em>`)).join("")}</div>` : ""}
    <div class="disc">Без ставок и бесплатно — сколько угодно попыток. В зачёт идёт лучший результат недели (пн–вс по Москве). Результат проверяет сервер.</div>`;
  starify(info);
}

// ---------------- сцена ----------------
function stkScene(el) {
  const cv = el.querySelector("#stk-cv"), box = el.querySelector("#stk-play");
  const S = { cv, ctx: cv.getContext("2d"), box, w: 0, h: 0, dpr: 1, cam: 0, raf: 0, bg: null, falls: [], flash: 0 };
  const size = () => {
    const r = box.getBoundingClientRect(); if (!r.width) return;
    S.dpr = Math.min(2, devicePixelRatio || 1); S.w = r.width; S.h = r.height;
    cv.width = Math.round(S.w * S.dpr); cv.height = Math.round(S.h * S.dpr);
    S.ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    S.bg = null; stkDraw();
  };
  STK.S = S;
  requestAnimationFrame(size);
  if (window.ResizeObserver) { const ro = new ResizeObserver(size); ro.observe(box); el._ro = ro; const oc = el._onClose; el._onClose = () => { ro.disconnect(); oc && oc(); }; }
  box.addEventListener("pointerdown", e => { if (e.button > 0) return; e.preventDefault(); stkTap(e.timeStamp); });
}

// звёзды на фоне рисуем один раз в офскрин-канвас (дёшево на каждом кадре)
function stkBg(S) {
  const c = document.createElement("canvas"); c.width = S.cv.width; c.height = S.cv.height;
  const x = c.getContext("2d"); x.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  for (let i = 0; i < 46; i++) {
    const r = Math.random();
    x.globalAlpha = .25 + r * .55; x.fillStyle = "#fff";
    x.beginPath(); x.arc(Math.random() * S.w, Math.random() * S.h, .6 + r * 1.2, 0, 7); x.fill();
  }
  return c;
}

function stkBlock(ctx, x, y, w, hue, alpha = 1) {
  if (w <= 0) return;
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, y, 0, y + STK_BH);
  g.addColorStop(0, `hsl(${hue} 85% 66%)`); g.addColorStop(1, `hsl(${hue} 75% 46%)`);
  ctx.fillStyle = g;
  const r = Math.min(5, w / 2);
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, STK_BH - 2, r) : ctx.rect(x, y, w, STK_BH - 2); ctx.fill();
  ctx.fillStyle = `hsl(${hue} 95% 82%)`; ctx.fillRect(x + r, y, Math.max(0, w - 2 * r), 3);   // блик сверху
  if (w > 18) { ctx.fillStyle = "rgba(255,255,255,.38)"; ctx.fillRect(x + w / 2 - Math.min(5, w * .06), y, Math.min(10, w * .12), STK_BH - 2); }   // лента подарка
  ctx.globalAlpha = 1;
}

function stkDraw(now) {
  const S = STK.S; if (!S || !S.w) return;
  const ctx = S.ctx, run = STK.run, c = run ? run.cfg : { F: 1000, OVER: 160, W0: 340 };
  const sc = S.w / (c.F + 2 * c.OVER), px = x => (x + c.OVER) * sc;
  const n = run ? run.tower.length - 1 : 0;
  // камера плавно едет за верхушкой: верхний блок держим на ~55% высоты
  const want = Math.max(0, (n + 2) * STK_BH - S.h * .55);
  S.cam += (want - S.cam) * .14;
  const hue = stkHue(n);
  const g = ctx.createLinearGradient(0, 0, 0, S.h);
  g.addColorStop(0, `hsl(${(hue + 200) % 360} 55% 14%)`); g.addColorStop(1, `hsl(${(hue + 230) % 360} 60% 26%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, S.w, S.h);
  if (!S.bg) S.bg = stkBg(S);
  ctx.globalAlpha = .9; ctx.drawImage(S.bg, 0, (S.cam * .25) % S.h - S.h, S.w, S.h); ctx.drawImage(S.bg, 0, (S.cam * .25) % S.h, S.w, S.h); ctx.globalAlpha = 1;
  const yOf = k => S.h - 30 - (k + 1) * STK_BH + S.cam;
  // пьедестал
  const by = yOf(-1) + STK_BH - 2;
  if (by < S.h) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(px(c.F / 2 - c.W0 * .75), by, c.W0 * 1.5 * sc, S.h - by); }
  const tower = run ? run.tower : [[(c.F - c.W0) / 2, c.W0]];
  const k0 = Math.max(0, Math.floor((S.cam - 40) / STK_BH) - 1);
  for (let k = k0; k < tower.length; k++) { const y = yOf(k); if (y > S.h) continue; if (y < -STK_BH) break; stkBlock(ctx, px(tower[k][0]), y, tower[k][1] * sc, stkHue(k)); }
  // едущий блок
  if (run && run.live) {
    const e = Math.max(0, Math.floor((now || performance.now()) - run.t0)), w = tower[tower.length - 1][1];
    stkBlock(ctx, px(stkX(c, run.off[n], n + 1, w, e)), yOf(n + 1), w * sc, stkHue(n + 1));
  }
  // отрезанные куски падают
  S.falls = S.falls.filter(f => f.y < S.h + 60 && f.a > .02);
  for (const f of S.falls) { f.vy += .55; f.y += f.vy; f.a *= .975; stkBlock(ctx, f.x, f.y, f.w, f.hue, f.a); }
  if (S.flash > .01) {   // вспышка «идеально»
    const t = tower[tower.length - 1], y = yOf(tower.length - 1);
    ctx.strokeStyle = `rgba(255,255,255,${S.flash})`; ctx.lineWidth = 2;
    const grow = (1 - S.flash) * 14;
    ctx.strokeRect(px(t[0]) - grow, y - grow, t[1] * sc + grow * 2, STK_BH - 2 + grow * 2);
    S.flash *= .9;
  }
}

function stkLoop() {
  const S = STK.S; if (!S || !S.cv.isConnected) return;
  cancelAnimationFrame(S.raf);
  const f = now => {
    if (!S.cv.isConnected) return;
    stkDraw(now);
    const busy = (STK.run && STK.run.live) || S.falls.length || S.flash > .01 || Math.abs(S.cam - Math.max(0, ((STK.run ? STK.run.tower.length : 1) + 1) * STK_BH - S.h * .55)) > .5;
    if (busy) S.raf = requestAnimationFrame(f); else S.raf = 0;   // в покое кадры не крутим
  };
  S.raf = requestAnimationFrame(f);
}

// ---------------- партия ----------------
async function stkStart() {
  if (STK.busy) return;
  STK.busy = true;
  let r;
  try { r = await post("stack/start"); } catch (e) { STK.busy = false; return; } finally { STK.busy = false; }
  if (!$("#stk-cv")) return;
  const c = r.cfg;
  STK.run = { id: r.id, off: r.off, cfg: c, tower: [[(c.F - c.W0) / 2, c.W0]], taps: [], streak: 0, perfect: 0, live: true, t0: performance.now() + 450 };
  STK.S.falls = []; STK.S.flash = 0;
  $("#stk-score").textContent = "0"; $("#stk-score").classList.add("on");
  stkOverlay(null);
  H.imp("medium");
  stkLoop();
}

function stkTap(ts) {
  const run = STK.run; if (!run || !run.live) return;
  const c = run.cfg, t = ts && ts > 0 && Math.abs(ts - performance.now()) < 1000 ? ts : performance.now();
  const e = Math.round(t - run.t0);
  if (e < c.MIN_E) return;   // слишком рано после прошлого блока — тап не считаем
  if (e > 60000) return stkOver();
  const n = run.tower.length - 1, [pl, pw] = run.tower[n], i = n + 1, w = pw;
  const x = stkX(c, run.off[n], i, w, e);
  run.taps.push(e); run.t0 += e;
  const S = STK.S, sc = S.w / (c.F + 2 * c.OVER), y = S.h - 30 - (i + 1) * STK_BH + S.cam;
  if (Math.abs(x - pl) <= c.PERFECT) {
    run.streak++; run.perfect++;
    const nw = run.streak >= c.GROW_AFTER ? Math.min(c.W0, pw + c.GROW) : pw;
    run.tower.push([pl, nw]);
    S.flash = 1; H.ok();
    stkPop(run.streak >= c.GROW_AFTER ? "Идеально! +ширина" : run.streak > 1 ? `Идеально ×${run.streak}` : "Идеально!");
  } else {
    const lo = Math.max(x, pl), hi = Math.min(x + w, pl + pw);
    if (hi - lo <= 0) {   // мимо башни — блок падает целиком
      S.falls.push({ x: (x + c.OVER) * sc, y, w: w * sc, vy: 0, a: 1, hue: stkHue(i) });
      return stkOver();
    }
    // отрезанный кусок
    const cutX = x < pl ? x : hi, cutW = w - (hi - lo);
    if (cutW > 0) S.falls.push({ x: (cutX + c.OVER) * sc, y, w: cutW * sc, vy: -1, a: 1, hue: stkHue(i) });
    run.tower.push([lo, hi - lo]); run.streak = 0;
    H.imp("light");
  }
  const sEl = $("#stk-score"); sEl.textContent = run.tower.length - 1; sEl.classList.remove("bump"); void sEl.offsetWidth; sEl.classList.add("bump");
  stkLoop();
}

function stkPop(text) {
  const p = $("#stk-pop"); if (!p) return;
  p.textContent = text; p.classList.remove("on"); void p.offsetWidth; p.classList.add("on");
}

async function stkOver() {
  const run = STK.run; if (!run || !run.live) return;
  run.live = false; H.err();
  const score = run.tower.length - 1;
  stkLoop();
  stkOverlay("wait", score);
  let r = null;
  for (let a = 0; a < 3 && !r; a++) { try { r = await post("stack/finish", { id: run.id, taps: run.taps }); } catch (e) { if (e && e.status && e.status !== "dup") break; await sleep(800); } }
  if (STK.run !== run || !$("#stk-ov")) return;
  if (!r) return stkOverlay("over", score, { err: true });
  stkOverlay("over", r.score, r);
  if (r.newBest && r.score) { H.ok(); burstAt($("#stk-score")); }
  stkLoad(r);
}

function stkOverlay(kind, score, r) {
  const ov = $("#stk-ov"); if (!ov) return;
  if (!kind) { ov.className = "stk-ov"; ov.innerHTML = ""; return; }
  const d = STK.d;
  ov.className = "stk-ov on";
  if (kind === "start") ov.innerHTML = `<div class="stk-card"><b class="stk-big">Тапни, чтобы поставить блок</b>
      <span>Что свисает — отрезается. Ровно в край — «идеально»: три подряд расширяют блок</span>
      <button class="btn gold" data-act="stk-go">${ic("play")}Играть</button></div>`;
  else if (kind === "wait") ov.innerHTML = `<div class="stk-card"><span>Этажей</span><b class="stk-big">${score}</b><span>Проверяем результат…</span></div>`;
  else {
    const left = d ? Math.max(0, d.min - (r.week || 0)) : 0;
    ov.innerHTML = `<div class="stk-card"><span>${r.rejected ? "Результат не засчитан" : r.err ? "Нет связи — результат не отправлен" : r.newBest && score ? "Новый рекорд недели!" : "Этажей"}</span>
      <b class="stk-big">${score}</b>
      ${!r.err && !r.rejected ? `<span>${r.rank ? `Место в турнире: <b>#${r.rank}</b>` : ""}${left ? `${r.rank ? " · " : ""}до призовой зоны ещё ${left}` : ""}</span>` : ""}
      <button class="btn gold" data-act="stk-go">${ic("refresh")}Ещё раз</button></div>`;
  }
}

Object.assign(ACT, { "stk-go": () => stkStart() });
