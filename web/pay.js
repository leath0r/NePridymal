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

const PAY = { info: null, friends: null };

// крупный баланс: цифры «набегают» от нуля
function payCount(el, to) {
  if (!el) return;
  const t0 = performance.now(), d = 700;
  const step = t => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

const payRow = x => `<div class="row tap" data-act="pay-to" data-id="${x.user.id}">${avaHTML(x.user, 38)}<div class="grow"><div class="t">${esc(x.user.name)}</div>
  <div class="s">${x.in ? "Входящий" : "Исходящий"} · ${new Date(x.ts * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${x.note ? " · «" + esc(x.note) + "»" : ""}</div></div>
  <b class="pay-d ${x.in ? "in" : ""}">${x.in ? "+" : "−"}${fmt(x.amount)} ⭐</b></div>`;
const payPeer = u => `<button class="pay-peer" data-act="pay-to" data-id="${u.id}">${avaHTML(u, 48)}<span>${esc(u.name)}</span></button>`;

async function openPay() {
  H.imp("light");
  const el = openSheet(emptyHTML("hourglass", "Загружаем…"), "pay-s");
  let r, fr;
  try { [r, fr] = await Promise.all([api("pay"), api("friends").catch(() => ({ friends: [] }))]); } catch (e) { closeSheet(); return; }
  PAY.info = r; PAY.friends = fr.friends || [];
  setStars(r.stars);
  replaceSheet(el, `<div class="pay-hero">
      <div class="pay-hl">${ic("xfer")}Кошелёк</div>
      <div class="pay-bal"><span class="pay-st">⭐</span><span class="pay-num" id="pay-num">0</span></div>
      <div class="pay-sub">звёзд на балансе</div>
      <div class="pay-acts">
        <button data-act="pay-scan"><span class="pay-ic">${ic("scan")}</span><b>Сканировать</b></button>
        <button data-act="pay-recv"><span class="pay-ic">${ic("qr")}</span><b>Получить</b></button>
      </div></div>
    <div class="pay-find">${ic("search")}<input id="pay-q" placeholder="Кому перевести: имя или @username" autocomplete="off"></div>
    <div class="pay-peers" id="pay-peers">${PAY.friends.map(payPeer).join("") || `<div class="hint pay-empty">Добавь друзей или найди игрока поиском</div>`}</div>
    <div class="sec-t">История переводов</div>
    <div class="box">${r.history.map(payRow).join("") || `<div class="hint" style="padding:14px">Переводов пока не было</div>`}</div>
    ${r.on === false ? `<div class="adm-warn" style="margin-top:12px">Переводы временно отключены администрацией</div>` : ""}
    <p class="hint pay-note">Комиссия ${+(r.fee * 100).toFixed(2)}% платит отправитель — получатель получает ровно указанную сумму</p>`);
  starify(el);
  payCount($("#pay-num"), r.stars);
  let t;
  $("#pay-q").oninput = e => {
    clearTimeout(t);
    const v = e.target.value.trim();
    t = setTimeout(async () => {
      const list = v.length >= 2 ? await api("users/search?qs=" + enc(v)).catch(() => []) : PAY.friends;
      const box = $("#pay-peers"); if (!box) return;
      box.innerHTML = list.map(payPeer).join("") || `<div class="hint pay-empty">${v.length >= 2 ? "Никого не нашли" : "Добавь друзей или найди игрока поиском"}</div>`;
    }, 300);
  };
}

// «Получить»: свой QR с аватаркой в центре, по желанию — с суммой
function openPayRecv(amt = 0) {
  H.imp("light");
  const link = ME.refLink.replace(/start=.*$/, `start=pay_${ME.id}${amt ? "_" + amt : ""}`);
  let qr = ""; try { qr = qrSVG(link).svg; } catch (e) {}
  const html = `<div class="pay-rc">
      <div class="pay-rh">${avaHTML(ME, 40)}<div class="grow"><b>${esc(ME.name)}</b><span>${ME.username ? "@" + esc(ME.username) : "id " + ME.id}</span></div></div>
      <div class="pay-rt">Отсканируй, чтобы перевести мне звёзды</div>
      <div class="inv-code pay-code">${qr}<span class="inv-logo">${avaHTML(ME, 48)}</span></div>
      ${amt ? `<div class="pay-ramt"><span class="pay-st">⭐</span>${fmt(amt)}</div>` : ""}
      <div class="pay-rbtns"><button class="btn ghost sm" data-act="pay-amt" data-v="${amt}">${ic("edit")}${amt ? "Изменить сумму" : "Указать сумму"}</button>
        ${amt ? `<button class="btn ghost sm" data-act="pay-amt-clear">${ic("x")}Без суммы</button>` : ""}</div>
    </div>
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
  let u; try { u = await api("pay/peer/" + id); } catch (e) { return; }
  PAY.info = await api("pay").catch(() => PAY.info || { fee: 0.05, min: 10 });
  const fee = PAY.info.fee, min = PAY.info.min || 10, max = PAY.info.max || 0;
  const el = openSheet(`<div class="pay-to">${avaHTML(u, 76)}<b>${esc(u.name)}</b><span>${u.username ? "@" + esc(u.username) : "id " + u.id}</span></div>
    <div class="pay-amt"><span class="pay-st">⭐</span><input id="pay-a" inputmode="numeric" placeholder="0" value="${amt || ""}" autocomplete="off"></div>
    <div class="pay-chips">${[100, 1000, 10000, 100000].map(v => `<button data-act="pay-chip" data-v="${v}">+${short(v)}</button>`).join("")}<button data-act="pay-chip" data-v="all">Всё</button></div>
    <div class="pay-fee" id="pay-fee"></div>
    <input class="pay-memo" id="pay-n" maxlength="60" placeholder="Комментарий (необязательно)" autocomplete="off">
    <button class="btn gold pay-go" id="pay-go" data-act="pay-go" data-id="${u.id}">${ic("send")}Перевести</button>`, "pay-x");
  el._peer = u;
  starify(el);
  const inp = el.querySelector("#pay-a");
  const upd = () => {
    const a = parseInt(inp.value.replace(/\D/g, ""), 10) || 0, f = Math.ceil(a * fee);
    if (inp.value !== (a ? fmt(a) : "")) inp.value = a ? fmt(a) : "";
    const box = el.querySelector("#pay-fee"), go = el.querySelector("#pay-go");
    const fp = +(fee * 100).toFixed(2);
    if (!a) box.innerHTML = `Минимум ${fmt(min)} ⭐${max ? ` · максимум ${fmt(max)} ⭐` : ""} · комиссия ${fp}%`;
    else if (max && a > max) box.innerHTML = `<b class="tl">За один раз не больше ${fmt(max)} ⭐</b>`;
    else box.innerHTML = `Комиссия ${fp}%: ${fmt(f)} ⭐ · спишется <b class="${a + f > ME.stars ? "tl" : ""}">${fmt(a + f)} ⭐</b>`;
    go.disabled = a < min || a + f > ME.stars || (max && a > max) || PAY.info.on === false;
    starify(box);
  };
  el._upd = upd; el._fee = fee;
  inp.oninput = upd; upd();
  if (!amt) setTimeout(() => inp.focus(), 350);
}

const payAmt = el => parseInt((el.querySelector("#pay-a").value || "").replace(/\D/g, ""), 10) || 0;

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
    const s = SHEETS[SHEETS.length - 1]; if (!s || !s._upd) return;
    H.sel();
    const inp = s.querySelector("#pay-a");
    let a = el.dataset.v === "all" ? Math.floor(ME.stars / (1 + s._fee)) : payAmt(s) + +el.dataset.v;
    if (el.dataset.v === "all") while (a > 0 && a + Math.ceil(a * s._fee) > ME.stars) a--;
    if (PAY.info && PAY.info.max) a = Math.min(a, PAY.info.max);
    inp.value = String(Math.max(0, a)); s._upd();
  },
  "pay-go": async el => {
    const s = SHEETS[SHEETS.length - 1], u = s._peer, a = payAmt(s);
    const ok = await confirmM("Перевести?", `${esc(u.name)} получит <b>${fmt(a)} ⭐</b>. Перевод нельзя отменить.`, "Перевести");
    if (!ok) return;
    el.disabled = true;
    let r;
    try { r = await post("pay/send", { to: u.id, amount: a, note: s.querySelector("#pay-n").value }); } catch (e) { el.disabled = false; return; }
    H.ok(); setStars(r.stars);
    replaceSheet(s, `<div class="pay-done"><div class="pay-ok">${ic("check")}</div><b>Перевод отправлен</b>
      <div class="pay-dsum"><span class="pay-st">⭐</span>${fmt(r.amount)}</div>
      <div class="pay-dto">${avaHTML(u, 28)}<span>${esc(u.name)}</span></div>
      <span class="hint">Комиссия ${fmt(r.fee)} ⭐ · на балансе ${fmt(r.stars)} ⭐</span></div>
      <button class="btn gold" data-act="pay-done">Готово</button>`);
    starify(s);
    burstAt(s.querySelector(".pay-ok"));
    PAY.info = null;
  },
  "pay-done": () => {
    closeSheet();
    const top = SHEETS[SHEETS.length - 1];
    if (top && top.classList.contains("pay-s")) { closeSheet(); setTimeout(openPay, 360); }
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
