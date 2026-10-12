"use strict";
// ============================================================
//  «Кошелёк» в стиле WeChat: баланс крупно, «Сканировать» / «Получить» (свой QR с аватаркой), перевод звёзд игроку.
//  QR ведёт на бота (t.me/<бот>?start=pay_<id>[_<сумма>]) — работает и из сканера в игре, и из обычной камеры.
// ============================================================
Object.assign(ICONS, {
  xfer: '<path d="M7 3l1.1 2.8 3 .2-2.3 1.9.7 2.9L7 9.2l-2.5 1.6.7-2.9L2.9 6l3-.2Z" fill="currentColor" stroke-width="1"/><path d="M17 12.6l1.1 2.8 3 .2-2.3 1.9.7 2.9-2.5-1.6-2.5 1.6.7-2.9-2.3-1.9 3-.2Z" fill="currentColor" stroke-width="1"/><path d="M12.6 3.6a8.6 8.6 0 0 1 7.8 7.2"/><path d="m18.3 9.3 2.1 1.6 1.7-2.1"/><path d="M11.4 20.4a8.6 8.6 0 0 1-7.8-7.2"/><path d="m5.7 14.7-2.1-1.6-1.7 2.1"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M17 20h4v-3"/>',
});

const PAY = { info: null, friends: null, busy: false, seq: 0 };
const payTime = ts => new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
function payDay(ts) {
  const d = new Date(ts * 1000), t = new Date(), y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return "Сегодня";
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

// крупный баланс: цифры «набегают» от нуля, потом поле живое (класс bal-live — обновляется вместе с балансом в шапке)
function payCount(el, to) {
  if (!el) return;
  if (window.LITE) { el.textContent = fmt(to); el.classList.add("bal-live"); return; }
  const t0 = performance.now(), d = 700;
  const step = t => {
    const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step); else { el.classList.add("bal-live"); el.textContent = fmt(ME.stars); }
  };
  requestAnimationFrame(step);
}

const payRow = x => `<div class="row tap pay-row" data-act="pay-to" data-id="${x.user.id}">${avaHTML(x.user, 40)}<div class="grow"><div class="t">${esc(x.user.name)}</div>
  <div class="s">${x.in ? "Входящий" : "Исходящий"} · ${payTime(x.ts)}${x.note ? " · «" + esc(x.note) + "»" : ""}</div></div>
  <b class="pay-d ${x.in ? "in" : ""}">${x.in ? "+" : "−"}${fmt(x.amount)} ⭐</b></div>`;
function payHistory(list) {
  if (!list.length) return `<div class="box"><div class="pay-none">${ic("xfer")}<span>Переводов пока не было</span></div></div>`;
  let out = "", day = "";
  for (const x of list) {
    const d = payDay(x.ts);
    if (d !== day) { out += (day ? "</div>" : "") + `<div class="pay-day">${d}</div><div class="box">`; day = d; }
    out += payRow(x);
  }
  return out + "</div>";
}
const payPeer = (u, tag) => `<button class="pay-peer" data-act="pay-to" data-id="${u.id}">${avaHTML(u, 50)}<span>${esc(u.name)}</span>${tag ? `<i>${tag}</i>` : ""}</button>`;
// недавние получатели/отправители из истории + друзья, без повторов
function payPeers() {
  const seen = new Set(), out = [];
  for (const x of (PAY.info && PAY.info.history) || []) if (!seen.has(x.user.id)) { seen.add(x.user.id); out.push(payPeer(x.user, "недавно")); }
  for (const u of PAY.friends || []) if (!seen.has(u.id)) { seen.add(u.id); out.push(payPeer(u)); }
  return out.slice(0, 20).join("") || `<div class="hint pay-empty">Добавь друзей или найди игрока поиском</div>`;
}

