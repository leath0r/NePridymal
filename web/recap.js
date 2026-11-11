"use strict";
// ============================================================
//  Итоги года (recap.py): слайды как в сторис — раунды, любимая игра, крупный выигрыш, коллекция,
//  характер игрока — и картинка 1080×1920 для сторис с реферальной ссылкой. С 25 декабря по 15 января.
// ============================================================
const rcT = (ru, en) => LANG === "en" ? en : ru;
const RC_STEP = 6500;   // мс на слайд (последний не листается сам)

function recapCard() {
  const r = ME && ME.ny && ME.ny.recap; if (!r) return "";
  return `<button class="stc st-recap" data-act="recap"><span class="stc-i"><b>${String(r.year).slice(2)}</b></span>
    <span class="stc-t"><b>${rcT(`Твой ${r.year} в игре`, `Your ${r.year} in the game`)}</b><small>Итоги года: любимая игра, самый крупный выигрыш и твой характер игрока</small></span>${ic("chev")}</button>`;
}

function rcSlides(s) {
  const pl = (n, f) => `${fmt(n)} ${plural(n, f)}`;
  const date = ts => new Date(ts * 1000).toLocaleDateString(LANG === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long" });
  const out = [];
  out.push(`<div class="rc-sl rc-a"><span class="rc-k">Gift Cases</span><h1>${rcT(`Твой<br>${s.year}`, `Your<br>${s.year}`)}</h1>
    <p>${rcT("Год в игре: любимые игры, рекорды и твой характер игрока", "Your year in the game: favourite games, records and your player type")}</p>
    <span class="rc-tap">${rcT("Нажми, чтобы листать", "Tap to continue")}</span></div>`);
  out.push(`<div class="rc-sl rc-b"><span class="rc-k">${rcT("Раунды", "Rounds")}</span><div class="rc-big">${fmt(s.rounds)}</div>
    <p>${rcT(plural(s.rounds, ["раунд сыгран за год", "раунда сыграно за год", "раундов сыграно за год"]), "rounds played this year")}</p>
    <div class="rc-row"><div><b>${fmt(s.days)}</b><span>${rcT(plural(s.days, ["день в игре", "дня в игре", "дней в игре"]), "days in the game")}</span></div>
      <div><b>${fmt(s.streak)}</b><span>${rcT(plural(s.streak, ["день подряд — лучшая серия", "дня подряд — лучшая серия", "дней подряд — лучшая серия"]), "days in a row — best streak")}</span></div>
      <div><b>${fmt(s.wins)}</b><span>${rcT(plural(s.wins, ["раунд в плюс", "раунда в плюс", "раундов в плюс"]), "winning rounds")}</span></div></div>
    ${s.since ? `<p class="rc-s">${rcT(`С нами с ${date(s.since)}`, `With us since ${date(s.since)}`)}</p>` : ""}</div>`);
  const fav = s.fav, gn = k => (typeof GAME_NAMES === "object" && GAME_NAMES[k] ? GAME_NAMES[k][1] : null);
  out.push(`<div class="rc-sl rc-c"><span class="rc-k">${rcT("Любимая игра", "Favourite game")}</span><h2>${esc(gn(fav.kind) || fav.name)}</h2>
    <p>${rcT(`${fav.pct}% всех твоих раундов — ${pl(fav.n, ["раунд", "раунда", "раундов"])}`, `${fav.pct}% of all your rounds — ${fmt(fav.n)}`)}</p>
    <div class="rc-top">${s.top.map((g, i) => `<div><i>${i + 1}</i><span>${esc(gn(g.kind) || g.name)}</span><em style="--w:${Math.max(6, g.pct)}%"></em><b>${g.pct}%</b></div>`).join("")}</div>
    <p class="rc-s">${rcT(`Всего игр попробовано: ${s.games}`, `Games tried: ${s.games}`)}</p></div>`);
  if (s.best) out.push(`<div class="rc-sl rc-d"><span class="rc-k">${rcT("Самый крупный выигрыш", "Biggest win")}</span><div class="rc-big"><span class="gold">+${short(s.best.amount)}</span> ⭐</div>
    <p>${rcT(`${esc(gn(s.best.kind) || s.best.name)} · ${date(s.best.ts)}`, `${esc(gn(s.best.kind) || s.best.name)} · ${date(s.best.ts)}`)}</p></div>`);
  out.push(`<div class="rc-sl rc-e"><span class="rc-k">${rcT("Коллекция", "Collection")}</span>
    ${s.gift ? `<div class="rc-gift">${giftHTML(s.gift, { lite: true })}</div><h3>${giftName(s.gift)}</h3><p>${rcT("Самый ценный подарок в сумке", "The most valuable gift in your bag")} · ⭐ ${fmt(s.gift.value)}</p>` : `<h2>${rcT("Сумка ждёт", "Your bag is waiting")}</h2>`}
    <div class="rc-row"><div><b>${fmt(s.giftsN)}</b><span>${rcT(plural(s.giftsN, ["подарок в сумке", "подарка в сумке", "подарков в сумке"]), "gifts in the bag")}</span></div>
      <div><b>${fmt(s.cases)}</b><span>${rcT(plural(s.cases, ["кейс открыт", "кейса открыто", "кейсов открыто"]), "cases opened")}</span></div>
      <div><b>${fmt(s.friends)}</b><span>${rcT(plural(s.friends, ["друг в игре", "друга в игре", "друзей в игре"]), "friends in the game")}</span></div></div></div>`);
  out.push(`<div class="rc-sl rc-f"><span class="rc-k">${rcT("Твой характер игрока", "Your player type")}</span><h2 class="rc-p">${esc(rcT(s.pname, s.pnameEn || s.pname))}</h2><p>${esc(rcT(s.pdesc, s.pdescEn || s.pdesc))}</p>
    ${s.pct != null && s.pct >= 50 ? `<span class="rc-badge">${ic("trophy")}${rcT(`Сыграно больше, чем у ${s.pct}% игроков`, `Played more than ${s.pct}% of players`)}</span>` : ""}
    <div class="rc-share">${shareStoryOk() ? `<button class="btn gold" data-act="rc-story">${ic("sparkles")}${rcT("Выложить в сторис", "Post to story")}</button>` : ""}
      <button class="btn ${shareStoryOk() ? "ghost" : "gold"}" data-act="rc-chat">${ic("send")}${rcT("Поделиться с друзьями", "Share with friends")}</button></div>
    <p class="rc-s">${rcT("В карточке — твоя ссылка: друзья, пришедшие по ней, засчитаются тебе", "The card carries your link: friends who join through it count as your invites")}</p></div>`);
  return out;
}

async function openRecap() {
  H.imp("light");
  const el = openSheet(emptyHTML("hourglass", "Загружаем…"), "rc-sheet");
  const d = await api("recap").catch(() => null);
  if (!el.isConnected) return;
  if (!d || !d.recap) return replaceSheet(el, `<h2 class="gtitle">${rcT("Итоги года", "Year in review")}</h2>${emptyHTML("calendar", rcT("Итогов пока нет: сыграй ещё немного", "No recap yet: play a bit more"))}`);
  el._rc = { s: d.recap, i: 0, t: 0, slides: rcSlides(d.recap) };
  el._onClose = () => clearTimeout(el._rc.t);
  replaceSheet(el, `<div class="rc-box"><div class="rc-bars">${el._rc.slides.map(() => "<i><b></b></i>").join("")}</div><div class="rc-body"></div></div>`);
  el.querySelector(".rc-body").addEventListener("click", e => {
    if (e.target.closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    rcGo(el, el._rc.i + (e.clientX - r.left < r.width / 3 ? -1 : 1));
  });
  rcGo(el, 0);
}
function rcGo(el, i) {
  const R = el._rc, n = R.slides.length;
  if (!el.isConnected) return clearTimeout(R.t);
  if (i < 0) i = 0;
  if (i >= n) return;
  R.i = i; clearTimeout(R.t);
  const body = el.querySelector(".rc-body");
  body.innerHTML = R.slides[i];
  starify(body);
  el.querySelectorAll(".rc-bars i").forEach((b, j) => { b.className = j < i ? "done" : j === i ? (i < n - 1 ? "on" : "done") : ""; b.style.setProperty("--d", RC_STEP + "ms"); });
  H.sel();
  if (i < n - 1) R.t = setTimeout(() => rcGo(el, R.i + 1), RC_STEP);
}
async function rcShare(to, btn) {
  const html = btn.innerHTML;
  btn.disabled = true; btn.textContent = rcT("Готовим карточку", "Preparing the card");
  try {
    const r = await post("recap/share", { lang: LANG }, { quiet: true });
    if (to === "story") tg.shareToStory(r.story, { text: `${r.text}\n${r.link}` });
    else await shareChat({ link: r.link, text: r.text });
  } catch (e) {
    toast(e.status && e.status !== "net" && e.message ? e.message : rcT("Карточка сейчас недоступна, попробуй позже", "The card is unavailable right now, try later"), "err");
  } finally { btn.disabled = false; btn.innerHTML = html; }
}
Object.assign(ACT, {
  recap: () => openRecap(),
  "rc-story": el => rcShare("story", el),
  "rc-chat": el => rcShare("chat", el),
});
if (LANG === "en") i18nAdd({
  "Итоги года: любимая игра, самый крупный выигрыш и твой характер игрока": "Year in review: favourite game, biggest win and your player type",
});
