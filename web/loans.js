"use strict";
// ============================================================ кредит под залог подарка (банк казино)
const loanLeft = s => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600); return d ? `${d} д ${h} ч` : `${h} ч ${Math.floor(s % 3600 / 60)} мин`; };
async function loansHTML() {
  const L = await api("loans").catch(() => null);
  if (!L) return "";
  const t = L.now, cash = L.loans.find(x => !x.gift), lvlOk = ME.lv.level >= L.cashLevel;
  return `<div class="cashl">
      <div class="cashl-h"><span class="pic y">${ic("coins")}</span><div class="grow"><b>Кредит без залога</b><span>твой лимит ⭐ ${fmt(L.cashMax)} из ${short(L.cashCap)} · на ${L.term / 86400} дня · вернуть +${Math.round(L.fee * 100)}%</span></div></div>
      ${cash ? `<div class="hint" style="font-size:13px;margin-top:10px">У тебя уже есть кредит без залога — сначала верни его.</div>`
        : !lvlOk ? `<div class="hint" style="font-size:13px;margin-top:10px">${ic("lock")} Доступен с ${L.cashLevel} уровня</div>`
        : L.stars < 0 ? `<div class="hint tl" style="font-size:13px;margin-top:10px">Сначала закрой минус на балансе</div>`
        : `<div class="jpbuy cashl-b">${[1000, 2000, 3000, 4000, 5000, ...Array.from({ length: Math.round(L.cashCap / L.cashStep) }, (_, i) => (i + 1) * L.cashStep)].map(n => n <= L.cashMax
            ? `<button data-act="loan-cash" data-v="${n}"><b>⭐ ${short(n)}</b><span>вернуть ${short(Math.ceil(n * (1 + L.fee)))}</span></button>`
            : `<button class="off" disabled><b>⭐ ${short(n)}</b><span>${ic("lock")}</span></button>`).join("")}</div>
          ${L.cashMax < L.cashCap ? `<div class="hint" style="font-size:12px;margin-top:6px">Вернул кредит вовремя — лимит +⭐ ${short(L.cashStep)}. Просрочка сбрасывает лимит до ⭐ ${short(L.cashStep)}.</div>` : ""}`}
      <div class="hint" style="font-size:11.5px;margin-top:8px">Не вернёшь в срок — долг спишется с баланса, даже если он уйдёт в минус. Пока кредит открыт, звёзды в обменах отдавать нельзя.</div>
    </div>
    <div class="sec-t" style="margin-top:14px">${ic("wallet")}Мои кредиты</div>
    ${L.loans.length ? `<div class="box">${L.loans.map(x => `<div class="row">${x.gift ? `<img class="spi" style="width:38px;height:38px;margin:0" src="${A.model(x.gift.col, x.gift.model, 64)}" alt="">` : `<span class="pic y">${ic("coins")}</span>`}
      <div class="grow"><div class="t">${x.gift ? esc(x.gift.col) + " #" + fmt(x.gift.num) : "Без залога · ⭐ " + fmt(x.principal)}</div><div class="s ${x.until - t < 43200 ? "tl" : ""}">вернуть ⭐ ${fmt(x.debt)}${x.paid ? ` из ${fmt(x.total)}` : ""} · осталось ${loanLeft(x.until - t)}</div>
        ${x.paid ? `<div class="loan-bar"><i style="width:${Math.round(x.paid / x.total * 100)}%"></i></div>` : ""}</div>
      <button class="btn sm green" data-act="loan-repay" data-id="${x.id}" data-debt="${x.debt}" data-min="${x.partMin || 100}" data-g="${x.gift ? 1 : 0}">Вернуть</button></div>`).join("")}</div>`
      : `<div class="hint" style="font-size:13px;padding:0 4px">Кредитов нет. Под залог: открой подарок в сумке и нажми «Кредит под залог».</div>`}
    <div class="hint" style="font-size:12px;margin:8px 4px 0">Банк даёт ${Math.round(L.ltv * 100)}% ценности подарка на ${L.term / 86400} дня, вернуть — с комиссией ${Math.round(L.fee * 100)}%. Пока подарок в залоге, он не приносит доход. Не вернёшь в срок — подарок уходит банку на маркет. Не больше ${L.max} кредитов сразу.</div>`;
}
let BK_TAB = "bank";
const bkTabs = () => `<div class="seg bk-tabs">${[["bank", "Банк"], ["loans", "Кредиты"]].map(([k, t]) => `<button data-act="bk-tab" data-v="${k}" class="${BK_TAB === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
const _fillBKL = fillBK;
fillBK = function (el) {
  const body = el && el.querySelector("#bk-body"); if (!body) return;
  if (BK_TAB === "loans") { body.innerHTML = bkTabs() + `<div class="loans-sec">${emptyHTML("hourglass", "Загружаем…")}</div>`; loansHTML().then(h => { const s = body.querySelector(".loans-sec"); if (s) s.innerHTML = h; }); return; }
  _fillBKL(el);
  body.insertAdjacentHTML("afterbegin", bkTabs());
};
const _openBankL = openBank;
openBank = function () { BK_TAB = "bank"; return _openBankL(); };
Object.assign(ACT, {
  "bk-tab": el => { BK_TAB = el.dataset.v; H.sel(); const s = SHEETS.find(x => x._bk); if (s) fillBK(s); },
  "loans-open": () => { BK_TAB = "loans"; _openBankL(); },
  loan: async el => {
    const g = topSheet()._o.g, got = Math.floor(g.value * .5), debt = Math.ceil(got * 1.1);
    if (!await confirmM("Кредит под залог?", `Получишь ⭐ ${fmt(got)} сейчас. Вернуть ⭐ ${fmt(debt)} в течение 3 дней — тогда ${esc(g.col)} #${fmt(g.num)} вернётся к тебе. Не вернёшь — подарок заберёт банк.`, "Взять")) return;
    const r = await post(`gift/${el.dataset.id}/loan`); setStars(r.stars); H.ok(); toast(`+⭐ ${fmt(r.got)} · подарок в залоге`, "ok");
    closeSheet(); if (typeof giftChanged === "function") giftChanged();
  },
  "loan-cash": async el => {
    const n = +el.dataset.v, debt = Math.ceil(n * 1.1);
    if (!await confirmM(`Взять ⭐ ${fmt(n)}?`, `Вернуть ⭐ ${fmt(debt)} в течение 3 дней. Не вернёшь — спишем с баланса, даже в минус.`, "Взять")) return;
    const r = await post("loans/cash", { amount: n }); setStars(r.stars); H.ok(); toast(`+⭐ ${fmt(r.got)}`, "ok"); burstAt(el);
    const s = el.closest(".loans-sec"); if (s) s.innerHTML = await loansHTML();
  },
  "loan-repay": async el => {
    // можно частями: по умолчанию предлагаем весь остаток (или сколько есть на балансе)
    const left = +el.dataset.debt, min = Math.min(+el.dataset.min || 100, left);
    if (ME.stars < min) return toast(`Нужно хотя бы ⭐ ${fmt(min)}`);
    const v = await promptM("Вернуть кредит", `Осталось вернуть ⭐ ${fmt(left)}. Можно частями — от ⭐ ${fmt(min)}. Весь остаток закроет кредит${+el.dataset.g ? " и вернёт подарок" : ""}.`, String(Math.min(left, Math.max(0, Math.floor(ME.stars)))), "Внести");
    if (v == null) return;
    const a = parseInt(String(v).replace(/\D/g, ""), 10) || 0;
    if (a < min) return toast(`Взнос — от ⭐ ${fmt(min)}`);
    if (a > ME.stars) return toast(`На балансе только ⭐ ${fmt(ME.stars)}`);
    const r = await post(`loans/${el.dataset.id}/repay`, { amount: Math.min(a, left) }); setStars(r.stars); H.ok();
    toast(r.closed ? (r.gift ? "Кредит закрыт — подарок вернулся" : "Кредит закрыт") : `Внесено ⭐ ${fmt(r.paid)} · осталось ⭐ ${fmt(r.left)}`, "ok");
    const s = el.closest(".loans-sec"); if (s) s.innerHTML = await loansHTML();
  },
});
