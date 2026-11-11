"use strict";
// ============================================================
//  Подарить подарок с открыткой: игроку или по ссылке любому. Распаковка подарка по ссылке.
// ============================================================
let PR = null;
async function openPresent(g) {
  PR = { g, mode: "player", to: null, friends: null };
  const el = openSheet(`<h2 class="gtitle">${ic("gift")} Подарить</h2>
    <div class="pr-card"><div class="pr-g">${giftHTML(g, { big: true })}</div>
      <div class="pr-note"><span>Открытка</span><textarea id="pr-t" maxlength="120" rows="3" placeholder="С днём рождения! 🎉"></textarea></div></div>
    <div class="seg" id="pr-m"><button data-act="pr-mode" data-v="player" class="on">${ic("users")}Игроку</button><button data-act="pr-mode" data-v="link">${ic("send")}По ссылке</button></div>
    <div id="pr-body"></div>`, "pr-s");
  startLottie(el);
  prBody();
}
async function prBody() {
  const b = $("#pr-body"); if (!b) return;
  if (PR.mode === "link") {
    b.innerHTML = `<div class="pr-linkinfo">${ic("send")}<div><b>Подарок по ссылке</b><span>Отправь ссылку кому угодно в Telegram — даже тому, кто ещё не играет. Друг откроет и заберёт подарок, а ты получишь бонус за приглашение. Не открыли за 7 дней — подарок вернётся.</span></div></div>
      <button class="btn gold cta" data-act="pr-link">${ic("gift")}Создать ссылку-подарок</button>
      <button class="btn ghost" data-act="gl-open" style="margin-top:8px">${ic("send")}Мои подарки по ссылке</button>`;
    return;
  }
  if (!PR.friends) PR.friends = (await api("friends").catch(() => ({ friends: [] }))).friends;
  b.innerHTML = `<label class="pr-search">${ic("search")}<input id="pr-q" placeholder="Найти игрока: имя или @ник"></label>
    <div class="box" id="pr-list"></div>
    <button class="btn gold cta" data-act="pr-send" id="pr-send" disabled style="margin-top:12px">${ic("gift")}Выбери получателя</button>`;
  const paint = list => {
    $("#pr-list").innerHTML = list.length ? list.map(u => `<div class="row tap${PR.to && PR.to.id === u.id ? " sel" : ""}" data-act="pr-to" data-id="${u.id}" data-n="${esc(u.name)}">${avaHTML(u, 34)}
      <div class="grow"><div class="t">${esc(u.name)}</div><div class="s">${u.username ? "@" + esc(u.username) : u.level + " ур."}</div></div><span class="pr-check">${ic("check")}</span></div>`).join("")
      : `<div class="hint" style="padding:14px;text-align:center">${PR.friends.length ? "Никого не нашли" : "Друзей пока нет — найди игрока поиском или подари по ссылке"}</div>`;
  };
  paint(PR.friends);
  let t; $("#pr-q").oninput = e => { clearTimeout(t); const v = e.target.value.trim(); t = setTimeout(async () => paint(v.length >= 2 ? await api("users/search?qs=" + encodeURIComponent(v)).catch(() => []) : PR.friends), 300); };
}
// распаковка подарка по ссылке
async function openPresentClaim(code) {
  let info; try { info = await api("giftlink/" + code); } catch (e) { return; }
  const el = openSheet(`<div class="pcw">
      <div class="pc-from">${info.sender ? avaHTML(info.sender, 44) : ""}<div><span>Подарок от</span><b>${esc(info.sender ? info.sender.name : "друга")}</b></div></div>
      ${info.text ? `<div class="pc-text">«${esc(info.text)}»</div>` : ""}
      <div class="pc-stage" id="pc-st">${info.status === "open" && !info.mine
        ? `<button class="pc-box" data-act="pc-open" data-code="${esc(code)}"><i class="lid"></i><i class="body"></i><i class="ribbon"></i><span>Нажми, чтобы открыть</span></button>`
        : `<div class="hint" style="text-align:center;padding:30px 10px">${info.mine ? "Это твой подарок — отправь ссылку другу" : info.status === "taken" ? "Этот подарок уже открыли" : "Срок подарка истёк"}</div>`}</div></div>`, "pc-s");
  el._code = code;
}
Object.assign(ACT, {
  present: el => openPresent(topSheet()._o.g),
  "pr-mode": el => { PR.mode = el.dataset.v; H.sel(); el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === el)); prBody(); },
  "pr-to": el => {
    PR.to = { id: +el.dataset.id, name: el.dataset.n }; H.sel();
    document.querySelectorAll("#pr-list .row").forEach(r => r.classList.toggle("sel", r === el));
    const b = $("#pr-send"); b.disabled = false; b.innerHTML = `${ic("gift")}Подарить: ${esc(PR.to.name)}`;
  },
  "pr-send": async () => {
    if (!PR.to) return;
    if (!await confirmM("Подарить?", `${esc(PR.g.col)} «${esc(PR.g.model)}» уйдёт игроку ${esc(PR.to.name)}. Вернуть нельзя.`, "Подарить")) return;
    await post(`gift/${PR.g.id}/send`, { to: PR.to.id, text: $("#pr-t").value }); H.ok(); toast("Подарок отправлен!", "ok");
    burstAt($(".pr-g"), PR.g); closeSheet(); if (typeof giftChanged === "function") giftChanged();   // giftChanged сам закрывает карточку подарка
  },
  // раньше после создания ссылки вызывался giftChanged(), а он первым делом закрывает верхнюю шторку — ту самую, где ссылка.
  // Подарок уже заморожен на сервере, а ссылку игрок не видел. Теперь шторка со ссылкой остаётся, убирается карточка подарка под ней.
  "pr-link": async el => {
    const sh = el.closest(".sheet"), g = PR.g, note = sh.querySelector("#pr-t");
    const r = await post(`gift/${g.id}/link`, { text: note ? note.value : "" }); H.ok();
    prGiftGone(g.id);
    if (!SHEETS.includes(sh)) return toast("Ссылка готова: она в сумке, в разделе «Подарки по ссылке»", "ok");
    if (note) note.readOnly = true;
    const seg = sh.querySelector("#pr-m"); if (seg) seg.remove();
    sh.querySelector("#pr-body").innerHTML = `<div class="pr-done">${ic("check")}<b>Ссылка готова</b><span style="word-break:normal">${LANG === "en" ? "Send it to a friend. The link stays in the bag under «Gift links». If nobody opens it in 7 days, the gift comes back." : "Отправь её другу. Ссылка сохранится в сумке, в разделе «Подарки по ссылке». Не откроют за 7 дней — подарок вернётся."}</span></div>${prLinkHTML(r.link, g)}`;
  },
  "pr-share": el => { const url = `https://t.me/share/url?url=${enc(el.dataset.l)}&text=${enc(el.dataset.t)}`; if (inTg) tg.openTelegramLink(url); else prCopy(el.dataset.l); },
  "pr-copy": el => prCopy(el.dataset.l),
  "gl-open": () => openGiftLinks(),
  "gl-cancel": async el => {
    if (!await confirmM("Вернуть подарок?", "Ссылка перестанет работать, подарок вернётся в сумку.", "Вернуть в сумку")) return;
    const sh = el.closest(".sheet");
    await post(`giftlink/${el.dataset.code}/cancel`); H.ok(); toast("Подарок снова в сумке", "ok");
    glDraw(sh); prRefresh();
  },
  "pc-open": async el => {
    el.classList.add("opening"); H.imp("heavy");
    let r; try { r = await post(`giftlink/${el.dataset.code}/claim`); } catch (e) { el.classList.remove("opening"); return; }
    await sleep(700);
    const st = $("#pc-st"); if (!st) return;
    st.innerHTML = `<div class="pc-won">${giftHTML(r.gift, { big: true })}<h2>${esc(r.gift.col)}</h2><div class="hint">${esc(r.gift.model)} · ⭐ ${fmt(r.gift.value)}</div>
      <button class="btn gold" data-act="close" style="margin-top:14px">Забрать в сумку</button></div>`;
    startLottie(st); starify(st); H.ok(); burstAt(st.querySelector(".gift"), r.gift);
    setTimeout(() => { const im = st.querySelector(".gift > img"); if (im && typeof flyToBag === "function") flyToBag(im); }, 1400);
  },
});