async function openPay(el) {
  H.imp("light");
  if (!el) el = openSheet(emptyHTML("hourglass", "Загружаем…"), "pay-s");
  let r, fr;
  try { [r, fr] = await Promise.all([api("pay"), api("friends").catch(() => ({ friends: [] }))]); } catch (e) { if (SHEETS.includes(el)) closeSheet(); return; }
  if (!el.isConnected) return;
  PAY.info = r; PAY.friends = fr.friends || [];
  setStars(r.stars);
  const w = r.week || { in: 0, out: 0 };
  replaceSheet(el, `<div class="pay-hero">
      <div class="pay-hl">${ic("xfer")}<span>Кошелёк</span><em>id ${ME.id}</em></div>
      <div class="pay-bal"><span class="pay-st">⭐</span><span class="pay-num">0</span></div>
      <div class="pay-sub">звёзд на балансе</div>
      <div class="pay-wk"><span class="in">+${short(w.in)} ⭐<small>получено за 7 дн</small></span><span>−${short(w.out)} ⭐<small>отправлено за 7 дн</small></span></div>
      <div class="pay-acts">
        <button data-act="pay-scan"><span class="pay-ic">${ic("scan")}</span><b>Сканировать</b><small>QR друга</small></button>
        <button data-act="pay-recv"><span class="pay-ic">${ic("qr")}</span><b>Получить</b><small>мой QR</small></button>
      </div></div>
    ${r.on === false ? `<div class="adm-warn">Переводы временно отключены администрацией</div>` : ""}
    <div class="pay-find">${ic("search")}<input class="pay-q" placeholder="Кому перевести: имя или @username" autocomplete="off"></div>
    <div class="pay-peers">${payPeers()}</div>
    <div class="sec-t">История переводов</div>
    ${payHistory(r.history)}
    <p class="hint pay-note">Комиссия ${+(r.fee * 100).toFixed(2)}% платит отправитель — получатель получает ровно указанную сумму</p>`);
  starify(el);
  payCount(el.querySelector(".pay-num"), r.stars);
  let t;
  el.querySelector(".pay-q").oninput = e => {
    clearTimeout(t);
    const v = e.target.value.trim(), my = ++PAY.seq;
    t = setTimeout(async () => {
      const box = el.querySelector(".pay-peers");
      if (v.length < 2) { box.innerHTML = payPeers(); return; }
      const list = await api("users/search?qs=" + enc(v)).catch(() => []);
      if (my !== PAY.seq || !el.isConnected) return;   // пока ждали ответ, запрос уже поменялся
      box.innerHTML = list.map(u => payPeer(u)).join("") || `<div class="hint pay-empty">Никого не нашли</div>`;
    }, 300);
  };
}

// «Получить»: свой QR с аватаркой в центре, по желанию — с суммой
function openPayRecv(amt = 0) {
  H.imp("light");
  const link = ME.refLink.replace(/start=.*$/, `start=pay_${ME.id}${amt ? "_" + amt : ""}`);
  let qr = ""; try { qr = qrSVG(link).svg; } catch (e) {}
  const html = `<div class="pay-rc">
      <div class="pay-rtop">${ic("qr")}<span>Получить звёзды</span></div>
      <div class="pay-rbody">
        <div class="pay-rh">${avaHTML(ME, 42)}<div class="grow"><b>${esc(ME.name)}</b><span>${ME.username ? "@" + esc(ME.username) : "id " + ME.id}</span></div></div>
        <div class="pay-rt">${amt ? "Отсканируй, чтобы перевести мне" : "Отсканируй, чтобы перевести мне звёзды"}</div>
        ${amt ? `<div class="pay-ramt"><span class="pay-st">⭐</span>${fmt(amt)}</div>` : ""}
        <div class="inv-code pay-code">${qr}<span class="inv-logo">${avaHTML(ME, 48)}</span></div>
        <div class="pay-rbtns"><button class="pay-link" data-act="pay-amt" data-v="${amt}">${amt ? "Изменить сумму" : "Указать сумму"}</button>
          ${amt ? `<button class="pay-link" data-act="pay-amt-clear">Без суммы</button>` : ""}</div>
      </div></div>
    <button class="btn gold pay-share" data-act="pay-share" data-l="${esc(link)}" data-v="${amt}">${ic("send")}Отправить ссылку в Telegram</button>
    <p class="hint pay-note">QR можно навести и обычной камерой телефона — откроется бот с кнопкой перевода</p>`;
  const top = SHEETS[SHEETS.length - 1];
  if (top && top.classList.contains("pay-r")) replaceSheet(top, html); else openSheet(html, "pay-r");
  starify(SHEETS[SHEETS.length - 1]);
}

