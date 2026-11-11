"use strict";
// ============================================================
//  Сезонные ивенты (Хэллоуин, Новый год): тема оформления, полоска, плашка на ивент-кейсе. Включаются сервером по датам.
// ============================================================
let EV_SEEN = null;
// оформление по ивентам: подарки по углам, картинка на полоске и в окне, снег (только в режиме без оптимизации — скрыт стилями)
const EV_LOOK = {
  halloween: { deco: ["Mad Pumpkin", "Witch Hat"], img: "Mad Pumpkin" },
  newyear: { deco: ["Santa Hat", "Snow Globe"], img: "Snow Globe", snow: true },
};
const evLook = e => (e && EV_LOOK[e.id]) || { deco: [], img: "Snow Globe" };
function evApply() {
  const e = ME && ME.event, id = e ? e.id : "", de = document.documentElement, L = evLook(e);
  [...de.classList].forEach(c => { if (c.startsWith("ev-") && c !== "ev-" + id) de.classList.remove(c); });
  if (id) de.classList.add("ev-" + id);
  if (id !== EV_SEEN) {   // ивент сменился: цены кейсов другие, украшения — другие
    if (EV_SEEN !== null) CASES = [];
    EV_SEEN = id;
    document.querySelectorAll(".ev-deco,.ev-snow").forEach(x => x.remove());
  }
  if (id && L.deco.length && !$(".ev-deco")) document.body.insertAdjacentHTML("beforeend",
    `<div class="ev-deco" aria-hidden="true"><img class="l" src="${A.orig(L.deco[0], 128)}" alt=""><img class="r" src="${A.orig(L.deco[1], 128)}" alt=""></div>`);
  if (id && L.snow && !$(".ev-snow")) document.body.insertAdjacentHTML("beforeend", `<div class="ev-snow" aria-hidden="true"><i></i><i></i></div>`);
}
const _loadMeEv = loadMe;
loadMe = async function () { await _loadMeEv(); evApply(); };
const evLeft = u => { const s = Math.max(0, u - Date.now() / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600); return d ? `${d} д ${h} ч` : `${h} ч`; };
const evRib = () => ME && ME.event ? `<button class="evrib" data-act="ev-info"><img src="${A.orig(evLook(ME.event).img, 64)}" alt=""><b>${esc(ME.event.title)}</b><span>кейс −${Math.round(ME.event.sale * 100)}% · ещё ${evLeft(ME.event.until)}</span>${ic("chev")}</button>` : "";
const _rcEv = renderCases;
renderCases = async function () {
  evApply();   // при первом запуске профиль грузится раньше этого модуля — применяем тему здесь
  await _rcEv();
  const v = $("#v-cases"), e = ME.event; if (!v || !e) return;
  if (!v.querySelector(".evrib")) v.insertAdjacentHTML("afterbegin", evRib());
  const card = v.querySelector(`.case[data-id="${e.case}"]`);
  if (card && !card.classList.contains("ev")) {
    card.classList.add("ev");
    card.insertAdjacentHTML("beforeend", `<span class="evtag">ИВЕНТ −${Math.round(e.sale * 100)}%</span>`);
    card.parentElement.prepend(card);   // ивент-кейс — первым
  }
};
const _rgEv = renderGames;
renderGames = function () { _rgEv(); const v = $("#v-games"); if (v && ME.event && !v.querySelector(".evrib")) v.insertAdjacentHTML("afterbegin", evRib()); };
Object.assign(ACT, {
  "ev-info": () => {
    const e = ME.event; if (!e) return;
    modal(`<div style="text-align:center"><img src="${A.orig(evLook(e).img, 256)}" style="width:110px;height:110px;object-fit:contain;margin:0 auto" alt=""></div>
      <h3 style="text-align:center">${esc(e.title)}</h3><p class="hint" style="text-align:center;margin:0 0 12px">Ивент идёт ещё ${evLeft(e.until)}</p>
      <div class="box" style="margin-bottom:14px">${e.perks.map(x => `<div class="row kv"><span class="tw">${ic("check")}</span><div class="grow">${esc(x)}</div></div>`).join("")}</div>
      <button class="btn gold" data-m="ok">Вперёд!</button>`);
  },
});