// ------------------------------------------------------------ свои подарки по ссылке
const prShareText = g => `🎁 Держи подарок — ${g.col}! Жми, чтобы распаковать`;
const prCopy = t => { if (typeof copyText === "function") copyText(t); else { navigator.clipboard?.writeText(t); toast("Ссылка скопирована"); } };
function prLinkHTML(link, g) {
  return `<div class="inv-link"><code>${esc(link.replace(/^https:\/\//, ""))}</code><button class="btn sm" data-act="pr-copy" data-l="${esc(link)}">${ic("layers")}Копировать</button></div>
    <button class="btn gold cta" data-act="pr-share" data-l="${esc(link)}" data-t="${esc(prShareText(g))}">${ic("send")}Отправить в Telegram</button>`;
}
function prRefresh() {
  loadMe().catch(() => {}); refreshProfileSheets().catch(() => {});
  if (TAB === "inv") renderInventory().catch(() => {});
  if (TAB === "market" && typeof loadMarket === "function") loadMarket();
}
// подарок ушёл из сумки: его карточку убираем из стека шторок (кнопки на ней уже не работают), верхнюю шторку не трогаем
function prGiftGone(gid) {
  for (let i = SHEETS.length - 1; i >= 0; i--) {
    const s = SHEETS[i];
    if (!s._o || !s._o.g || s._o.g.id !== gid) continue;
    if (i === SHEETS.length - 1) closeSheet();
    else { SHEETS.splice(i, 1); stopLottie(s); s.remove(); }
  }
  prRefresh();
}
async function openGiftLinks() {
  const el = openSheet(`<h2 class="gtitle">${ic("send")} Мои ссылки</h2><div id="gl-b">${emptyHTML("hourglass", "Загружаем…")}</div>`, "gl-s");
  glDraw(el);
}
const GL_ST = { taken: "Открыли — подарок у друга", expired: LANG === "en" ? "Not opened in 7 days — back in the bag" : "Не открыли за 7 дней — вернулся в сумку", cancelled: "Возвращён в сумку" };
async function glDraw(el) {
  const d = await api("giftlinks").catch(() => null);
  const b = el && el.querySelector("#gl-b"); if (!b) return;
  if (!d) { b.innerHTML = emptyHTML("lock", "Не получилось загрузить — попробуй ещё раз"); return; }
  const open = d.links.filter(l => l.status === "open" && l.gift), rest = d.links.filter(l => l.status !== "open" && l.gift);
  if (GL_N !== open.length) { GL_N = open.length; if (TAB === "inv") drawInventory(); }   // друг уже открыл ссылку — плашка в сумке не должна врать
  b.innerHTML = (open.length ? open.map(l => `<div class="gl-it"><div class="gl-h"><div class="gl-g">${giftHTML(l.gift, { lite: true, plain: true })}</div>
      <div class="grow"><b>${giftName(l.gift)}</b><small>Ждёт получателя · ⭐ ${fmt(l.gift.value)}</small></div></div>
      ${prLinkHTML(l.link, l.gift)}
      <button class="btn ghost" data-act="gl-cancel" data-code="${esc(l.code)}">${ic("x")}Вернуть подарок в сумку</button></div>`).join("")
    : emptyHTML("gift", "Ссылок, которые ждут получателя, нет")) +
    (rest.length ? `<div class="sec-t">История</div><div class="box">${rest.map(l => `<div class="row"><div class="grow"><div class="t">${giftName(l.gift)}</div><div class="s">${GL_ST[l.status] || ""}</div></div></div>`).join("")}</div>` : "");
  starify(b);
}
// в сумке — плашка, пока есть ссылки, которые ждут получателя: подарка в сетке нет, а здесь видно, где он
let GL_N = 0;
const _prDrawInv = drawInventory;
drawInventory = function () {
  _prDrawInv();
  const v = $("#v-inv"); if (!v || !GL_N || v.querySelector(".gl-ban")) return;
  v.insertAdjacentHTML("afterbegin", `<button class="gl-ban" data-act="gl-open">${ic("send")}<span><b>Подарки по ссылке</b><small>Ждут получателя: ${GL_N}</small></span>${ic("chev", "dim")}</button>`);
};
const _prRenderInv = renderInventory;
renderInventory = async function () {
  const n = api("giftlinks").then(d => d.links.filter(l => l.status === "open").length, () => GL_N);
  await _prRenderInv();
  const k = await n; if (k !== GL_N) { GL_N = k; drawInventory(); }
};
if (LANG === "en") i18nAdd({
  "Подарки по ссылке": "Gift links", "Мои подарки по ссылке": "My gift links", "Мои ссылки": "My links",
  "Ждут получателя": "Waiting for a friend", "Ждёт получателя": "Waiting for a friend",
  "Вернуть подарок в сумку": "Return the gift to the bag", "Вернуть подарок?": "Return the gift?",
  "Ссылка перестанет работать, подарок вернётся в сумку.": "The link will stop working and the gift will go back to your bag.",
  "Подарок снова в сумке": "The gift is back in your bag", "Открыли — подарок у друга": "Opened — the gift is with your friend",
  "Возвращён в сумку": "Returned to the bag", "Ссылок, которые ждут получателя, нет": "No links are waiting for a friend",
  "Не получилось загрузить — попробуй ещё раз": "Couldn't load — try again",
  "Ссылка готова: она в сумке, в разделе «Подарки по ссылке»": "The link is ready: it's in the bag under «Gift links»",
});
