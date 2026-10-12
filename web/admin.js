"use strict";
// ============================================================ админ-панель (кнопка видна только админу; сервер проверяет сам)
let ADM = { tab: "stats", qs: "", sort: "seen" };
const admDate = ts => ts ? new Date(ts * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const admBytes = b => b >= 1e9 ? (b / 1e9).toFixed(1).replace(".", ",") + " ГБ" : Math.round(b / 1e6) + " МБ";
const admSgn = v => `<b class="${v >= 0 ? "tw" : "tl"}">${v >= 0 ? "+" : "−"}⭐ ${fmt(Math.abs(v))}</b>`;
const admKv = (k, v) => `<div class="row kv"><div class="grow"><div class="s">${k}</div></div>${v}</div>`;

(function admButton() {
  const add = () => {
    if (!ME || !ME.admin || $("#adm-btn")) return;
    const b = document.createElement("button");
    b.id = "adm-btn"; b.className = "adm-btn"; b.dataset.act = "adm"; b.innerHTML = ic("lock");
    $("#me-btn").before(b);
  };
  const t = setInterval(() => { if (ME) { clearInterval(t); add(); } }, 500);
})();

function openAdmin() {
  const el = openSheet(`<h2 class="gtitle">Админка</h2>
    <div class="seg adm-tabs" id="adm-seg">${[["stats", "Обзор"], ["sales", "Продажи"], ["users", "Игроки"], ["games", "Игры"], ["odds", "Шансы"], ["pay", "Переводы"], ["bc", "Рассылка"], ["log", "Журнал"]]
      .map(([k, t]) => `<button data-act="adm-tab" data-v="${k}" class="${ADM.tab === k ? "on" : ""}">${t}</button>`).join("")}</div>
    <div id="adm-body">${emptyHTML("hourglass", "Загружаем…")}</div>`);
  el._adm = true;
  admRender(el);
}

async function admRender(el = topSheet()) {
  const body = el.querySelector("#adm-body"); if (!body) return;
  if (ADM.tab === "stats") {
    const [s, pr, ev, adm] = await Promise.all([api("admin/stats"), api("admin/promo"), api("admin/event"), api("admin/admins")]), v = s.server;
    const kinds = Object.entries(s.kinds24).sort((a, b) => b[1].n - a[1].n);
    body.innerHTML = `
      <div class="sec-t" style="margin-top:0">Акция «Щедрые выходные» ${pr.active ? `<span class="tw">· идёт</span>` : ""}</div>
      <div class="seg">${[["auto", "Авто (сб–вс)"], ["on", "Включить"], ["off", "Выключить"]].map(([k, t]) => `<button data-act="adm-promo" data-v="${k}" class="${pr.mode === k ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="sec-t">Сезонный ивент ${ev.active ? `<span class="tw">· ${esc(ev.active.title)} идёт</span>` : ""}</div>
      <div class="seg">${[["auto", "Авто (по датам)"], ...ev.events.map(e => [e.id, "Вкл: " + e.title]), ["off", "Выключить"]].map(([k, t]) => `<button data-act="adm-event" data-v="${k}" class="${ev.mode === k ? "on" : ""}">${esc(t)}</button>`).join("")}</div>
      <div class="box">${admKv("Игроков всего", `<b>${fmt(s.users)}</b>`)}${admKv("Онлайн (5 мин)", `<b>${fmt(s.online)}</b>`)}
        ${admKv("Активных за 24 ч / 7 дн", `<b>${fmt(s.active24)} / ${fmt(s.active7)}</b>`)}${admKv("Новых за 24 ч", `<b>${fmt(s.new24)}</b>`)}
        ${admKv("Заблокировано", `<b>${fmt(s.banned)}</b>`)}</div>
      <div class="sec-t">Экономика</div>
      <div class="box">${admKv("Банк казино", `<b>⭐ ${fmt(s.bank)}</b>`)}${admKv("Прибыль казино 24 ч", admSgn(s.house24))}
        ${admKv("Прибыль казино 7 дн", admSgn(s.house7))}${admKv("Комиссии в банк 24 ч", `<b class="tw">+⭐ ${fmt(s.fees24)}</b>`)}
        ${admKv("Звёзд у игроков", `<b>⭐ ${fmt(s.stars)}</b>`)}${admKv("Подарков у игроков", `<b>${fmt(s.gifts)}</b>`)}</div>
      <div class="sec-t">Сервер</div>
      <div class="box">${admKv("Нагрузка (1/5/15 мин)", `<b>${v.load.map(x => x.toFixed(2)).join(" / ")} · ${v.cpus} CPU</b>`)}
        ${admKv("Память свободно", `<b>${admBytes(v.memAvail)} из ${admBytes(v.memTotal)}</b>`)}
        ${admKv("Swap занято", `<b>${admBytes(v.swapTotal - v.swapFree)} из ${admBytes(v.swapTotal)}</b>`)}
        ${admKv("Диск свободно", `<b>${admBytes(v.diskFree)} из ${admBytes(v.diskTotal)}</b>`)}
        ${admKv("Игра в памяти / база", `<b>${admBytes(v.rss)} / ${admBytes(v.db)}</b>`)}
        ${admKv("Без перезапуска", `<b>${clock(v.uptime)}</b>`)}</div>
      <div class="sec-t">Администраторы</div>
      <div class="box">${adm.list.map(u => `<div class="row tap" data-act="adm-user" data-id="${u.id}">${avaHTML(u, 34)}<div class="grow"><div class="t">${esc(u.name)}</div>
        <div class="s">${u.owner ? "владелец" : "админ"} · id ${u.id}</div></div>${ic("chev")}</div>`).join("")}</div>
      ${adm.canGrant ? `<div class="hint" style="font-size:12px;margin:6px 4px 0">Выдать админку: вкладка «Игроки» → игрок → «Сделать админом»</div>` : ""}
      <div class="sec-t">Операции за 24 ч</div>
      <div class="box">${kinds.map(([k, x]) => admKv(`${esc(k)} · ${fmt(x.n)}`, admSgn(x.sum))).join("") || `<div class="hint" style="padding:14px">Пусто</div>`}</div>`;
  } else if (ADM.tab === "sales") {
    const s = await api("admin/sales");
    const card = (t, x) => `<div><span>${t}</span><b>${fmt(x.xtr)} <i class="adm-tg">${ic("tgplane")}</i></b><small>${x.n} покупок · ${x.buyers} чел.</small></div>`;
    const mx = Math.max(1, ...s.days.map(d => d.xtr));
    body.innerHTML = `<div class="adm-sales">${card("Сегодня", s.today)}${card("7 дней", s.week)}${card("Всего", s.all)}</div>
      <div class="sec-t">${ic("trend")}По дням (14 дней), Telegram Stars</div>
      <div class="adm-bars">${s.days.length ? s.days.map(d => `<div title="${d.xtr}"><i style="height:${Math.max(4, d.xtr / mx * 100)}%"></i><span>${new Date(d.day * 1000).getDate()}</span></div>`).join("") : `<div class="hint" style="padding:14px">Покупок пока нет</div>`}</div>
      <div class="sec-t">${ic("crown")}Топ покупателей</div>
      <div class="box">${s.top.map(u => `<div class="row tap" data-act="adm-user" data-id="${u.id}">${avaHTML(u, 32)}<div class="grow"><div class="t">${esc(u.name)}</div><div class="s">${u.n} покупок</div></div><b>${fmt(u.xtr)} <i class="adm-tg">${ic("tgplane")}</i></b></div>`).join("") || `<div class="hint" style="padding:14px">Пусто</div>`}</div>
      <div class="sec-t">${ic("clock")}Последние покупки</div>
      <div class="box">${s.last.map(p => `<div class="row kv"><div class="grow"><div class="t">${esc(p.user.name)}</div><div class="s">+⭐ ${fmt(p.stars)} · ${admDate(p.ts)}</div></div><b>${p.xtr} <i class="adm-tg">${ic("tgplane")}</i></b></div>`).join("") || `<div class="hint" style="padding:14px">Пусто</div>`}</div>
      <div class="disc">Telegram Stars копятся на балансе бота — смотреть и выводить в @BotFather → бот → Payments / Stars.</div>`;
    starify(body);
  } else if (ADM.tab === "users") {
    const r = await api(`admin/users?sort=${ADM.sort}&qs=${encodeURIComponent(ADM.qs)}`);
    body.innerHTML = `<input id="adm-q" placeholder="Имя, @ник или id" value="${esc(ADM.qs)}" style="margin-bottom:10px">
      <div class="seg">${[["seen", "Недавние"], ["rich", "Богатые"], ["new", "Новые"]].map(([k, t]) => `<button data-act="adm-sort" data-v="${k}" class="${ADM.sort === k ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="box">${r.users.map(u => `<div class="row tap" data-act="adm-user" data-id="${u.id}">${avaHTML(u, 36)}
        <div class="grow"><div class="t">${esc(u.name)}${u.banned ? ` <span class="tl">· бан</span>` : ""}</div><div class="s">${u.username ? "@" + esc(u.username) + " · " : ""}${u.id} · ${admDate(u.seen)}</div></div>
        <b>⭐ ${short(u.stars)}</b></div>`).join("") || `<div class="hint" style="padding:14px">Никого не нашли</div>`}</div>`;
    const i = body.querySelector("#adm-q"); let t;
    i.oninput = () => { clearTimeout(t); t = setTimeout(() => { ADM.qs = i.value; admRender(el).then(() => { const n = el.querySelector("#adm-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 400); };
  } else if (ADM.tab === "odds") {
    const d = await api("admin/odds"), pc = v => +(v * 100).toFixed(2);
    body.innerHTML = `<p class="hint" style="margin:0 0 10px;font-size:12.5px">Возврат игроку на дистанции: 96% — из каждых ⭐ 100 ставок игрокам возвращается ⭐ 96, казино оставляет 4%. Меньше 100% — казино в плюсе, больше 100% — игроки в плюсе. Действует сразу. Можно ${pc(d.lo)}–${pc(d.hi)}%.</p>
      ${d.promo ? `<div class="adm-warn"><b>Идёт акция «Щедрые выходные».</b> Пока она идёт, часть игр отдаёт не меньше 98% (апгрейд 93%, скретч 96%), значения ниже не действуют. Выключить — вкладка «Обзор».</div>` : ""}
      <div class="box">${d.list.map(g => `<div class="adm-odd${g.value > 1 ? " plus" : ""}">
        <div class="adm-oh"><b>${esc(g.title)}</b>${g.value > 1 ? `<span class="adm-tag red">игроки в плюсе</span>` : g.changed ? `<span class="adm-tag">изменено</span>` : ""}</div>
        <div class="adm-os">по умолчанию ${pc(g.default)}% · казино за 7 дн: <span class="${g.house7 >= 0 ? "tw" : "tl"}">${g.house7 >= 0 ? "+" : "−"}⭐ ${short(Math.abs(g.house7))}</span> · ${fmt(g.rounds7)} игр</div>
        ${g.effective !== g.value ? `<div class="adm-os tl">сейчас действует ${pc(g.effective)}% — из-за акции</div>` : ""}
        ${d.canEdit ? `<div class="adm-oc"><input class="adm-oi" inputmode="decimal" data-k="${g.key}" value="${pc(g.value)}"><span class="adm-op">%</span>
          <button class="btn sm gold" data-act="adm-odds" data-k="${g.key}">${ic("check")}Сохранить</button>
          ${g.changed ? `<button class="btn sm ghost" data-act="adm-odds-rs" data-k="${g.key}" data-n="${esc(g.title)}">${ic("refresh")}</button>` : ""}</div>` : `<div class="adm-oc"><b>${pc(g.value)}%</b></div>`}</div>`).join("")}</div>
      ${d.canEdit ? "" : `<div class="hint" style="font-size:12px;text-align:center;margin-top:8px">Менять шансы может только владелец</div>`}
      <div class="disc">Прибыль казино за 7 дней сильно зависит от удачи: один крупный выигрыш может перекрыть день. Рулетка (97,3%), блэкджек и кейсы здесь не настраиваются: кейсы — в settings.toml.</div>`;
    starify(body);
  } else if (ADM.tab === "pay") {
    const d = await api("admin/pay"), c = d.cfg, ed = d.canEdit, w = d.week;
    const pair = x => `<div class="row tap" data-act="adm-user" data-id="${x.a.id}">${avaHTML(x.a, 28)}<span class="adm-arr">${ic("chev")}</span>${avaHTML(x.b, 28)}
      <div class="grow" style="min-width:0"><div class="t">${esc(x.a.name)} → ${esc(x.b.name)}</div><div class="s">${x.n != null ? fmt(x.n) + " переводов за 7 дн" : admDate(x.ts) + (x.note ? " · «" + esc(x.note) + "»" : "")}</div></div>
      <b>⭐ ${short(x.sum != null ? x.sum : x.amount)}</b></div>`;
    const field = (k, title, hint, val, unit) => `<div class="adm-odd"><div class="adm-oh"><b>${title}</b>${d.changed.includes(k) ? `<span class="adm-tag">изменено</span>` : ""}</div>
      <div class="adm-os">${hint}</div>
      ${ed ? `<div class="adm-oc"><input class="adm-oi" inputmode="decimal" data-k="${k}" value="${val}"><span class="adm-op">${unit}</span>
        <button class="btn sm gold" data-act="adm-pay" data-k="${k}">${ic("check")}Сохранить</button>
        ${d.changed.includes(k) ? `<button class="btn sm ghost" data-act="adm-pay-rs" data-k="${k}">${ic("refresh")}</button>` : ""}</div>` : `<div class="adm-oc"><b>${val} ${unit}</b></div>`}</div>`;
    body.innerHTML = `<div class="box">
        <div class="row kv"><div class="grow"><div class="t">Переводы включены</div><div class="s" style="white-space:normal">Если выключить, кнопка «Перевести» у игроков перестанет работать</div></div>
          ${ed ? `<button class="sw${c.on ? " on" : ""}" data-act="adm-pay-on" data-v="${c.on ? 0 : 1}"></button>` : `<b>${c.on ? "да" : "нет"}</b>`}</div>
        ${field("fee", "Комиссия", `платит отправитель сверху суммы, уходит в банк · по умолчанию ${+(d.defaults.fee * 100).toFixed(2)}%`, +(c.fee * 100).toFixed(2), "%")}
        ${field("min", "Минимальный перевод", `по умолчанию ⭐ ${fmt(d.defaults.min)}`, c.min, "⭐")}
        ${field("max", "Максимум за один перевод", `0 — без ограничения · по умолчанию ${d.defaults.max ? "⭐ " + fmt(d.defaults.max) : "0"}`, c.max, "⭐")}
        ${field("day", "Переводов в сутки с аккаунта", `по умолчанию ${d.defaults.day}`, c.day, "шт")}</div>
      ${ed ? "" : `<div class="hint" style="font-size:12px;text-align:center;margin-top:8px">Менять настройки может только владелец</div>`}
      <div class="sec-t">За 7 дней</div>
      <div class="box">${admKv("Переводов", `<b>${fmt(w.n)}</b>`)}${admKv("Переведено", `<b>⭐ ${fmt(w.sum)}</b>`)}${admKv("Комиссия в банк", `<b class="tw">⭐ ${fmt(w.fee)}</b>`)}${admKv("Отправителей", `<b>${fmt(w.users)}</b>`)}</div>
      <div class="sec-t">Крупнейшие пары за 7 дней</div>
      <div class="box">${d.top.map(pair).join("") || `<div class="hint" style="padding:14px">Пусто</div>`}</div>
      <div class="sec-t">Последние переводы</div>
      <div class="box">${d.recent.map(pair).join("") || `<div class="hint" style="padding:14px">Переводов пока не было</div>`}</div>
      <div class="disc">Если двое постоянно перекидывают звёзды только друг другу — это может быть один человек с двух аккаунтов. Нажми на пару, чтобы открыть карточку отправителя.</div>`;
    starify(body);
  } else if (ADM.tab === "bc") {
    const st = await api("admin/broadcast");
    body.innerHTML = `<textarea id="adm-bc" rows="5" placeholder="Текст сообщения всем игрокам"></textarea>
      <button class="btn" data-act="adm-bc" style="margin-top:10px" ${st.running ? "disabled" : ""}>${ic("send")}Отправить всем</button>
      <div class="hint" style="font-size:12.5px;text-align:center;margin-top:10px">${st.total ? `Последняя рассылка: отправлено ${st.sent} из ${st.total}, ошибок ${st.failed}${st.running ? " · идёт…" : ""}` : "Сообщение придёт от бота с кнопкой «Открыть». Заблокированным не отправляется."}</div>`;
  } else {
    const r = await api("admin/log");
    body.innerHTML = `<div class="box">${r.log.map(x => `<div class="row kv"><div class="grow"><div class="t">${esc(x.action)}${x.target ? " · " + x.target : ""}</div><div class="s">${esc(x.detail || "")}</div></div><span class="hint" style="font-size:12px">${admDate(x.ts)}</span></div>`).join("") || `<div class="hint" style="padding:14px">Действий пока нет</div>`}</div>`;
  }
}

async function openAdmUser(id) {
  const el = openSheet(emptyHTML("hourglass", "Загружаем…"));
  const draw = async () => {
    const [u, cs, fr, tr] = await Promise.all([api("admin/user/" + id), api(`admin/user/${id}/cosm`), api(`admin/user/${id}/friends`),
      api(`admin/user/${id}/transfers`).catch(() => ({ sent: 0, got: 0, list: [] }))]);
    const frRow = (f, s) => `<div class="row tap" data-act="adm-user" data-id="${f.id}">${avaHTML(f, 32)}<div class="grow"><div class="t">${esc(f.name)}</div><div class="s">${s} · был ${admDate(f.seen)}</div></div>${ic("chev")}</div>`;
    replaceSheet(el, `<div style="display:flex;align-items:center;gap:12px;margin:4px 0 12px">${avaHTML(u, 48)}<div class="grow"><b style="font-size:19px">${esc(u.name)}</b>
        <div class="hint" style="font-size:13px">${u.username ? "@" + esc(u.username) + " · " : ""}id ${u.id}${u.banned ? ` · <span class="tl">заблокирован</span>` : ""}</div></div></div>
      <div class="box">${admKv("Баланс", `<b>⭐ ${fmt(u.stars)}</b>`)}${admKv("Подарков", `<b>${fmt(u.gifts)} · ⭐ ${fmt(u.giftsValue)}</b>`)}
        ${admKv("Итог в играх 24 ч / всего", `<span>${admSgn(u.pnl24)} / ${admSgn(u.pnlAll)}</span>`)}${admKv("Кейсов открыто", `<b>${fmt(u.opened)}</b>`)}
        ${admKv("Рефералов", `<b>${fmt(u.refs)}</b>`)}${admKv("Регистрация / был", `<b>${admDate(u.created)} / ${admDate(u.seen)}</b>`)}</div>
      <div class="btns"><button class="btn green sm" style="flex:1" data-act="adm-stars" data-id="${u.id}" data-v="1">+ Звёзды</button>
        <button class="btn ghost sm" style="flex:1" data-act="adm-stars" data-id="${u.id}" data-v="-1">− Звёзды</button>
        <button class="btn ${u.banned ? "ghost" : "red"} sm" style="flex:1" data-act="adm-ban" data-id="${u.id}" data-v="${u.banned ? 0 : 1}">${u.banned ? "Разбанить" : "Забанить"}</button></div>
      <div class="btns"><button class="btn gold sm" style="flex:1" data-act="adm-gift" data-id="${u.id}">${ic("gift")}Подарок</button>
        <button class="btn gold sm" style="flex:1" data-act="adm-keys" data-id="${u.id}">${ic("lock")}Кейсы</button></div>
      ${u.canGrant && !u.isOwner ? `<button class="btn ${u.isAdmin ? "red" : "ghost"} sm" style="width:100%;margin-top:8px" data-act="adm-grant" data-id="${u.id}" data-v="${u.isAdmin ? 0 : 1}" data-n="${esc(u.name)}">${ic("crown")}${u.isAdmin ? "Снять админку" : "Сделать админом"}</button>`
        : u.isAdmin ? `<div class="hint" style="font-size:12px;text-align:center;margin-top:8px">${u.isOwner ? "Владелец" : "Администратор"}</div>` : ""}
      <button class="btn ghost sm" style="width:100%;margin-top:8px" data-act="profile" data-id="${u.id}">Открыть профиль</button>
      ${u.log.length ? `<div class="sec-t">Действия админа</div><div class="box">${u.log.map(x => admKv(`${esc(x.action)} ${esc(x.detail || "")}`, `<span class="hint" style="font-size:12px">${admDate(x.ts)}</span>`)).join("")}</div>` : ""}
      <div class="sec-t">Друзья · ${fr.ok.length}</div>
      <div class="box">${fr.ok.map(f => frRow(f, "друзья с " + admDate(f.since))).join("") || `<div class="hint" style="padding:14px">Друзей нет</div>`}</div>
      ${fr.in.length || fr.out.length ? `<div class="sec-t">Заявки в друзья</div><div class="box">${fr.in.map(f => frRow(f, "входящая заявка")).join("")}${fr.out.map(f => frRow(f, "исходящая заявка")).join("")}</div>` : ""}
      <div class="sec-t">Переводы · отправлено ⭐ ${fmt(tr.sent)} · получено ⭐ ${fmt(tr.got)}</div>
      <div class="box">${tr.list.map(t => `<div class="row tap" data-act="adm-user" data-id="${t.user.id}">${avaHTML(t.user, 32)}<div class="grow"><div class="t">${esc(t.user.name)}</div>
        <div class="s">${t.in ? "получено от" : "отправлено"} · ${admDate(t.ts)}${t.note ? " · «" + esc(t.note) + "»" : ""}</div></div><b class="${t.in ? "tw" : "tl"}">${t.in ? "+" : "−"}${fmt(t.amount)}</b></div>`).join("") || `<div class="hint" style="padding:14px">Переводов не было</div>`}</div>
      <div class="sec-t">Оформление · ${cs.list.length}</div>
      <div class="box">${cs.list.map(c => `<div class="row"><div class="grow"><div class="t">${esc(c.title)}</div><div class="s">${c.kind === "frame" ? "рамка" : "ник"} · до ${admDate(c.until)} · ⭐ ${fmt(c.price)}</div></div>
        <button class="btn sm red" data-act="adm-cosm-rm" data-id="${u.id}" data-i="${c.item}" data-n="${esc(c.title)}" data-p="${c.price}">Забрать</button></div>`).join("") || `<div class="hint" style="padding:14px">Ничего не куплено</div>`}</div>
      <div class="sec-t">Подарки · ${u.giftList.length}</div>
      <div class="box">${u.giftList.map(g => `<div class="row"><img class="spi" style="width:36px;height:36px;margin:0" src="${A.model(g.col, g.model, 64)}" alt="">
        <div class="grow"><div class="t">${esc(g.col)} <small class="hint">#${fmt(g.num)}</small></div><div class="s">${esc(g.model)} · ⭐ ${fmt(g.value)}${g.price != null ? " · на маркете" : ""}</div></div>
        <button class="btn sm red" data-act="adm-gift-rm" data-id="${u.id}" data-g="${g.id}" data-n="${esc(g.col)} #${fmt(g.num)}">${ic("x")}</button></div>`).join("") || `<div class="hint" style="padding:14px">Подарков нет</div>`}</div>
      <div class="sec-t">Последние операции</div>
      <div class="box">${u.events.map(x => admKv(`${esc(x.kind)} · ${admDate(x.ts)}`, admSgn(x.delta))).join("") || `<div class="hint" style="padding:14px">Пусто</div>`}</div>`);
  };
  el._redraw = draw;
  await draw();
}

let ADM_CAT = null;
const admSel = (id, opts, first) => `<select id="${id}" class="adm-sel">${first ? `<option value="">${first}</option>` : ""}${opts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join("")}</select>`;
async function openAdmGift(uid) {
  if (!ADM_CAT || !ADM_CAT.bases) ADM_CAT = await api("admin/catalog");
  const el = openSheet(`<h2 class="gtitle">Выдать подарок</h2>
    <input id="ag-q" placeholder="Поиск коллекции" style="margin-bottom:10px">
    <div class="adm-cg" id="ag-grid"></div>`, "admg-s");
  el._uid = uid;
  const paint = qs => {
    const list = ADM_CAT.cols.filter(c => !qs || c.toLowerCase().includes(qs.toLowerCase()));
    el.querySelector("#ag-grid").innerHTML = list.map(c => `<button class="adm-ci" data-act="ag-col" data-v="${esc(c)}"><img src="${A.orig(c, 128)}" loading="lazy" alt="">
      <b>${esc(c)}</b><span>⭐ ${short(ADM_CAT.bases[c] || 0)}</span></button>`).join("") || `<div class="hint" style="grid-column:1/-1;padding:20px;text-align:center">Ничего не найдено</div>`;
    starify(el.querySelector("#ag-grid"));
  };
  let t; el.querySelector("#ag-q").oninput = e => { clearTimeout(t); t = setTimeout(() => paint(e.target.value.trim()), 200); };
  paint("");
}
async function admGiftCol(col) {
  const el = topSheet(), uid = el._uid;
  const d = await api("admin/catalog?col=" + encodeURIComponent(col));
  el._g = { col, model: "" };
  replaceSheet(el, `<div class="adm-gh"><button class="btn sm ghost" data-act="ag-back">${ic("chev")}</button><img src="${A.orig(col, 96)}" alt=""><div><b>${esc(col)}</b><span>${d.models.length} моделей · база ⭐ ${fmt(d.base)}</span></div></div>
    <div class="sec-t" style="margin-top:6px">Модель <span class="hint" style="text-transform:none;font-weight:500">редкие — первыми</span></div>
    <div class="adm-cg models" id="ag-models"><button class="adm-ci on" data-act="ag-model" data-v=""><span class="adm-rnd">${ic("refresh")}</span><b>Случайная</b><span>как из кейса</span></button>
      ${d.models.map(m => `<button class="adm-ci" data-act="ag-model" data-v="${esc(m)}"><img src="${A.model(col, m, 128)}" loading="lazy" alt=""><b>${esc(m)}</b></button>`).join("")}</div>
    <details class="rules" style="margin-top:12px"><summary>${ic("layers")}Дополнительно: фон и узор</summary>
      <div class="adm-f"><span>Фон</span>${admSel("ag-bd", d.backdrops.map(x => [x, x]), "случайный")}</div>
      <div class="adm-f"><span>Узор</span>${admSel("ag-sym", d.symbols.map(x => [x, x]), "случайный")}</div></details>
    <div class="adm-gfoot">
      <div class="adm-f" style="margin-top:0"><span>Сколько</span><input id="ag-n" inputmode="numeric" value="1"></div>
      <div class="auto" style="margin-top:8px"><button class="sw on" id="ag-feed" data-act="adm-feed-tog"></button><span style="flex:1">Показать в живой ленте</span></div>
      <button class="btn gold" data-act="adm-gift-go" data-id="${uid}" style="margin-top:10px">${ic("gift")}Выдать</button></div>`);
  starify(el);
}
async function openAdmKeys(uid) {
  if (!ADM_CAT) ADM_CAT = await api("admin/catalog");
  openSheet(`<h2 class="gtitle">Выдать кейсы</h2>
    <div class="adm-f"><span>Кейс</span>${admSel("ak-cid", ADM_CAT.cases.map(c => [c.id, `${c.title}${c.price ? " · ⭐ " + fmt(c.price) : ""}`]))}</div>
    <div class="adm-f"><span>Сколько</span><input id="ak-n" inputmode="numeric" value="1"></div>
    <button class="btn gold" data-act="adm-keys-go" data-id="${uid}" style="margin-top:12px">${ic("lock")}Выдать ключи</button>
    <div class="hint" style="font-size:12px;text-align:center;margin-top:8px">Игрок откроет кейс бесплатно, даже если уровень ещё не дорос. Придёт сообщение от бота.</div>`);
}
Object.assign(ACT, {
  adm: () => openAdmin(),
  "adm-event": async el => { await post("admin/event", { mode: el.dataset.v }); H.ok(); toast("Готово", "ok"); CASES = []; await loadMe(); admRender(); },
  "adm-promo": async el => { await post("admin/promo", { mode: el.dataset.v }); H.ok(); toast("Готово", "ok"); await loadMe(); admRender(); },
  "adm-gift": el => openAdmGift(+el.dataset.id),
  "adm-keys": el => openAdmKeys(+el.dataset.id),
  "adm-feed-tog": el => { el.classList.toggle("on"); H.sel(); },
  "adm-gift-rm": async el => {
    if (!await confirmM("Забрать подарок?", `${esc(el.dataset.n)} будет удалён у игрока насовсем. Действие попадёт в журнал.`, "Забрать")) return;
    await post(`admin/user/${el.dataset.id}/gift/${el.dataset.g}/remove`); H.ok(); toast("Подарок забран", "ok");
    topSheet()._redraw && topSheet()._redraw();
  },
  "adm-cosm-rm": async el => {
    const d = el.dataset, el2 = openSheet(`<h2 class="gtitle">Забрать «${esc(d.n)}»?</h2>
      <p class="hint" style="text-align:center;margin:0 0 14px">Вещь пропадёт у игрока. Действие попадёт в журнал.</p>
      <button class="btn gold" data-act="adm-cosm-go" data-r="1">Забрать и вернуть ⭐ ${fmt(+d.p)}</button>
      <button class="btn ghost" data-act="adm-cosm-go" data-r="0" style="margin-top:8px">Забрать без возврата</button>`);
    el2._c = { id: d.id, item: d.i };
    starify(el2);
  },
  "adm-cosm-go": async el => {
    const c = topSheet()._c;
    const r = await post(`admin/user/${c.id}/cosm/${c.item}/remove`, { refund: el.dataset.r === "1" }); H.ok();
    toast(r.refund ? `Забрано, вернули ⭐ ${fmt(r.refund)}` : "Забрано", "ok"); closeSheet();
    if (+c.id === ME.id) loadMe();
    topSheet() && topSheet()._redraw && topSheet()._redraw();
  },
  "ag-col": el => admGiftCol(el.dataset.v),
  "ag-back": () => { const uid = topSheet()._uid; closeSheet(); openAdmGift(uid); },
  "ag-model": el => { topSheet()._g.model = el.dataset.v; H.sel(); el.parentElement.querySelectorAll(".adm-ci").forEach(b => b.classList.toggle("on", b === el)); },
  "adm-gift-go": async el => {
    const s = topSheet(), v = id => s.querySelector(id).value;
    const r = await post(`admin/user/${el.dataset.id}/gift`, { col: s._g.col, model: s._g.model, backdrop: v("#ag-bd"), symbol: v("#ag-sym"), n: Math.max(1, +v("#ag-n") || 1), feed: s.querySelector("#ag-feed").classList.contains("on") });
    H.ok(); toast(`Выдано: ${r.gifts.length} · ⭐ ${fmt(r.gifts.reduce((a, g) => a + g.value, 0))}`, "ok"); closeSheet();
    topSheet() && topSheet()._redraw && topSheet()._redraw();
  },
  "adm-keys-go": async el => {
    const s = topSheet();
    await post(`admin/user/${el.dataset.id}/keys`, { cid: s.querySelector("#ak-cid").value, n: Math.max(1, +s.querySelector("#ak-n").value || 1) });
    H.ok(); toast("Ключи выданы", "ok"); closeSheet(); CASES = [];
  },
  "adm-odds": async el => {
    const inp = topSheet().querySelector(`.adm-oi[data-k="${el.dataset.k}"]`), v = parseFloat(inp.value.replace(",", "."));
    if (!(v > 0)) return toast("Введи число, например 95");
    if (v > 100 && !await confirmM("Больше 100%?", `При ${v}% игроки на дистанции выигрывают больше, чем ставят: казино будет терять звёзды на каждой ставке, а самые хитрые смогут фармить звёзды без риска. Точно ставим?`, "Да, ставим")) return;
    await post("admin/odds", { key: el.dataset.k, value: v / 100 }); H.ok(); toast("Сохранено", "ok"); await loadMe(); admRender();
  },
  "adm-pay": async el => {
    const k = el.dataset.k, inp = topSheet().querySelector(`.adm-oi[data-k="${k}"]`), v = parseFloat(inp.value.replace(",", ".").replace(/\s/g, ""));
    if (!(v >= 0)) return toast("Введи число");
    await post("admin/pay", { [k]: k === "fee" ? v / 100 : Math.round(v) }); H.ok(); toast("Сохранено", "ok"); admRender();
  },
  "adm-pay-rs": async el => { await post("admin/pay", { [el.dataset.k]: null }); H.ok(); toast("Сброшено", "ok"); admRender(); },
  "adm-pay-on": async el => {
    const on = el.dataset.v === "1";
    if (!on && !await confirmM("Выключить переводы?", "Игроки не смогут переводить звёзды друг другу, пока не включишь обратно.", "Выключить")) return;
    await post("admin/pay", { on }); H.ok(); toast(on ? "Переводы включены" : "Переводы выключены", "ok"); admRender();
  },
  "adm-odds-rs": async el => {
    if (!await confirmM("Сбросить?", `${esc(el.dataset.n)}: вернуть значение по умолчанию из settings.toml.`, "Сбросить")) return;
    await post("admin/odds", { key: el.dataset.k, value: null }); H.ok(); toast("Сброшено", "ok"); await loadMe(); admRender();
  },
  "adm-tab": el => { ADM.tab = el.dataset.v; H.sel(); const s = topSheet(); s.querySelectorAll("#adm-seg button").forEach(b => b.classList.toggle("on", b === el)); s.querySelector("#adm-body").innerHTML = emptyHTML("hourglass", "Загружаем…"); admRender(s); },
  "adm-sort": el => { ADM.sort = el.dataset.v; H.sel(); admRender(); },
  "adm-user": el => openAdmUser(+el.dataset.id),
  "adm-stars": async el => {
    const sign = +el.dataset.v;
    const v = await promptM(sign > 0 ? "Начислить звёзды" : "Списать звёзды", "Сумма в звёздах. Действие попадёт в журнал.", "1000", sign > 0 ? "Начислить" : "Списать");
    if (v == null || !(Math.floor(+v) > 0)) return;
    await post(`admin/user/${el.dataset.id}/stars`, { delta: sign * Math.floor(+v) }); H.ok(); toast("Готово", "ok");
    if (+el.dataset.id === ME.id) loadMe();
    topSheet()._redraw && topSheet()._redraw();
  },
  "adm-grant": async el => {
    const on = el.dataset.v === "1";
    if (!await confirmM(on ? "Сделать админом?" : "Снять админку?", on ? `${esc(el.dataset.n)} получит админ-панель: начислять и списывать звёзды, банить, выдавать подарки и кейсы, делать рассылки. Все действия пишутся в журнал. Выдавать админку дальше сможешь только ты.` : `${esc(el.dataset.n)} потеряет доступ к админ-панели.`, on ? "Выдать" : "Снять")) return;
    await post(`admin/user/${el.dataset.id}/admin`, { on }); H.ok(); toast(on ? "Админка выдана" : "Админка снята", "ok");
    topSheet()._redraw && topSheet()._redraw();
  },
  "adm-ban": async el => {
    const on = el.dataset.v === "1";
    if (on && !await confirmM("Заблокировать игрока?", "Он не сможет пользоваться игрой, пока не разбаните.", "Заблокировать")) return;
    await post(`admin/user/${el.dataset.id}/ban`, { ban: on }); H.ok(); toast(on ? "Заблокирован" : "Разблокирован", "ok");
    topSheet()._redraw && topSheet()._redraw();
  },
  "adm-bc": async () => {
    const text = topSheet().querySelector("#adm-bc").value.trim();
    if (!text) return toast("Напиши текст");
    if (!await confirmM("Разослать всем?", "Сообщение уйдёт всем игрокам от бота.", "Отправить")) return;
    const r = await post("admin/broadcast", { text }); H.ok(); toast(`Рассылка запущена: ${r.total} игроков`, "ok");
    setTimeout(() => admRender(), 1500);
  },
});
