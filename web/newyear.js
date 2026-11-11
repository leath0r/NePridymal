"use strict";
// ============================================================
//  Новый год (newyear.py): адвент-календарь 1–31 декабря и Тайный Санта (обмен подарками 31 декабря).
//  Карточки в листалке главной, окна календаря и мешка, подарок от Санты, рамка «2027».
//  Фразы с числами — сразу на двух языках (nyT): словарь переводит текст кусками между цифрами.
// ============================================================
ICONS.snow = ICONS.snow || '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="m9 3.5 3 2.5 3-2.5M9 20.5l3-2.5 3 2.5M3.6 10.4l3.6.5-1.2 3.4M20.4 13.6l-3.6-.5 1.2-3.4M3.6 13.6l3.6-.5-1.2-3.4M20.4 10.4l-3.6.5 1.2 3.4"/>';
ICONS.key = ICONS.key || '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l2.5 2.5M14.5 8.5l2 2"/>';

const nyT = (ru, en) => LANG === "en" ? en : ru;
const nyLeft = s => {
  s = Math.max(0, Math.round(s)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.max(1, Math.floor(s % 3600 / 60));
  return d ? nyT(`${d} д ${h} ч`, `${d}d ${h}h`) : h ? nyT(`${h} ч ${m} мин`, `${h}h ${m}m`) : nyT(`${m} мин`, `${m}m`);
};
const nyKeys = n => nyT(`${n} ${plural(n, ["ключ", "ключа", "ключей"])} от кейса «Новогодний»`, `${n} ${n === 1 ? "key" : "keys"} to the New Year case`);
const nyLv = () => (ME && ME.lv && ME.lv.level) || 0;

// ---------------- рамка «2027» (и следующих годов): подпись с годом на больших аватарах ----------------
const _avaNy = avaHTML;
avaHTML = function (u, s = 36, o) {
  const h = _avaNy(u, s, o), f = u && (u.pframe || u.frame);
  return f && /^ny\d\d$/.test(f) && s >= 52 ? h.replace(/<\/div>$/, `<i class="ny-tag">20${f.slice(2)}</i></div>`) : h;
};

// ---------------- карточки на главной (листалка hub.js) ----------------
function nyAdvCard() {
  const a = ME && ME.ny && ME.ny.adv; if (!a) return "";
  const fy = (a.year || new Date().getFullYear()) + 1, lv = a.level || 3;
  const sub = a.today ? nyT(`Сегодня открыто · ${a.n} из 31 · завтра новая дверца`, `Opened today · ${a.n} of 31 · new door tomorrow`)
    : nyLv() < lv ? nyT(`Подарок каждый день декабря, за все 31 дверцу — рамка «${fy}» · с ${lv} уровня`, `A gift every day of December, the «${fy}» frame for all 31 doors · from level ${lv}`)
    : nyT(`Дверца ${a.day} ждёт — сыграй раунд и открой до полуночи`, `Door ${a.day} is waiting — play a round and open it before midnight`);
  return `<button class="stc st-adv${a.today ? "" : " hot"}" data-act="ny-adv"><span class="stc-i">${ic("calendar")}<em>${a.day}</em></span>
    <span class="stc-t"><b>Адвент-календарь</b><small>${sub}</small></span>${ic("chev")}</button>`;
}
function nySantaCard() {
  const s = ME && ME.ny && ME.ny.santa; if (!s) return "";
  let t = "Тайный Санта", sub;
  if (s.gift) { t = "Санта принёс тебе подарок"; sub = "Открой — внутри открытка"; }
  else if (s.phase === "join") {
    if (s.in) sub = nyT("Твой подарок в мешке, раздача 31 декабря", "Your gift is in the sack, handout on December 31");
    else if (s.joinOn) sub = nyT("Положи подарок в мешок до 25 декабря, а 31-го получи чужой", "Put a gift in the sack before December 25 and get someone else's on the 31st");
    else return "";
  } else if (s.phase === "packed") { if (!s.in) return ""; sub = nyT("Подарки упакованы, раздача 31 декабря в 12:00", "Gifts are wrapped, handout on December 31 at 12:00"); }
  else { if (!s.in) return ""; sub = "Подарки розданы — посмотри, кому достался твой"; }
  return `<button class="stc st-santa${s.gift ? " hot" : ""}" data-act="ny-santa"><span class="stc-i"><img src="${A.orig("Santa Hat", 64)}" alt=""></span>
    <span class="stc-t"><b>${t}</b><small>${sub}</small></span>${ic("chev")}</button>`;
}

// ---------------- адвент-календарь ----------------
async function nyAdvOpen() {
  H.imp("light");
  const el = openSheet(emptyHTML("hourglass", "Загружаем…"), "ny-s");
  const d = await api("advent").catch(() => null);
  if (!el.isConnected) return;
  if (!d || !d.advent) return replaceSheet(el, `<h2 class="gtitle">Адвент-календарь</h2>${emptyHTML("calendar", "Календарь открыт только в декабре")}`);
  el._adv = d.advent;
  nyAdvDraw(el);
}
function nyAdvDraw(el, pop) {
  const a = el._adv, f = a.frame, t = esc(f.title);
  const door = x => {
    const k = x.keys ? `<i class="adv-k">${ic("key")}${x.keys > 1 ? x.keys : ""}</i>` : "";
    const body = x.s === "open" ? `<b>${x.d}</b><small>+${short(x.stars)} ⭐</small>${k}`
      : x.s === "today" ? `<b>${x.d}</b><small>сегодня</small>${k}`
      : x.s === "missed" ? `<b>${x.d}</b><small>сгорела</small>`
      : `<b>${x.d}</b>${x.d === 31 ? `<i class="adv-f">${ic("sparkles")}</i>` : k}`;
    return `<div class="adv-d ${x.s}${x.d === pop ? " pop" : ""}">${body}</div>`;
  };
  const clean = a.opened === (a.today ? a.day : a.day - 1);
  const fst = f.got ? "Получена — уже в твоём оформлении"
    : f.possible ? nyT(`За все 31 дверцу${clean && a.opened ? " · пока без пропусков" : ""}`, `For all 31 doors${clean && a.opened ? " · no days missed yet" : ""}`)
    : nyT(`Недоступна: ${a.missed} ${plural(a.missed, ["день пропущен", "дня пропущено", "дней пропущено"])}. Награды остальных дверец — твои`,
      `Unavailable: ${a.missed} ${a.missed === 1 ? "day" : "days"} missed. Rewards from the other doors are still yours`);
  let cta;
  if (a.today) cta = `<div class="adv-wait">${ic("clock")}<span>${nyT("Следующая дверца через", "Next door in")} <b>${nyLeft(a.endsIn)}</b></span></div>`;
  else if (!a.levelOk) cta = `<button class="btn cta" disabled>${ic("lock")}${nyT(`С ${a.level} уровня`, `From level ${a.level}`)}</button><div class="adv-h">Уровень растёт от ставок в играх и открытий кейсов</div>`;
  else if (!a.played) cta = `<button class="btn cta" data-act="ny-play">${ic("games")}Сыграть раунд</button><div class="adv-h">Дверца откроется, когда сыграешь сегодня хотя бы один раунд в любой игре</div>`;
  else cta = `<button class="btn cta gold" data-act="ny-adv-open">${ic("gift")}${nyT(`Открыть дверцу ${a.day}`, `Open door ${a.day}`)}</button>`;
  replaceSheet(el, `<div class="adv-hero"><h2 class="gtitle">Адвент-календарь</h2><p>${nyT(`Декабрь ${a.year} · каждый день новая дверца`, `December ${a.year} · a new door every day`)}</p></div>
    <div class="adv-fr${f.got ? " got" : f.possible ? "" : " off"}">${avaHTML({ ...ME, frame: "", pframe: f.id }, 56)}
      <div class="grow"><b>${nyT(`Рамка «${t}»`, `«${t}» frame`)}</b><span>${fst}</span></div></div>
    <div class="adv-pr"><span>${nyT(`Открыто <b>${a.opened}</b> из 31`, `Opened <b>${a.opened}</b> of 31`)}</span><div class="adv-bar"><i style="width:${(a.opened / 31 * 100).toFixed(1)}%"></i></div></div>
    <div class="adv-g">${a.doors.map(door).join("")}</div>
    <div class="adv-cta">${cta}</div>
    <div class="adv-rules">${nyT(`Пропущенный день сгорает. В дверцах 7, 14, 21 и 28 — ключ от кейса «Новогодний», в 31-й — два ключа и рамка «${t}» на весь ${t} год.`,
      `A missed day burns. Doors 7, 14, 21 and 28 hold a key to the New Year case; door 31 holds two keys and the «${t}» frame for all of ${t}.`)}</div>`);
  starify(el);
}
async function nyAdvDo(btn) {
  const el = btn.closest(".sheet"); if (!el || !el._adv) return;
  btn.disabled = true;
  let r;
  try { r = await post("advent/open"); } catch (e) { btn.disabled = false; return; }
  H.ok(); setStars(r.balance);
  if (r.advent) el._adv = r.advent;
  if (ME.ny && ME.ny.adv) { ME.ny.adv.today = true; ME.ny.adv.n = el._adv.opened; }
  if (el.isConnected && r.advent) nyAdvDraw(el, r.day);
  if (typeof casesTidy === "function") casesTidy();
  const ft = esc(el._adv.frame.title);
  const lines = [`<div class="row kv"><span class="pic g">${ic("coins")}</span><div class="grow"><div class="t">Звёзды</div></div><b class="pos">+${fmt(r.stars)} ⭐</b></div>`];
  if (r.keys) lines.push(`<div class="row kv"><span class="pic b">${ic("key")}</span><div class="grow"><div class="t">${nyKeys(r.keys)}</div><div class="s">открыть кейс бесплатно</div></div></div>`);
  if (r.frame) lines.push(`<div class="row kv"><span class="pic y">${ic("award")}</span><div class="grow"><div class="t">${nyT(`Рамка «${ft}»`, `«${ft}» frame`)}</div><div class="s">${nyT("Все 31 дверца открыты — рамка твоя на весь год", "All 31 doors opened — the frame is yours for the whole year")}</div></div></div>`);
  burst(innerWidth / 2, innerHeight / 3, r.frame ? ["#ffd76a", "#ff5a6e", "#4fd67a", "#fff"] : ["#ffd76a", "#7cc2ff", "#fff"], r.frame ? 160 : 90);
  if (r.keys) CASES = [];
  loadMe().catch(() => {});
  if (r.frame && typeof refreshProfileSheets === "function") refreshProfileSheets();
  await modal(`<div class="adv-won"><div class="adv-won-d">${r.day}</div><h3>${nyT(`Дверца ${r.day} открыта`, `Door ${r.day} opened`)}</h3></div>
    <div class="box" style="margin-bottom:14px">${lines.join("")}</div><button class="btn gold" data-m="ok">Забрать награду</button>`);
}

// ---------------- Тайный Санта ----------------
async function nySantaOpen() {
  H.imp("light");
  const el = openSheet(emptyHTML("hourglass", "Загружаем…"), "ny-s");
  const d = await api("santa").catch(() => null);
  if (!el.isConnected) return;
  if (!d || !d.santa) return replaceSheet(el, `<h2 class="gtitle">Тайный Санта</h2>${emptyHTML("gift", "Тайный Санта проходит в декабре")}`);
  el._santa = d.santa; el._pick = null; el._text = "";
  nySantaDraw(el);
  if (d.santa.got && !d.santa.got.seen) post("santa/seen", {}, { quiet: true }).then(() => {
    if (ME.ny && ME.ny.santa) ME.ny.santa.gift = false;
    if (typeof casesTidy === "function") casesTidy();
  }).catch(() => {});
}
const nyGiftBox = (g, cap) => g ? `<div class="sn-gift">${giftHTML(g, { lite: true })}<div><b>${giftName(g)}</b><span>${cap || `⭐ ${fmt(g.value)}`}</span></div></div>` : "";
const nyCardText = t => t ? `<div class="sn-card"><span>Открытка</span><p>«${esc(t)}»</p></div>` : "";
function nySantaDraw(el) {
  const s = el._santa, m = s.mine, now = Date.now() / 1000;
  const T = s.phase === "join" ? nyT(`Жеребьёвка 25 декабря в 12:00 по Москве · через ${nyLeft(s.shuffle - now)}`, `Draw on December 25 at 12:00 Moscow time · in ${nyLeft(s.shuffle - now)}`)
    : s.phase === "packed" ? nyT(`Раздача 31 декабря в 12:00 по Москве · через ${nyLeft(s.deliver - now)}`, `Handout on December 31 at 12:00 Moscow time · in ${nyLeft(s.deliver - now)}`)
    : "Подарки розданы — с Новым годом!";
  let body = "";
  if (s.got) body += `<div class="sec-t">${ic("gift")}Тебе от Тайного Санты</div>${nyGiftBox(s.got.gift, "Подарок уже в твоей сумке")}${nyCardText(s.got.text)}`;
  if (m && m.status === "in") {
    body += `<div class="sec-t">${ic("gift")}Твой подарок в мешке</div>${nyGiftBox(m.gift)}${nyCardText(m.text)}
      <button class="btn ghost sn-cancel" data-act="ny-santa-cancel">${ic("back")}Вернуть подарок из мешка</button>
      <div class="adv-h">Вернуть можно до жеребьёвки. Потом подарок уйдёт игроку из твоей группы</div>`;
  } else if (m && m.status === "packed") {
    body += `<div class="sec-t">${ic("gift")}Твой подарок упакован</div>${nyGiftBox(m.gift)}${nyCardText(m.text)}
      <div class="adv-h">${nyT(`В твоей группе ${m.group} ${plural(m.group, ["игрок", "игрока", "игроков"])} с подарками похожей цены. Кому достанется твой — узнаешь 31 декабря`,
        `Your group has ${m.group} players with gifts of similar value. You'll find out on December 31 who gets yours`)}</div>`;
  } else if (m && m.status === "sent") {
    body += `<div class="sec-t">${ic("send")}Твой подарок достался</div>${m.to ? `<div class="sn-to" data-act="profile" data-id="${m.to.id}">${avaHTML(m.to, 40)}<b>${esc(m.to.name)}</b>${ic("chev")}</div>` : ""}${nyGiftBox(m.gift)}`;
  } else if (m && (m.status === "refund" || m.status === "lost")) {
    body += `<div class="sn-note">${ic("info")}<span>${m.status === "refund" ? "Подарок вернулся в сумку: для него не нашлось пары похожей цены" : "Подарок из мешка пропал при вайпе"}</span></div>`;
  } else if (s.phase === "join" && s.joinOn) {
    const g = el._pick;
    body += `<div class="sn-steps">
        <div><i>1</i><span>${nyT("Положи в мешок один подарок и напиши открытку — до 25 декабря, 12:00", "Put one gift in the sack and write a card — before December 25, 12:00")}</span></div>
        <div><i>2</i><span>${nyT("25 декабря в 12:00 Санта разложит подарки по группам похожей цены и перемешает: свой никому не достанется", "On December 25 at 12:00 Santa sorts the gifts into groups of similar value and shuffles them — nobody gets their own")}</span></div>
        <div><i>3</i><span>${nyT("31 декабря в 12:00 получишь чужой подарок с открыткой, а твой уйдёт другому игроку", "On December 31 at 12:00 you get someone else's gift with a card, and yours goes to another player")}</span></div></div>
      <div class="sec-t">${ic("gift")}Подарок для мешка</div>
      ${g ? `${nyGiftBox(g)}<button class="btn sm ghost sn-pick" data-act="ny-santa-pick">Выбрать другой подарок</button>`
        : `<button class="sn-empty" data-act="ny-santa-pick">${ic("plus")}<span>Выбрать подарок из сумки</span></button>`}
      <div class="sec-t">Открытка <span id="sn-cnt" class="sn-n">${el._text.length}/${s.textMax}</span></div>
      <textarea id="sn-text" maxlength="${s.textMax}" rows="2" placeholder="Пожелание незнакомцу — без ссылок и юзернеймов">${esc(el._text)}</textarea>
      ${nyLv() >= s.level ? `<button class="btn cta gold" data-act="ny-santa-join"${g ? "" : " disabled"}>${ic("gift")}Положить в мешок</button>`
        : `<button class="btn cta" disabled>${ic("lock")}${nyT(`С ${s.level} уровня`, `From level ${s.level}`)}</button>`}
      <div class="adv-h">${nyT(`В одной группе цены отличаются не больше чем в ${String(s.ratio).replace(".", ",")} раза. Не нашлось пары — подарок вернётся`,
        `Within a group, values differ by at most ${s.ratio}×. No match — the gift comes back`)}</div>`;
  } else if (!s.got) {
    body += `<div class="sn-note">${ic("info")}<span>${s.phase === "join" ? "Запись в Тайного Санту закрыта" : "Запись закрыта: подарки уже упакованы. Загляни в следующем декабре"}</span></div>`;
  }
  replaceSheet(el, `<div class="sn-hero"><img src="${A.orig("Santa Hat", 256)}" alt=""><h2>Тайный Санта</h2><p>${T}</p>
      ${s.count ? `<span class="sn-cnt">${ic("users")}${nyT(`В мешке ${s.count} ${plural(s.count, ["подарок", "подарка", "подарков"])}`, `${s.count} ${s.count === 1 ? "gift" : "gifts"} in the sack`)}</span>` : ""}</div>${body}`);
  starify(el);
  const ta = el.querySelector("#sn-text");
  if (ta) ta.oninput = () => { el._text = ta.value; const c = el.querySelector("#sn-cnt"); if (c) c.textContent = `${ta.value.length}/${s.textMax}`; };
}
// подарок от Санты — окном, когда на экране нет других окон. Ждём столько, сколько нужно: игрок может долго читать
// «пока тебя не было» или сразу уйти в игру. Одна цепочка таймеров на страницу — повторные loadMe не плодят новые
function nySantaGot() {
  clearTimeout(nySantaGot.t);
  const s = ME && ME.ny && ME.ny.santa;
  if (!s || !s.gift || nySantaGot.done) return;
  if (document.querySelector(".sheet") || document.querySelector("#modal.on") || document.querySelector(".bw-ov") || TAB !== "cases") {
    nySantaGot.t = setTimeout(nySantaGot, 3000);
    return;
  }
  nySantaGot.done = true;
  nySantaOpen();
}

Object.assign(ACT, {
  "ny-adv": () => nyAdvOpen(),
  "ny-adv-open": el => nyAdvDo(el),
  "ny-play": () => { closeSheet(); setTimeout(() => setTab("games"), 200); },
  "ny-santa": () => nySantaOpen(),
  "ny-santa-pick": el => {
    const sh = el.closest(".sheet");
    pickGift("Подарок для мешка", g => { if (!sh || !sh.isConnected) return; sh._pick = g; H.sel(); nySantaDraw(sh); });
  },
  "ny-santa-join": async el => {
    const sh = el.closest(".sheet"), g = sh && sh._pick; if (!g) return;
    if (!await confirmM("Положить подарок в мешок?", nyT(`${giftName(g)} заморозится: продать, подарить или заложить его будет нельзя. До 25 декабря можно вернуть.`,
      `${giftName(g)} will be frozen: you can't sell, give or pawn it. You can take it back before December 25.`), "Положить в мешок")) return;
    el.disabled = true;
    try {
      const r = await post("santa/join", { gift: g.id, text: (sh._text || "").trim() });
      H.ok(); toast(nyT("Подарок в мешке — жди 31 декабря", "The gift is in the sack — wait for December 31"), "ok");
      sh._santa = r.santa; sh._pick = null; sh._text = "";
      if (ME.ny && ME.ny.santa) ME.ny.santa.in = true;
      if (sh.isConnected) nySantaDraw(sh);
      if (typeof casesTidy === "function") casesTidy();
    } catch (e) { el.disabled = false; }
  },
  "ny-santa-cancel": async el => {
    const sh = el.closest(".sheet");
    if (!await confirmM("Вернуть подарок из мешка?", nyT("Он вернётся в сумку. Положить снова можно до 25 декабря.", "It goes back to your bag. You can put it in again before December 25."), "Вернуть в сумку")) return;
    el.disabled = true;
    try {
      const r = await post("santa/cancel");
      H.sel(); toast("Подарок вернулся в сумку", "ok");
      sh._santa = r.santa;
      if (ME.ny && ME.ny.santa) ME.ny.santa.in = false;
      if (sh.isConnected) nySantaDraw(sh);
      if (typeof casesTidy === "function") casesTidy();
    } catch (e) { el.disabled = false; }
  },
});

function nySantaArm() {   // подарок от Санты ещё не видели — ждём, когда на экране не будет других окон
  if (!ME || !ME.ny || !ME.ny.santa || !ME.ny.santa.gift || nySantaGot.done) return;
  clearTimeout(nySantaGot.t); nySantaGot.t = setTimeout(nySantaGot, 2500);
}
const _loadMeNy = loadMe;
loadMe = async function () { await _loadMeNy(); nySantaArm(); };
// при запуске игры профиль грузится раньше этого модуля, мимо обёртки выше, — первую проверку делаем сами
const nyBootT = setInterval(() => { if (ME) { clearInterval(nyBootT); nySantaArm(); } }, 500);

// только фразы этого модуля без чисел; общие слова («из», «сегодня», «ч») уже есть в общем словаре
if (LANG === "en") i18nAdd({
  "Адвент-календарь": "Advent calendar", "Тайный Санта": "Secret Santa", "Санта принёс тебе подарок": "Santa brought you a gift",
  "Открой — внутри открытка": "Open it — there's a card inside", "Подарки розданы — посмотри, кому достался твой": "Gifts handed out — see who got yours",
  "Календарь открыт только в декабре": "The calendar is open only in December", "сгорела": "burned", "Получена — уже в твоём оформлении": "Received — it's in your style now",
  "Уровень растёт от ставок в играх и открытий кейсов": "Your level grows with bets in games and case openings", "Сыграть раунд": "Play a round",
  "Дверца откроется, когда сыграешь сегодня хотя бы один раунд в любой игре": "The door opens once you play at least one round today in any game",
  "открыть кейс бесплатно": "open the case for free", "Забрать награду": "Collect reward", "Тайный Санта проходит в декабре": "Secret Santa runs in December",
  "Подарки розданы — с Новым годом!": "Gifts handed out — happy New Year!", "Тебе от Тайного Санты": "From your Secret Santa", "Подарок уже в твоей сумке": "The gift is already in your bag",
  "Твой подарок в мешке": "Your gift is in the sack", "Вернуть подарок из мешка": "Take the gift back from the sack",
  "Вернуть можно до жеребьёвки. Потом подарок уйдёт игроку из твоей группы": "You can take it back until the draw. After that it goes to a player in your group",
  "Твой подарок упакован": "Your gift is wrapped", "Твой подарок достался": "Your gift went to",
  "Подарок вернулся в сумку: для него не нашлось пары похожей цены": "The gift is back in your bag: no gift of similar value was found for it",
  "Подарок из мешка пропал при вайпе": "The gift in the sack was lost in the wipe", "Подарок для мешка": "Gift for the sack",
  "Выбрать другой подарок": "Choose another gift", "Выбрать подарок из сумки": "Choose a gift from your bag",
  "Пожелание незнакомцу — без ссылок и юзернеймов": "A wish for a stranger — no links or usernames", "Положить в мешок": "Put in the sack",
  "Запись в Тайного Санту закрыта": "Secret Santa sign-up is closed", "Запись закрыта: подарки уже упакованы. Загляни в следующем декабре": "Sign-up is closed: the gifts are wrapped. Come back next December",
  "Положить подарок в мешок?": "Put the gift in the sack?", "Вернуть подарок из мешка?": "Take the gift back from the sack?", "Вернуть в сумку": "Back to the bag",
  "Подарок вернулся в сумку": "The gift is back in your bag",
});
// ивент «Новый год» (app.py EVENTS): название, бонусы и задания. Словарь переводит русские куски между цифрами
if (LANG === "en") i18nAdd({
  "Новый год": "New Year", "Кейс «Новогодний»": "«New Year» case", "Адвент-календарь: дверца каждый день декабря, за все": "Advent calendar: a door every day of December, for all",
  "Тайный Санта: обмен подарками": "Secret Santa: gift exchange on", "Ивент-задания с повышенными наградами": "Event quests with bigger rewards",
  "Снег и новогоднее оформление игры": "Snow and New Year decorations", "раз в Самолётик": "times in Plane", "раз в Плинко": "times in Plinko", "рамка": "frame", "декабря": "December",
});
