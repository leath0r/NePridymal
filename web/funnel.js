"use strict";
// ============================================================
//  Админка → вкладка «Воронка» (funnel.py): новички за 7/30/90 дней — откуда пришли, сыграли ли, вернулись ли
//  на следующий день и через неделю, дошли ли до 5 уровня и первой покупки, после какой игры ушли
// ============================================================
const FN = { days: 30 };
const FN_SRC = [["ref", "Рефералка"], ["gift", "Подарок по ссылке"], ["franchise", "Франшиза"], ["organic", "Сами"]];
// Цвета проверены валидатором палитры (dataviz) для тёмной и светлой темы Telegram. Синий (слот 1) — у полос «Путь новичка»
// и «Где уходят»; источники — слоты 2–5, чтобы ни один не совпал с полосами. На светлой теме у трёх контраст с фоном ниже 3:1 —
// поэтому рядом всегда подписи и таблица с числами. Цвет закреплён за источником, а не за местом в рейтинге
const fnLight = () => !!(inTg && tg.colorScheme === "light");
const fnCols = () => fnLight() ? ["#eb6834", "#1baf7a", "#eda100", "#e87ba4"] : ["#d95926", "#199e70", "#c98500", "#d55181"];
const fnP = (n, of) => (of ? Math.round(n * 100 / of) : 0);

const _admRFunnel = admRender;
admRender = async function (el = topSheet()) {
  if (ADM.tab !== "funnel") return _admRFunnel(el);
  const body = el && el.querySelector("#adm-body"); if (!body) return;
  const prev = body.querySelector(".fn"); if (prev) prev.classList.add("busy");   // при смене периода прежний вид остаётся, приглушённый
  const d = await api("admin/funnel?days=" + FN.days).catch(() => null);
  if (!body.isConnected || ADM.tab !== "funnel") return;
  body.innerHTML = d ? fnHTML(d) : emptyHTML("lock", "Не удалось загрузить воронку — попробуй ещё раз");
  starify(body);
};

function fnRow(label, n, of, note) {
  const p = fnP(n, of);
  return `<div class="fn-row" title="${esc(label)}: ${of ? `${fmt(n)} из ${fmt(of)} (${p}%)` : "ещё рано считать"}">
    <div class="fn-l"><span>${esc(label)}</span><b>${of ? p + "%" : "—"}</b></div>
    <div class="fn-bar"><i style="width:${of ? Math.max(n ? 1 : 0, p) : 0}%"></i></div>
    <small>${of ? `${fmt(n)} из ${fmt(of)}${note ? " · " + note : ""}` : "ещё рано считать"}</small></div>`;
}

function fnHTML(d) {
  const t = d.total, cols = fnCols(), S = Object.fromEntries(d.sources.map(s => [s.id, s]));
  const per = `<div class="seg fn-per">${[7, 30, 90].map(n => `<button data-act="fn-days" data-v="${n}" class="${d.days === n ? "on" : ""}">${n} дней</button>`).join("")}</div>`;
  const cls = "fn" + (fnLight() ? " fn-light" : "");
  if (!t.n) return `<div class="${cls}">${per}${emptyHTML("users", "За этот период новичков нет")}</div>`;
  const tile = (label, val, sub) => `<div><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
  const ret = (n, of) => (of ? `вернулись ${fmt(n)} из ${fmt(of)}` : "ещё рано считать");
  const kpi = `<div class="fn-kpi">
    ${tile("Новичков", fmt(t.n), `за ${d.days} ${plural(d.days, ["день", "дня", "дней"])}`)}
    ${tile("На следующий день", t.d1of ? fnP(t.d1, t.d1of) + "%" : "—", ret(t.d1, t.d1of))}
    ${tile("Через неделю", t.d7of ? fnP(t.d7, t.d7of) + "%" : "—", ret(t.d7, t.d7of))}
    ${tile("Купили звёзды", fnP(t.pay, t.n) + "%", `${fmt(t.pay)} · ⭐ ${fmt(t.xtr)}`)}</div>`;
  const steps = `<div class="sec-t">${ic("trend")}Путь новичка</div><div class="fn-box">
    ${fnRow("Сыграли хотя бы раунд", t.play, t.n)}${fnRow("Открыли кейс", t.case, t.n)}
    ${fnRow("Вернулись на следующий день", t.d1, t.d1of, "из пришедших больше 2 дней назад")}
    ${fnRow("Вернулись через неделю", t.d7, t.d7of, "из пришедших больше 8 дней назад")}
    ${fnRow("Дошли до 5 уровня", t.lv5, t.n)}${fnRow("Купили звёзды", t.pay, t.n)}</div>`;
  const mix = FN_SRC.map(([k, name], i) => S[k].n ? `<i style="flex:${S[k].n};background:${cols[i]}" title="${name}: ${fmt(S[k].n)} (${fnP(S[k].n, t.n)}%)"></i>` : "").join("");
  const row = (sw, name, a) => `<tr><td><span class="fn-src">${sw}<span>${name}</span></span></td><td>${fmt(a.n)}</td><td>${fnP(a.play, a.n)}%</td>
    <td>${a.d1of ? fnP(a.d1, a.d1of) + "%" : "—"}</td><td>${a.d7of ? fnP(a.d7, a.d7of) + "%" : "—"}</td>
    <td>${fnP(a.pay, a.n)}%${a.xtr ? `<small>⭐ ${short(a.xtr)}</small>` : ""}</td></tr>`;
  const src = `<div class="sec-t">${ic("users")}Откуда пришли</div>
    <div class="fn-mix" role="img" aria-label="${FN_SRC.map(([k, name]) => `${name}: ${fmt(S[k].n)}`).join(", ")}">${mix}</div>
    <div class="fn-tw"><table class="fn-t"><thead><tr><th>Источник</th><th>Новички</th><th>Играли</th><th>2-й день</th><th>Неделя</th><th>Купили</th></tr></thead>
      <tbody>${FN_SRC.map(([k, name], i) => row(`<i class="fn-sw" style="background:${cols[i]}"></i>`, name, S[k])).join("")}${row("", "<b>Всего</b>", t)}</tbody></table></div>`;
  const c = d.churn, days = `${c.after} ${plural(c.after, ["день", "дня", "дней"])}`;
  const drop = `<div class="sec-t">${ic("activity")}Где новички уходят</div>` + (c.n
    ? `<p class="fn-note">Ушли — пришли больше чем ${days} назад и последние ${days} не играли: ${fmt(c.n)} (${fnP(c.n, t.n)}% новичков). Ниже — какой была их последняя игра.</p>
      <div class="fn-box">${fnRow("Не сыграли ни раунда", c.none, c.n)}${c.games.map(g => fnRow(g.name, g.n, c.n)).join("")}</div>`
    : `<p class="fn-note">Пока никто не ушёл — или все новички пришли меньше чем ${days} назад.</p>`);
  const at = new Date(d.ts * 1000).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return `<div class="${cls}">${per}${kpi}${steps}${src}${drop}
    <p class="fn-note">Данные на ${at}, обновляются раз в 5 минут. «Подарок по ссылке» — новичок открыл подарок друга и записан его приглашённым,
      «Франшиза» — пришёл через бота игрока, «Сами» — без ссылки. Заблокированные не считаются.</p></div>`;
}

Object.assign(ACT, {
  "fn-days": el => {
    FN.days = +el.dataset.v; H.sel();
    el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === el));
    admRender();
  },
});
