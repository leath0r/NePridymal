"use strict";
// ============================================================
//  За Telegram Stars: «Набор дня», «Звёздный сундук», VIP. Карточки — в окне баланса и в листалке на главной.
// ============================================================
let PREM = null, PREM_T = 0;
async function loadPrem(force) {
  if (!force && PREM && Date.now() - PREM_T < 60000) return PREM;
  try { PREM = await api("premium"); PREM_T = Date.now(); PREM._off = PREM.now - Date.now() / 1000; } catch (e) {}
  return PREM;
}
const premLeft = ends => { const s = Math.max(0, ends - (Date.now() / 1000 + (PREM ? PREM._off : 0))), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `${h} ч ${String(m).padStart(2, "0")} мин`; };
const vipLeft = u => { const d = Math.ceil((u - Date.now() / 1000) / 86400); return `${d} ${plural(d, ["день", "дня", "дней"])}`; };
function premHTML() {
  if (!PREM) return "";
  const o = PREM.offer, c = PREM.chest, v = PREM.vip;
  return `<div class="pr-wrap">
    ${o.bought ? "" : `<div class="pr-offer"><div class="pr-tag">Набор дня · ещё ${premLeft(o.ends)}</div>
      <div class="pr-o-body"><img src="${A.orig(o.case.cover, 128)}" alt=""><div class="grow"><b>${fmt(o.stars)} ⭐</b>
        <span>+ ключ от кейса «${esc(o.case.title)}» (⭐ ${short(o.case.price)})</span>
        <em>выгода ×${((o.stars + o.case.price) / (o.xtr * 1000)).toFixed(1).replace(".", ",")} к обычному курсу</em></div></div>
      <button class="btn gold" data-act="prem-buy" data-k="offer">Купить за ${tgPrice(o.xtr)}</button></div>`}
    <div class="pr-chest"><div class="pr-c-top"><div class="pr-c-ic"><img src="${A.orig("Plush Pepe", 128)}" alt=""></div><div class="grow"><b>Звёздный сундук</b>
      <span>Только за Telegram Stars. Подарок из топ-коллекций с редкой моделью — в среднем ⭐ ${short(c.ev)}</span></div></div>
      <div class="pr-c-cols">${c.cols.map(x => `<div><img src="${A.orig(x.col, 64)}" alt=""><b>${Math.round(x.p * 100)}%</b><span>~${short(x.ev)}</span></div>`).join("")}</div>
      <button class="btn pr-c-btn" data-act="prem-buy" data-k="chest">Открыть за ${tgPrice(c.xtr)}</button></div>
    ${vipCardHTML(v)}
  </div>`;
}
const vipDate = ts => new Date(ts * 1000).toLocaleDateString(LANG === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long" });
function vipCardHTML(v) {
  const s = v.sub || {}, perks = `<span>Бонус дня ×2 · бесплатный кейс вдвое чаще · комиссия маркета −50% · золотая рамка и значок</span>`;
  if (s.active) return `<div class="pr-vip on sub"><span class="pr-v-badge">VIP</span><div class="grow"><b>${s.cancelled ? `VIP до ${vipDate(v.until)}` : `VIP-подписка · списание ${vipDate(s.expires)}`}</b>
      <span>${s.cancelled ? "Автопродление отключено — после этой даты VIP закончится" : `${fmt(v.subXtr)} Telegram Stars в месяц, отключить можно в любой момент`}</span></div>
      <button class="btn sm ${s.cancelled ? "gold" : "ghost"}" data-act="prem-sub" data-v="${s.cancelled ? 0 : 1}">${s.cancelled ? "Включить снова" : "Отключить"}</button></div>`;
  return `<div class="pr-vip${v.until ? " on" : ""}"><span class="pr-v-badge">VIP</span><div class="grow"><b>${v.until ? `VIP активен ещё ${vipLeft(v.until)}` : "VIP"}</b>${perks}</div>
      <div class="pr-v-btns"><button class="btn sm gold" data-act="prem-buy" data-k="vipsub">Подписка · ${tgPrice(v.subXtr)}<small>в месяц, продлевается сама</small></button>
      <button class="btn sm ghost" data-act="prem-buy" data-k="vip">${v.until ? "Продлить" : "На"} ${v.days} ${plural(v.days, ["день", "дня", "дней"])} · ${tgPrice(v.xtr)}</button></div></div>`;
}
async function premSub(el) {
  const cancel = el.dataset.v === "1";
  if (cancel && !await confirmM("Отключить автопродление?", "Оплаченный VIP останется до конца периода, дальше списаний не будет. Включить снова можно в любой момент.", "Отключить")) return;
  el.disabled = true;
  try {
    await post("premium/sub", { cancel });
    H.ok(); toast(cancel ? "Автопродление отключено" : "Автопродление включено", "ok");
    await loadPrem(true); premRefresh();
  } catch (e) { el.disabled = false; }
}
// выключенное в админке («Продажи») не показываем
const _premHTML0 = premHTML;
premHTML = function () {
  const h = _premHTML0();
  if (!PREM) return h;
  const t = document.createElement("template"); t.innerHTML = h;
  if (PREM.chest.on === false) { const x = t.content.querySelector(".pr-chest"); if (x) x.remove(); }
  if (PREM.vip.on === false) { const x = t.content.querySelector(".pr-vip"); if (x) x.remove(); }
  const w = t.content.querySelector(".pr-wrap");
  return w && w.children.length ? t.innerHTML : "";
};
// окно баланса: платные предложения над пакетами
const _sfPrem = shopFill;
shopFill = async function () {
  await Promise.all([_sfPrem(), loadPrem()]);
  const box = $("#shop-box"); if (!box || !PREM || box.querySelector(".pr-wrap")) return;
  const sh = box.querySelector(".shop-first") || box.querySelector(".shop-h"), ph = premHTML();   // после «×2 первая покупка», если есть
  if (ph) { const h = `<div class="sec-t">${ic("crown")}Особые предложения</div>` + ph; sh ? sh.insertAdjacentHTML("afterend", h) : box.insertAdjacentHTML("afterbegin", h); }
  starify(box);
};
async function premBuy(k, el) {
  if (!inTg || !tg.openInvoice) return toast("Покупка доступна только в Telegram");
  if (el) el.disabled = true;
  const lastChest = PREM && PREM.chest ? PREM.chest.last : 0;
  try {
    const r = await post("premium/invoice", { k });
    tg.openInvoice(r.link, async status => {
      if (status === "failed") return toast("Оплата не прошла");
      if (status !== "paid") return;
      H.ok();
      if (k === "chest") return chestReveal(lastChest);
      toast(k === "vipsub" ? "VIP-подписка оформлена!" : k === "vip" ? "VIP активирован!" : "Набор дня зачислен!", "ok");
      for (let i = 0; i < 8; i++) { await sleep(1200); await loadMe(); if (!k.startsWith("vip") || ME.vip) break; }
      coinShower($("#bal"), 50); burst(innerWidth / 2, innerHeight / 3, ["#ffd76a", "#ffab2e", "#fff"]);
      await loadPrem(true); premRefresh();
    });
  } catch (e) {} finally { if (el) el.disabled = false; }
}
async function chestReveal(after) {
  const el = openSheet(`<div class="pr-reveal"><div class="pr-r-glow"></div><div class="pr-r-box">${emptyHTML("hourglass", "Открываем сундук…")}</div></div>`, "prr-s");
  let g = null;
  for (let i = 0; i < 12 && !g; i++) { await sleep(1000); g = (await api(`premium/chest/${after}`).catch(() => ({}))).gift; }
  if (!el.isConnected) return;
  if (!g) { replaceSheet(el, emptyHTML("gift", "Оплата прошла — подарок придёт в сумку через минуту")); return; }
  replaceSheet(el, `<div class="pr-reveal on"><div class="pr-r-glow"></div><span class="pr-r-t">Звёздный сундук</span>
    <div class="pr-r-gift">${giftHTML(g)}</div><h2>${esc(g.col)}</h2><p>«${esc(g.model)}» · ${esc(g.backdrop)}</p><b class="pr-r-v">⭐ ${fmt(g.value)}</b>
    <div class="btns"><button class="btn ghost" data-act="close">В сумку</button><button class="btn gold" data-act="prem-buy" data-k="chest">${ic("tgplane")}Ещё один</button></div></div>`);
  starify(el); startLottie(el);
  H.ok(); burst(innerWidth / 2, innerHeight / 2.6, ["#ffd76a", "#ffab2e", "#fff", "#ff6fb5"]); setTimeout(() => burst(innerWidth / 2, innerHeight / 2.6, ["#7cc2ff", "#ffd76a", "#fff"]), 350);
  if (typeof sfx === "function") try { sfx("win"); } catch (e) {}
  await loadPrem(true); MYP = null;
}
function premRefresh() {
  const box = $("#shop-box"), w = box && box.querySelector(".pr-wrap");
  if (w) {
    const h = premHTML(), t = w.previousElementSibling;
    if (!h && t && t.classList.contains("sec-t")) t.remove();   // предложений не осталось — убрать и заголовок
    w.outerHTML = h; starify(box);
  }
  if (TAB === "cases") casesTidy();
}
// карточка «Набор дня» в листалке
function offerCard() {
  if (!PREM || PREM.offer.bought || !inTg) return "";
  const o = PREM.offer;
  return `<button class="stc st-offer" data-act="qb-all"><span class="stc-i"><img src="${A.orig(o.case.cover, 64)}" alt=""></span><span class="stc-t"><b>Набор дня: ${short(o.stars)} ⭐ + ключ «${esc(o.case.title)}»</b>
    <small>${fmt(o.xtr)} Telegram Stars · исчезнет через ${premLeft(o.ends)}</small></span>${ic("chev")}</button>`;
}
// VIP: значок в профиле
const _phPrem = profileHTML;
profileHTML = function (p, tab) {
  const h = _phPrem(p, tab);
  return p.vip ? h.replace('<span class="plv">', '<span class="vipb">VIP</span><span class="plv">') : h;   // теги справа от аватара
};
Object.assign(ACT, { "prem-buy": el => premBuy(el.dataset.k, el), "prem-sub": el => premSub(el) });
if (LANG === "en") i18nAdd({
  "Подписка": "Subscription", "в месяц, продлевается сама": "per month, renews automatically", "Продлить": "Extend", "На": "For",
  "Отключить": "Turn off", "Включить снова": "Turn on again", "Автопродление отключено": "Auto-renewal is off", "Автопродление включено": "Auto-renewal is on",
  "Отключить автопродление?": "Turn off auto-renewal?", "Telegram Stars в месяц, отключить можно в любой момент": "Telegram Stars a month, cancel any time",
  "Автопродление отключено — после этой даты VIP закончится": "Auto-renewal is off, VIP ends on that date",
  "Оплаченный VIP останется до конца периода, дальше списаний не будет. Включить снова можно в любой момент.": "Your paid VIP stays until the end of the period, then no more charges. You can turn it on again any time.",
  "VIP-подписка оформлена!": "VIP subscription is on!", "VIP-подписка уже оформлена": "VIP subscription is already active", "VIP-подписка · списание": "VIP subscription · next charge", "VIP до": "VIP until",
});
