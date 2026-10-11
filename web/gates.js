"use strict";
// ============================================================
//  Админ закрывает/скрывает игры: hidden — карточки нет, closed — плашка «Закрыто». Вкладка «Игры» в админке.
// ============================================================
const gOff = () => (ME && ME.gamesOff) || {};
const _rgGate = renderGames;
renderGames = function () {
  const off = gOff(), saved = GAMES.slice();
  for (let i = GAMES.length - 1; i >= 0; i--) if (off[GAMES[i].id] === "hidden") GAMES.splice(i, 1);
  try { _rgGate(); } finally { GAMES.splice(0, GAMES.length, ...saved); }
  document.querySelectorAll("#v-games .gcard[data-id]").forEach(c => {
    const closed = off[c.dataset.id] === "closed";
    c.classList.toggle("g-closed", closed);
    if (closed && !c.querySelector(".g-lock")) c.insertAdjacentHTML("beforeend", `<span class="g-lock">${ic("lock")}Закрыто</span>`);
  });
  document.querySelectorAll("#v-games .gsec").forEach(h => { const g = h.nextElementSibling; if (g && !g.querySelector(".gcard")) { h.remove(); g.remove(); } });
};
const _gameGate = ACT.game;
ACT.game = el => gOff()[el.dataset.id] ? toast("Игра временно закрыта — загляни позже") : _gameGate(el);

// ---------------- админка: вкладка «Игры» ----------------
const ADM_GST = [["on", "Работает"], ["closed", "Закрыта"], ["hidden", "Скрыта"]];
const _admRG = admRender;
admRender = async function (el = topSheet()) {
  if (ADM.tab !== "games") return _admRG(el);
  const body = el.querySelector("#adm-body"); if (!body) return;
  const d = await api("admin/games"), st = d.states;
  const names = Object.fromEntries(GAMES.map(g => [g.id, g.t]));
  body.innerHTML = `<p class="hint" style="margin:0 0 10px;font-size:12.5px">«Закрыта» — карточка видна с замком, новые ставки не принимаются. «Скрыта» — игры нет в списке. Начатые раунды в любом случае можно доиграть.</p>
    <div class="box">${d.ids.map(id => `<div class="row adm-g"><div class="grow"><div class="t">${esc(names[id] || id)}</div></div>
      <div class="seg adm-gs">${ADM_GST.map(([k, t]) => `<button data-act="adm-game" data-id="${id}" data-v="${k}" class="${(st[id] || "on") === k ? "on" : ""}">${t}</button>`).join("")}</div></div>`).join("")}</div>`;
};
ACT["adm-game"] = async el => {
  const r = await post("admin/games", { id: el.dataset.id, state: el.dataset.v }); H.sel();
  el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === el));
  ME.gamesOff = Object.fromEntries(Object.entries(r.states).filter(([, v]) => v !== "on"));
  toast("Сохранено", "ok");
};