function payParse(text) {
  const m = /(?:pay|ref)_(\d+)(?:_(\d+))?/.exec(text || "") || /[?&]pay=(\d+)(?:&amt=(\d+))?/.exec(text || "");
  return m ? { id: +m[1], amt: +(m[2] || 0) } : null;
}

function payScan() {
  H.imp("light");
  if (inTg && tg.showScanQrPopup && (!tg.isVersionAtLeast || tg.isVersionAtLeast("6.4"))) {
    tg.showScanQrPopup({ text: "Наведи камеру на QR-код игрока" }, text => {
      const p = payParse(text);
      if (!p) { H.err(); return false; }   // чужой QR — сканер остаётся открытым
      H.ok();
      setTimeout(() => openPaySend(p.id, p.amt), 60);
      return true;
    });
    return;
  }
  promptM("Перевод по id", "Сканер QR работает в Telegram на телефоне. Здесь можно ввести id игрока:", "", "Дальше").then(v => {
    const id = parseInt(v, 10); if (id > 0) openPaySend(id, 0);
  });
}

// экран перевода конкретному игроку
async function openPaySend(id, amt = 0) {
  if (PAY.busy) return;   // двойной тап не открывает два экрана
  PAY.busy = true;
  let u, info;
  try { [u, info] = await Promise.all([api("pay/peer/" + id), api("pay").catch(() => PAY.info || { fee: 0.05, min: 10 })]); }
  catch (e) { return; } finally { PAY.busy = false; }
  PAY.info = info;
  const fee = info.fee, min = info.min || 10, max = info.max || 0, fp = +(fee * 100).toFixed(2);
  const el = openSheet(`<div class="pay-to">${avaHTML(u, 78)}<span class="pay-tl">Перевод игроку</span><b>${esc(u.name)}</b><span>${u.username ? "@" + esc(u.username) : "id " + u.id}</span></div>
    <div class="pay-amt"><label>Сумма перевода</label>
      <div class="pay-ai"><span class="pay-st">⭐</span><input class="pay-a" inputmode="numeric" placeholder="0" value="${amt || ""}" autocomplete="off" maxlength="15"></div>
      <div class="pay-ab">Баланс: <b class="bal-live">${fmt(ME.stars)}</b> ⭐</div></div>
    <div class="pay-chips">${[100, 1000, 10000, 100000].map(v => `<button data-act="pay-chip" data-v="${v}">+${short(v)}</button>`).join("")}<button data-act="pay-chip" data-v="all">Всё</button></div>
    <div class="pay-sum"></div>
    <input class="pay-memo" maxlength="60" placeholder="Комментарий (необязательно)" autocomplete="off">
    <button class="btn gold pay-go" data-act="pay-go">${ic("send")}Перевести</button>`, "pay-x");
  el._peer = u;
  starify(el);
  const inp = el.querySelector(".pay-a"), box = el.querySelector(".pay-sum"), go = el.querySelector(".pay-go");
  const upd = () => {
    const a = payAmt(el), f = Math.ceil(a * fee);
    const txt = a ? fmt(a) : "";
    if (inp.value !== txt) inp.value = txt;
    let warn = "";
    if (info.on === false) warn = "Переводы временно отключены";
    else if (a && a < min) warn = `Минимум ${fmt(min)} ⭐`;
    else if (max && a > max) warn = `За один раз не больше ${fmt(max)} ⭐`;
    else if (a + f > ME.stars) warn = "Не хватает звёзд с учётом комиссии";
    box.innerHTML = `<div><span>Получит</span><b>${fmt(a)} ⭐</b></div><div><span>Комиссия ${fp}%</span><b>${fmt(f)} ⭐</b></div>
      <div class="tot"><span>Спишется</span><b>${fmt(a + f)} ⭐</b></div>${warn ? `<p class="tl">${warn}</p>` : !a ? `<p>Минимум ${fmt(min)} ⭐${max ? ` · максимум ${fmt(max)} ⭐` : ""}</p>` : ""}`;
    go.disabled = !a || !!warn;
    el.querySelector(".pay-amt").classList.toggle("bad", !!warn && !!a);
    starify(box);
  };
  el._upd = upd; el._fee = fee;
  inp.oninput = upd; upd();
  if (!amt) setTimeout(() => inp.focus(), 350);
}

