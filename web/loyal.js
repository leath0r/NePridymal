"use strict";
// ============================================================
//  Программа лояльности: очки за оборот ставок (независимо от исхода), уровни бронза/серебро/золото и магазин очков.
//  Плитка «Очки» в профиле → окно: баланс очков, уровень и прогресс, как копить, магазин (ключи от кейсов, рамки), история.
// ============================================================
ICONS.key = ICONS.key || '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l2.5 2.5M14.5 8.5l2 2"/>';
const LOY_FR_EN = { neon: "Neon", fire: "Flame", loyal: "Regular" };
const LOY_TIER = { bronze: ["Бронза", "Бронзовый уровень"], silver: ["Серебро", "Серебряный уровень"], gold: ["Золото", "Золотой уровень"] };
const loyPts = n => `${fmt(n)} ${plural(n, ["очко", "очка", "очков"])}`;
const loyT = (ru, en) => LANG === "en" ? en : ru;
let LOY = null;

function loyHTML(d) {
  const t = LOY_TIER[d.tier] || LOY_TIER.bronze;
  const base = d.tier === "silver" ? d.silver : d.tier === "gold" ? d.gold : 0;
  const pct = d.next ? Math.min(100, Math.round((d.total - base) / (d.next - base) * 100)) : 100;
  const mult = d.mult === 1 ? "" : ` · <b>+${Math.round((d.mult - 1) * 100)}%</b> ${loyT("к начислению", "to earnings")}`;
  const todayLeft = Math.max(0, d.dayCap - d.today);
  return `<h2 class="gtitle">${loyT("Очки лояльности", "Loyalty points")}</h2>
    <div class="loy-hero t-${d.tier}"><div class="loy-pts"><b>${fmt(d.pts)}</b><span>${plural(d.pts, ["очко", "очка", "очков"])}</span></div>
      <div class="loy-tier">${ic("award")}<div><b>${t[0]}</b><span>${loyT("уровень", "tier")}${mult}</span></div></div></div>
    ${d.next ? `<div class="loy-bar"><i style="width:${pct}%"></i></div>
      <div class="loy-sub">${loyT("До уровня", "To tier")} «${d.tier === "bronze" ? loyT("Серебро", "Silver") : loyT("Золото", "Gold")}» ${loyT("ещё", "another")} ${loyPts(d.next - d.total)}</div>`
      : `<div class="loy-sub">${loyT("Высший уровень: все очки с надбавкой", "Top tier: every point comes with the bonus")} +${Math.round((d.mult - 1) * 100)}%</div>`}
    <div class="sec-t">${ic("coins")}${loyT("Как копить", "How to earn")}</div>
    <div class="box"><div class="row"><span class="pic g">${ic("coin")}</span><div class="grow"><div class="t">1 ${loyT("очко за каждые", "point per")} ${fmt(d.per)} ⭐ ${loyT("ставок", "wagered")}</div>
        <div class="s">${loyT("в играх и кейсах за звёзды, независимо от исхода", "in games and star cases, win or lose")}</div></div></div>
      <div class="row"><span class="pic b">${ic("trend")}</span><div class="grow"><div class="t">${loyT("Серебро с", "Silver from")} ${fmt(d.silver)} · ${loyT("Золото с", "Gold from")} ${fmt(d.gold)}</div>
        <div class="s">${loyT("считаются очки за всё время: серебро даёт", "counted over all time: silver gives")} +25%, ${loyT("золото", "gold")} +50%</div></div></div>
      <div class="row"><span class="pic y">${ic("clock")}</span><div class="grow"><div class="t">${loyT("Сегодня", "Today")}: ${fmt(d.today)} / ${fmt(d.dayCap)}</div>
        <div class="s">${todayLeft ? loyT("дневной лимит, остаток", "daily cap, left") + " " + fmt(todayLeft) : loyT("дневной лимит исчерпан — очки снова завтра", "daily cap reached, more points tomorrow")}</div></div></div></div>
    <div class="sec-t">${ic("bag")}${loyT("Магазин очков", "Points shop")}</div>
    <div class="loy-grid">${d.items.map(it => {
      const ok = d.pts >= it.price;
      const pic = it.kind === "key" ? `<img src="${A.orig(it.cover, 96)}" alt="">` : avaHTML({ ...ME, frame: "", pframe: it.frame }, 44);
      const sub = it.kind === "key" ? `${loyT("кейс", "case")} ⭐ ${short(it.value)}` : `${loyT("на", "for")} ${it.days} ${plural(it.days, ["день", "дня", "дней"])}`;
      return `<div class="loy-it${ok ? "" : " no"}"><div class="loy-pic">${pic}${it.kind === "key" ? `<i>${ic("key")}</i>` : ""}</div>
        <b>${esc(it.kind === "key" ? it.title : loyT(it.name.replace(/ на \d+ дней$/, "").replace(/^Рамка /, ""), LOY_FR_EN[it.frame] || it.frame))}</b><span>${sub}</span>
        <button class="btn sm ${ok ? "gold" : "ghost"}" data-act="loy-buy" data-i="${it.id}" data-n="${esc(it.name)}" data-p="${it.price}"${ok ? "" : " disabled"}>${fmt(it.price)}</button></div>`;
    }).join("")}</div>
    <div class="disc">${loyT("Очки не сгорают и не зависят от баланса: вайп и кэшбэк их не трогают. Джекпот на подарки очков не даёт.", "Points never expire and do not depend on your balance: wipes and cashback leave them alone. The gift jackpot earns no points.")}</div>
    ${d.log.length ? `<div class="sec-t">${ic("receipt")}${loyT("История", "History")}</div><div class="box">${d.log.map(x => {
      const it = d.items.find(i => i.id === x.item);
      return `<div class="row kv"><div class="grow"><div class="t">${esc(it ? it.name : x.item)}</div><div class="s">${new Date(x.ts * 1000).toLocaleDateString(LANG === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long" })}</div></div><b class="tl">−${fmt(-x.delta)}</b></div>`;
    }).join("")}</div>` : ""}`;
}
async function loyDraw(el) {
  try { LOY = await api("loyal"); } catch (e) { return; }
  replaceSheet(el, loyHTML(LOY));
  starify(el);
}
async function openLoyal() {
  const el = openSheet(emptyHTML("hourglass", "Загружаем…"), "loy-s");
  await loyDraw(el);
}
async function loyBuy(el) {
  const d = el.dataset;
  if (!await confirmM(esc(d.n), `${loyT("Списать", "Spend")} ${loyPts(+d.p)}?`, loyT("Купить", "Buy"))) return;
  el.disabled = true;
  try {
    const r = await post("loyal/buy", { item: d.i });
    H.ok(); toast(`${r.name} — ${loyT("готово", "done")}`, "ok");
    if (d.i.startsWith("key:")) CASES = [];
    loadMe().catch(() => {});
    if (typeof refreshProfileSheets === "function") refreshProfileSheets();
    const sh = el.closest(".sheet"); if (sh) await loyDraw(sh);
  } catch (e) { el.disabled = false; }
}
// плитка «Очки» — в своём профиле (hub.js: P_MENU), бейдж на ней — ME.loy.pts
Object.assign(ACT, { "loyal": () => openLoyal(), "loy-buy": el => loyBuy(el) });
if (LANG === "en") i18nAdd({
  "Очки": "Points", "очко": "point", "очка": "points", "очков": "points", "Загружаем…": "Loading…", "Списать": "Spend",
  "Не хватает очков: нужно": "Not enough points: you need", "Нет такого товара — обнови экран": "No such item, refresh the screen",
  "Ключ «Охота на Пепе»": "“Pepe Hunt” key", "Ключ «Удача»": "“Luck” key", "Ключ «Роскошь»": "“Luxury” key", "Ключ «Элитный»": "“Elite” key", "Ключ «Кубки»": "“Cups” key",
  "Рамка «Неон» на": "“Neon” frame for", "Рамка «Пламя» на": "“Flame” frame for", "Рамка «Постоянный клиент» на": "“Regular” frame for", "дней": "days", "день": "day", "дня": "days",
  "Постоянный клиент": "Regular", "Именинник": "Birthday star",
});
