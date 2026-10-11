"use strict";
// ============================================================
//  Доход: подарки приносят звёзды, бизнесы, сейф
// ============================================================
let INC = null, incTick = null;
// сколько накопилось прямо сейчас (между запросами досчитываем по скорости)
function incLive() {
  if (!INC) return { gifts: 0, biz: 0 };
  const dt = Math.max(0, Date.now() / 1000 + INC.off - INC.now), g = INC.gifts;
  const capLeft = Math.max(0, g.since + g.cap - INC.now);
  const gifts = g.exact + g.perDay / 86400 * Math.min(dt, capLeft);
  const biz = INC.biz.reduce((s, b) => s + (b.level ? Math.min(b.cap, b.accrued + b.income / 3600 * dt) : 0), 0);
  return { gifts, biz };
}
const fmt1 = v => v < 10 ? v.toFixed(2).replace(".", ",") : v < 100 ? v.toFixed(1).replace(".", ",") : fmt(Math.floor(v));
function incPaintLive() {
  if (!INC) return;
  const L = incLive(), total = L.gifts + L.biz;
  document.querySelectorAll("[data-live=total]").forEach(e => e.textContent = "⭐ " + fmt1(total));
  document.querySelectorAll("[data-live=gifts]").forEach(e => e.textContent = "⭐ " + fmt1(L.gifts));
}
clearInterval(incTick); incTick = setInterval(incPaintLive, 1000);
async function loadInc() {
  try { INC = await api("income"); INC.off = INC.now - Date.now() / 1000; } catch (e) { return; }
  document.querySelectorAll(".incbar").forEach(paintIncBar);
  for (const s of SHEETS) if (s._inc) fillInc(s);
}
function paintIncBar(el) {
  if (!INC) return;
  const full = INC.gifts.full || INC.biz.some(b => b.full);
  el.classList.toggle("full", full);
  el.innerHTML = `<span class="inc-i">${ic("wallet")}</span><span class="inc-t"><b>Доход · готово <span data-live="total">⭐ ${fmt(INC.ready)}</span></b>
    <small>${full ? "копилка полная — забери, пока не простаивает" : `коллекция ⭐ ${short(INC.gifts.perDay)}/день${INC.biz.some(b => b.level) ? ` · бизнесы ⭐ ${short(INC.biz.reduce((s, b) => s + (b.level ? b.income : 0), 0))}/час` : ""}`}</small></span>${ic("chev")}`;
}
async function openInc() {
  H.imp("light");
  const el = openSheet(`<div id="inc-body">${emptyHTML("hourglass", "Считаем доход…")}</div>`, "inc-s");
  el._inc = true;
  await loadInc();
  el._t = setInterval(() => el.isConnected ? loadInc() : clearInterval(el._t), 30000);
}
function fillInc(el) {
  if (!INC || !el.isConnected) return;
  const g = INC.gifts, t = INC.now, fillPct = Math.min(100, (t - g.since) / g.cap * 100);
  const hrs = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} ч ${m} мин` : `${m} мин`; };
  el.querySelector("#inc-body").innerHTML = `
    <div class="inchero"><span>Готово к сбору</span><b data-live="total">⭐ ${fmt(INC.ready)}</b>
      <div class="incrate">${ic("trend")}+⭐ ${fmt1(g.perDay / 24 + INC.biz.reduce((s, b) => s + (b.level ? b.income : 0), 0))} в час</div>
      <button class="btn cta gold" data-act="inc-collect">${ic("coins")}Забрать всё</button>
      <small>Копилки наполняются сами: коллекция — до 12 часов, бизнесы — до 8 часов. Заходи забирать, чтобы доход не простаивал.</small></div>

    <div class="sec-t">${ic("gift")}Доход с коллекции</div>
    <div class="inccard"><div class="ic-row"><div><b>+⭐ ${perHourTxt(g.perDay / 24)} в час</b><span>каждый подарок в инвентаре приносит 2% своей ценности в сутки · легендарные ×2, эпики ×1,5 · всего ⭐ ${fmt(g.perDay)} в день</span></div><em data-live="gifts">⭐ ${fmt(g.accrued)}</em></div>
      <div class="cbar big"><div style="width:${fillPct}%"></div></div>
      <div class="ic-sub">${g.full ? "Копилка полная — забери доход" : `заполнится через ${hrs(g.since + g.cap - t)}`}</div>
      ${g.perDay ? "" : `<div class="hint" style="font-size:12.5px;margin-top:6px">Открой кейсы — подарки в инвентаре начнут приносить звёзды</div>`}</div>

    <div class="sec-t">${ic("store")}Бизнесы</div>
    <div class="bizg">${INC.biz.map(b => {
      const owned = b.level > 0, pct = owned ? Math.min(100, b.accrued / Math.max(1, b.cap) * 100) : 0, col = BIZ_COL[b.id] || "#16b874";
      return `<div class="biz${owned ? " own" : ""}${b.full ? " full" : ""}" style="--bc:${col}">
        <div class="biz-ped"><img src="${A.orig(b.col, 128)}" alt="">${owned ? `<i class="bcoin"></i><i class="bcoin d2"></i>` : `<span class="biz-lock">${ic("lock")}</span>`}</div>
        <b>${esc(b.name)}</b>
        ${owned ? `<div class="biz-lv">${Array.from({ length: 10 }, (_, i) => `<i class="${i < b.level ? "on" : ""}"></i>`).join("")}</div>` : ""}
        <span class="biz-inc">+⭐ ${short(b.income)}<small>/час</small></span>
        ${owned ? `<div class="biz-bar"><div style="width:${pct}%"></div></div><span class="ba">${b.full ? "копилка полная!" : `⭐ ${short(b.accrued)} / ${short(b.cap)}`}</span>` : `<span class="ba">окупится за ~${Math.round(b.price / b.income)} ч</span>`}
        ${owned ? (b.shiftIn ? `<span class="bshift wait">${ic("clock")}смена через ${clock(b.shiftIn)}</span>`
          : `<button class="btn sm green bshift" data-act="biz-shift" data-id="${b.id}">${ic("flame")}Смена: до ⭐ ${short(b.income)}</button>`) : ""}
        ${!owned ? `<button class="btn sm gold" data-act="biz-buy" data-id="${b.id}">Купить · ⭐ ${short(b.price)}</button>`
          : b.upgrade ? `<button class="btn sm ghost" data-act="biz-buy" data-id="${b.id}">${ic("trend")}⭐ ${short(b.upgrade)} → ${short(b.next)}/ч</button>`
          : `<button class="btn sm ghost" disabled>Макс. уровень</button>`}</div>`;
    }).join("")}</div>

    <div class="sec-t">${ic("lock")}Сейф</div>
    <div class="inccard"><div class="hint" style="font-size:13px;margin-bottom:10px">Положи подарки на срок — получишь процент от их ценности, подарки вернутся. Пока в сейфе — их нельзя продать или поставить. Забрать раньше можно, но без награды.</div>
      <div class="vplans">${INC.vaultPlans.map(p => `<button data-act="vault-put" data-d="${p.days}"><b>+${Math.round(p.pct * 100)}%</b><span>${p.days} ${plural(p.days, ["день", "дня", "дней"])}</span></button>`).join("")}</div></div>
    ${INC.vault.length ? `<div class="box" style="margin-top:8px">${INC.vault.map(v => `<div class="row vrow">
      <div class="vg">${giftHTML(v.gift, { lite: true, plain: true })}</div><div class="grow"><div class="t">${esc(v.gift.col)}</div>
      <div class="s">${v.ready ? `готово · +⭐ ${fmt(v.reward)}` : `+⭐ ${fmt(v.reward)} через ${hrs(v.until - t)}`}</div>
      <div class="cbar"><div style="width:${Math.min(100, (t - v.start) / (v.until - v.start) * 100)}%"></div></div></div>
      <button class="btn sm ${v.ready ? "green" : "ghost"}" data-act="vault-take" data-id="${v.gift.id}" data-ready="${v.ready ? 1 : 0}">${v.ready ? "Забрать" : "Досрочно"}</button></div>`).join("")}</div>` : ""}
    <div class="disc">Доход начисляется игровыми звёздами. ${esc(ME.disclaimer)}</div>`;
}
const _rc2 = renderCases;
renderCases = async function () {
  await _rc2();
  const v = $("#v-cases"), p = v && v.querySelector(".promo");
  if (p && !v.querySelector(".incbar")) p.insertAdjacentHTML("afterend", `<button class="incbar" data-act="inc"></button>`);
  loadInc();
};
setInterval(() => { if (TAB === "cases") loadInc(); }, 60000);

Object.assign(ACT, {
  inc: () => openInc(),
  "inc-collect": async el => {
    if (incLive().gifts + incLive().biz < 1) return toast("Пока накопилось меньше звезды — загляни чуть позже");
    const r = await post("income/collect"); setStars(r.stars); H.ok(); toast(`+⭐ ${fmt(r.got)} дохода${r.tax ? ` (налог 3% в банк: ⭐ ${fmt(r.tax)})` : ""}`, "ok"); burstAt(el);
    await loadInc();
  },
  "biz-shift": el => bizShift(INC.biz.find(x => x.id === el.dataset.id)),
  "biz-tap": el => bizTap(el),
  "biz-buy": async el => {
    const b = INC.biz.find(x => x.id === el.dataset.id), cost = b.level ? b.upgrade : b.price;
    if (cost > ME.stars) return toast("Не хватает звёзд ⭐");
    if (!await confirmM(b.level ? "Прокачать?" : "Купить бизнес?", b.level
      ? `${esc(b.name)} → ${b.level + 1} ур.: доход ⭐ ${fmt(b.income)} → ⭐ ${fmt(b.next)} в час за ⭐ ${fmt(cost)}. Накопленное заберётся автоматически.`
      : `${esc(b.name)} за ⭐ ${fmt(cost)} — будет приносить ⭐ ${fmt(b.income)} в час (копится до 8 часов).`, b.level ? "Прокачать" : "Купить")) return;
    const r = await post(`biz/${b.id}/buy`); setStars(r.stars); H.ok(); toast(b.level ? "Бизнес прокачан" : "Бизнес куплен", "ok"); burstAt(el);
    await loadInc(); afterLevelUp(r.levelup);
  },
  "vault-put": el => {
    const days = +el.dataset.d;
    pickGifts(`В сейф на ${days} ${plural(days, ["день", "дня", "дней"])}`, { max: 10 }, async gs => {
      await post("vault/put", { gifts: gs.map(g => g.id), days }); H.ok(); toast(`В сейфе: ${gs.length} ${plural(gs.length, ["подарок", "подарка", "подарков"])}`, "ok");
      MYP = null; await loadInc();
    });
  },
  "vault-take": async el => {
    if (el.dataset.ready !== "1" && !await confirmM("Забрать досрочно?", "Подарок вернётся, но награду за срок не получишь.", "Забрать")) return;
    const r = await post(`vault/${el.dataset.id}/take`); if (r.reward) { setStars(r.stars); H.ok(); toast(`+⭐ ${fmt(r.reward)} за сейф`, "ok"); } else toast("Подарок вернулся в инвентарь", "ok");
    MYP = null; await loadInc();
  },
});

// цвет карточки каждого бизнеса
const BIZ_COL = { stall: "#ff6fb5", coffee: "#c98a5a", bakery: "#ffb35c", flowers: "#ff8fb8", jewelry: "#4fd6c6", cinema: "#a77bff",
  club: "#ff5c9a", durov: "#4aa8ff", casino: "#ffc53d", space: "#6a7dff", pepe: "#35d07f" };
// ------------------------------------------------------------ «Смена»: 10 секунд тапаешь по бизнесу — до часа его дохода
let SHIFT = null;
function bizShift(b) {
  if (!b) return;
  SHIFT = { b, taps: 0, left: 10, started: false, done: false };
  const el = openSheet(`<div class="shift">
      <h2 class="gtitle" style="text-align:center">${esc(b.name)}</h2>
      <p class="hint" style="text-align:center;margin:-6px 0 10px">Тапай по бизнесу как можно быстрее — 10 секунд. ${b.income ? `40 тапов = ⭐ ${fmt(b.income)}` : ""}</p>
      <div class="shift-ring" style="--p:0"><button class="shift-btn" data-act="biz-tap"><img src="${A.orig(b.col, 256)}" alt=""></button></div>
      <div class="shift-stats"><div><span>Тапов</span><b id="sh-taps">0 / 40</b></div><div><span>Время</span><b id="sh-time">10,0</b></div><div><span>Заработано</span><b id="sh-got">⭐ 0</b></div></div>
      <div class="hint" id="sh-tip" style="text-align:center;margin-top:10px">Первый тап — старт</div></div>`, "shift-s");
  el._onClose = () => { if (SHIFT && SHIFT.started && !SHIFT.done) bizShiftEnd(); };
  starify(el);
}
function bizTap(btn) {
  const S = SHIFT; if (!S || S.done) return;
  if (!S.started) {
    S.started = true; S.t0 = performance.now();
    $("#sh-tip").textContent = "Жми, жми, жми!";
    (function tick() {
      if (!SHIFT || SHIFT.done) return;
      const left = Math.max(0, 10 - (performance.now() - S.t0) / 1000);
      const t = $("#sh-time"); if (t) t.textContent = left.toFixed(1).replace(".", ",");
      if (left <= 0) return bizShiftEnd();
      requestAnimationFrame(tick);
    })();
  }
  S.taps++;
  H.imp(S.taps % 5 ? "light" : "medium");
  const k = Math.min(1, S.taps / 40), got = Math.floor(S.b.income * k);
  $("#sh-taps").textContent = `${Math.min(S.taps, 40)} / 40`;
  $("#sh-got").textContent = "⭐ " + fmt(got); starify($("#sh-got"));
  $(".shift-ring").style.setProperty("--p", k * 100);
  btn.classList.remove("hit"); void btn.offsetWidth; btn.classList.add("hit");
  const r = btn.getBoundingClientRect(), f = document.createElement("b");
  f.className = "shift-pop"; f.textContent = "+" + short(Math.max(1, Math.round(S.b.income / 40)));
  f.style.left = r.left + r.width * (.25 + Math.random() * .5) + "px"; f.style.top = r.top + r.height * .3 + "px";
  document.body.appendChild(f); setTimeout(() => f.remove(), 800);
  if (S.taps === 40) { H.ok(); coinShower(btn, 40); $("#sh-tip").textContent = "Максимум! Можно продолжать до конца смены"; }
}
async function bizShiftEnd() {
  const S = SHIFT; if (!S || S.done) return;
  S.done = true;
  try {
    const r = await post(`biz/${S.b.id}/shift`, { taps: S.taps });
    setStars(r.stars); H.ok();
    const tip = $("#sh-tip");
    if (tip) { tip.innerHTML = `<b style="color:var(--green);font-size:17px">Смена окончена: +⭐ ${fmt(r.got)}</b>`; starify(tip); coinShower($(".shift-btn"), Math.min(60, 10 + r.taps)); }
    else toast(`Смена: +⭐ ${fmt(r.got)}`, "ok");
  } catch (e) {}
  INC = null; if (typeof loadInc === "function") loadInc();
}