const payAmt = el => Math.min(1e12, parseInt((el.querySelector(".pay-a").value || "").replace(/\D/g, ""), 10) || 0);

Object.assign(ACT, {
  pay: () => openPay(),
  "pay-scan": () => payScan(),
  "pay-recv": () => openPayRecv(0),
  "pay-to": el => openPaySend(+el.dataset.id),
  "pay-amt": async el => {
    const v = await promptM("Сумма", "Сколько звёзд попросить? QR обновится с этой суммой", el.dataset.v !== "0" ? el.dataset.v : "", "Готово");
    const a = parseInt(String(v || "").replace(/\D/g, ""), 10) || 0;
    if (v != null) openPayRecv(Math.min(a, 1e9));
  },
  "pay-amt-clear": () => openPayRecv(0),
  "pay-share": el => {
    const a = +el.dataset.v, text = a ? `Переведи мне ${fmt(a)} ⭐ в игре` : "Мой кошелёк в игре — переводи звёзды по ссылке";
    const url = `https://t.me/share/url?url=${enc(el.dataset.l)}&text=${enc(text)}`;
    if (inTg) tg.openTelegramLink(url); else copyText(el.dataset.l);
  },
  "pay-chip": el => {
    const s = el.closest(".sheet"); if (!s || !s._upd) return;
    H.sel();
    let a = el.dataset.v === "all" ? Math.floor(ME.stars / (1 + s._fee)) : payAmt(s) + +el.dataset.v;
    if (el.dataset.v === "all") while (a > 0 && a + Math.ceil(a * s._fee) > ME.stars) a--;
    if (PAY.info && PAY.info.max) a = Math.min(a, PAY.info.max);
    s.querySelector(".pay-a").value = String(Math.max(0, a)); s._upd();
  },
  "pay-go": async el => {
    const s = el.closest(".sheet"), u = s._peer, a = payAmt(s);
    if (s._sending || !a) return;   // двойной тап — одно подтверждение
    s._sending = true;
    const ok = await confirmM("Перевести?", `${esc(u.name)} получит <b>${fmt(a)} ⭐</b>. Перевод нельзя отменить.`, "Перевести");
    if (!ok) { s._sending = false; return; }
    el.disabled = true;
    const note = s.querySelector(".pay-memo").value.trim();
    let r;
    try { r = await post("pay/send", { to: u.id, amount: a, note }); } catch (e) { el.disabled = false; s._sending = false; return; }
    H.ok(); setStars(r.stars);
    replaceSheet(s, `<div class="pay-done"><div class="pay-ok">${ic("check")}</div><b>Перевод отправлен</b>
      <div class="pay-dsum"><span class="pay-st">⭐</span>${fmt(r.amount)}</div>
      <div class="pay-rcpt">
        <div><span>Получатель</span><b class="pay-who">${avaHTML(u, 22)}${esc(u.name)}</b></div>
        <div><span>Комиссия</span><b>${fmt(r.fee)} ⭐</b></div>
        <div><span>Списано</span><b>${fmt(r.amount + r.fee)} ⭐</b></div>
        ${note ? `<div><span>Комментарий</span><b>«${esc(note.slice(0, 60))}»</b></div>` : ""}
        <div><span>Время</span><b>${payTime(Date.now() / 1000)}</b></div>
        <div class="tot"><span>На балансе</span><b>${fmt(r.stars)} ⭐</b></div></div></div>
      <button class="btn gold" data-act="pay-done">Готово</button>`);
    starify(s);
    burstAt(s.querySelector(".pay-ok"));
  },
  "pay-done": () => {
    closeSheet();
    const top = SHEETS[SHEETS.length - 1];
    if (top && top.classList.contains("pay-s")) openPay(top);   // обновить кошелёк на месте
  },
});

// кнопка в шапке и переход из бота (?pay=<id>&amt=<сумма>)
(() => {
  const b = $("#pay-btn"); if (b) b.innerHTML = ic("xfer");
  const p = new URLSearchParams(location.search);
  if (p.get("pay")) {
    const go = () => ME ? openPaySend(+p.get("pay"), +(p.get("amt") || 0)) : setTimeout(go, 300);
    setTimeout(go, 600);
  }
})();
