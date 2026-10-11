"use strict";
// ============================================================
//  Банк казино: шторка с историей прибыли, акциями и дивидендами
// ============================================================
ICONS.bank = '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>';
ICONS.info = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>';
ICONS.pie = '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>';
let BK = null;
const sgn = n => (n >= 0 ? "+" : "−") + short(Math.abs(n));

// плашка банка (в играх и в топе) открывает шторку
const _lb = loadBank;
loadBank = async function () {
  document.querySelectorAll(".bankbar").forEach(b => {
    if (b.dataset.act) return;
    b.dataset.act = "bank"; b.classList.add("tap");
    b.querySelector(".bk-i").innerHTML = ic("bank");
    b.insertAdjacentHTML("beforeend", ic("chev"));
  });
  return _lb();
};

async function openBank() {
  H.imp("light");
  const el = openSheet(`<div id="bk-body">${emptyHTML("hourglass", "Считаем банк…")}</div>`, "bk-s");
  el._bk = true;
  await loadBK();
}
async function loadBK() {
  try { BK = await api("bank/info"); } catch (e) { return; }
  for (const s of SHEETS) if (s._bk) fillBK(s);
}
let bkTop = "holders";
const bkDate = t => new Date(t * 1000).toLocaleDateString("ru", { day: "numeric", month: "short" });
// столбики прибыли казино по дням; тап по столбику — подпись с суммой
function bkChart(days) {
  const W = 320, Hc = 120, mid = Hc / 2, max = Math.max(1, ...days.map(d => Math.abs(d.profit))), bw = W / days.length;
  const bars = days.map((d, i) => {
    const h = Math.max(d.profit ? 3 : 1.5, Math.abs(d.profit) / max * (mid - 8)), y = d.profit >= 0 ? mid - h : mid;
    return `<rect class="${d.profit > 0 ? "up" : d.profit < 0 ? "dn" : "z"}${i === days.length - 1 ? " now" : ""}" data-i="${i}" x="${i * bw + 2}" y="${y}" width="${bw - 4}" height="${h}" rx="3"/>`;
  }).join("");
  return `<div class="bkc"><svg viewBox="0 0 ${W} ${Hc}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}"/>${bars}</svg><div class="bkc-tip"></div></div>
    <div class="bk-axis"><span>${bkDate(days[0].day)}</span><span>${bkDate(days[Math.floor(days.length / 2)].day)}</span><span>сегодня</span></div>
    <div class="bk-legend"><span><i class="up"></i>казино в плюсе</span><span><i class="dn"></i>игроки обыграли казино</span></div>`;
}
function bkBindChart(el) {
  const box = el.querySelector(".bkc"); if (!box) return;
  const tip = box.querySelector(".bkc-tip");
  const show = e => {
    const r = box.getBoundingClientRect(), i = Math.max(0, Math.min(BK.days.length - 1, Math.floor((e.clientX - r.left) / r.width * BK.days.length)));
    const d = BK.days[i];
    box.querySelectorAll("rect").forEach(x => x.classList.toggle("sel", +x.dataset.i === i));
    tip.innerHTML = `<b class="${d.profit >= 0 ? "tw" : "tl"}">${sgn(d.profit)}</b><span>${i === BK.days.length - 1 ? "сегодня" : bkDate(d.day)}</span>`;
    tip.style.display = "flex";
    tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, (i + .5) / BK.days.length * r.width - tip.offsetWidth / 2)) + "px";
  };
  box.onpointermove = show; box.onpointerdown = show;
  box.onpointerleave = () => { tip.style.display = "none"; box.querySelectorAll("rect.sel").forEach(x => x.classList.remove("sel")); };
}
// цена акции по дням: банк на конец дня / выпуск (восстанавливаем назад от текущего банка)
function bkPriceSeries() {
  const out = [], n = BK.days.length;
  let b = BK.bank;
  for (let i = n - 1; i >= 0; i--) { out[i] = b / BK.supply; b -= BK.days[i].profit; }
  return out;
}
function bkPeople(list, f, empty) {
  return list.length ? list.map((u, i) => `<div class="row tap" data-act="profile" data-id="${u.id}"><span class="place p${i + 1}">${i + 1}</span>${avaHTML(u, 34)}
    <div class="grow"><div class="t">${esc(u.name)}</div></div>${f(u)}</div>`).join("") : `<div class="hint bk-empty">${empty}</div>`;
}
function bkTopHTML() {
  if (bkTop === "robbers") return bkPeople(BK.robbers, u => `<b class="tw">+⭐ ${short(u.sum)}</b>`, "Банк пока никто не обыграл");
  if (bkTop === "sponsors") return bkPeople(BK.sponsors, u => `<b class="tl">−⭐ ${short(-u.sum)}</b>`, "Пока никто не проиграл");
  return bkPeople(BK.holders, u => `<b>${fmt(u.n)} акц.</b>`, "Акции пока никто не купил — будь первым");
}
function fillBK(el) {
  if (!BK || !el.isConnected) return;
  const m = BK.mine, pl = m.value - m.cost, h = Math.floor(BK.endsIn / 3600), mi = Math.floor(BK.endsIn % 3600 / 60);
  const room = Math.min(BK.maxPer - m.n, BK.supply - BK.held);
  const since = BK.bank - BK.start, d14 = BK.days.reduce((s, d) => s + d.profit, 0);
  const ps = bkPriceSeries(), pch = ps[0] ? (ps[ps.length - 1] / ps[0] - 1) * 100 : 0;
  const pct = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2).replace(".", ",") + "%";
  el.querySelector("#bk-body").innerHTML = `
    <div class="bkh">
      <div class="bkh-top"><span class="bkh-i">${ic("bank")}</span><div><span>Банк казино</span><b>⭐ ${fmt(BK.bank)}</b></div></div>
      <div class="bkh-stats">
        <div><span>Сегодня</span><b class="${BK.today >= 0 ? "up" : "dn"}">${sgn(BK.today)}</b></div>
        <div><span>14 дней</span><b class="${d14 >= 0 ? "up" : "dn"}">${sgn(d14)}</b></div>
        <div><span>С открытия</span><b class="${since >= 0 ? "up" : "dn"}">${sgn(since)}</b></div>
      </div>
    </div>

    <div class="bkme2"><span class="pic ${BK.me > 0 ? "g" : BK.me < 0 ? "r" : "b"}">${ic(BK.me > 0 ? "trophy" : "wallet")}</span>
      <div class="grow"><div class="t">${BK.me > 0 ? "Ты обыграл банк" : BK.me < 0 ? "Ты занёс банку" : "Ты с банком в расчёте"}</div><div class="s">итог всех твоих игр</div></div>
      <b class="${BK.me > 0 ? "tw" : BK.me < 0 ? "tl" : ""}">${BK.me > 0 ? "+" : BK.me < 0 ? "−" : ""}⭐ ${fmt(Math.abs(BK.me))}</b></div>

    <div class="sec-t">${ic("trend")}Прибыль казино по дням</div>
    <div class="inccard">${bkChart(BK.days)}</div>

    <div class="sec-t">${ic("pie")}Акции казино</div>
    <div class="bksh">
      <div class="bksh-top"><div><span>Цена акции</span><b>⭐ ${fmt(BK.price)}</b><em class="${pch >= 0 ? "up" : "dn"}">${pct(pch)} за 14 дней</em></div>
        ${spark(ps, pch >= 0, 110, 44)}</div>
      <div class="bksh-div">${ic("coins")}<div class="grow"><b>Дивиденды через ${h} ч ${mi} мин</b><span>${Math.round(BK.divShare * 100)}% вчерашней прибыли казино делится на акции${BK.lastDiv && BK.lastDiv.total ? ` · прошлая выплата ⭐ ${String(BK.lastDiv.perShare).replace(".", ",")} на акцию` : ""}</span></div></div>
      ${m.n ? `<div class="bks-top"><div><span>У тебя</span><b>${fmt(m.n)}</b></div><div><span>Стоимость</span><b>⭐ ${short(m.value)}</b></div><div><span>Прибыль</span><b class="${pl >= 0 ? "tw" : "tl"}">${sgn(pl)}</b></div></div>
        <div class="bks-row"><span>Дивиденды сегодня (прогноз)</span><b class="tw">+⭐ ${fmt(m.est)}</b></div>
        <div class="bks-row"><span>Получено дивидендов всего</span><b>⭐ ${fmt(m.div)}</b></div>` : ""}
      ${room > 0 ? `<div class="bks-buy-t">${ic("trend")}Купить акции</div><div class="jpbuy bks-buy">${[1, 10, 100, 1000].filter(n => n <= room).map(n => `<button data-act="bk-buy" data-v="${n}"><b>+${n}</b><span>⭐ ${short(n * BK.price)}</span></button>`).join("")}</div>`
        : `<div class="hint" style="font-size:12.5px;text-align:center;margin-top:8px">Лимит — ${fmt(BK.maxPer)} акций в одни руки</div>`}
      ${m.n ? `<button class="btn ghost bks-sell" data-act="bk-sell" ${m.sellIn ? "disabled" : ""}>${m.sellIn ? `${ic("lock")}Продажа через ${Math.floor(m.sellIn / 3600)} ч ${Math.floor(m.sellIn % 3600 / 60)} мин` : `${ic("coins")}Продать все · ⭐ ${short(Math.floor(m.n * BK.price * (1 - BK.sellFee)))}`}</button>` : ""}
      <div class="bks-foot"><span>Акций у игроков</span><div class="cbar"><div style="width:${Math.max(.5, BK.held / BK.supply * 100)}%"></div></div><b>${fmt(BK.held)} / ${short(BK.supply)}</b></div>
    </div>
    <details class="bk-how"><summary>${ic("info")}Как работают акции</summary>
      <p>Цена акции = банк / ${short(BK.supply)}. Игроки проигрывают — банк растёт и акции дорожают, выигрывают — дешевеют.</p>
      <p>Каждый день в 00:00 UTC (11:00 по Сахалину) ${Math.round(BK.divShare * 100)}% вчерашней прибыли казино делится на акции у игроков (если акций у игроков меньше ${short(BK.divFloor || 10000)} — делится как на ${short(BK.divFloor || 10000)}, остаток остаётся в банке). В убыточный для казино день дивидендов нет.</p>
      <p>Не больше ${fmt(BK.maxPer)} акций в одни руки. Продать можно через сутки после покупки, комиссия ${Math.round(BK.sellFee * 100)}%.</p></details>

    <div class="seg bk-tabs">${[["holders", "Акционеры"], ["robbers", "Обыграли банк"], ["sponsors", "Спонсоры"]].map(([k, t]) => `<button data-act="bk-top" data-v="${k}" class="${k === bkTop ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="box" id="bk-top">${bkTopHTML()}</div>
    <div class="disc">Банк = 50 млн стартового резерва + всё, что игроки проиграли, − всё, что выиграли, − розыгрыши и дивиденды. ${esc(ME.disclaimer)}</div>`;
  bkBindChart(el);
}

Object.assign(ACT, {
  bank: () => openBank(),
  "bk-top": el => { bkTop = el.dataset.v; H.sel(); const s = topSheet(); s.querySelectorAll(".bk-tabs button").forEach(b => b.classList.toggle("on", b === el)); s.querySelector("#bk-top").innerHTML = bkTopHTML(); },
  "bk-buy": async el => {
    const n = +el.dataset.v;
    if (n * BK.price > ME.stars) return toast("Не хватает звёзд ⭐");
    const r = await post("bank/shares", { n }); setStars(r.stars); H.ok();
    toast(`+${n} ${plural(n, ["акция", "акции", "акций"])} казино`, "ok");
    await loadBK(); loadBank();
  },
  "bk-sell": async () => {
    const n = BK.mine.n, got = Math.floor(n * BK.price * (1 - BK.sellFee));
    if (!await confirmM(`Продать ${fmt(n)} ${plural(n, ["акцию", "акции", "акций"])}?`, `Получишь ⭐ ${fmt(got)} (комиссия ${Math.round(BK.sellFee * 100)}%). Дивиденды за сегодня не придут.`, "Продать")) return;
    const r = await post("bank/shares", { n: -n }); setStars(r.stars); H.ok(); toast(`Продано · +⭐ ${fmt(got)}`, "ok");
    await loadBK(); loadBank();
  },
});
