"use strict";
// ============================================================
//  День рождения: дата указывается один раз в «Изменить профиль», в этот день — карточка на главной с подарком
//  (ключ от кейса и рамка «Именинник» на сутки), друзья могут поздравить из профиля, бот утром зовёт их.
//  Защита от смены даты «на завтра»: дата не меняется (только через поддержку/админа), подарок — если дата указана заранее.
// ============================================================
ICONS.cake = ICONS.cake || '<path d="M4 20h16"/><path d="M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6"/><path d="M5 15.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0"/><path d="M12 12V9"/><path d="M12 5.5a1 1 0 1 0 0-.01"/>';
const BD_M = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const bdT = (ru, en) => LANG === "en" ? en : ru;

// --- «Изменить профиль»: раздел с датой ---
function bdayEditHTML(b) {
  if (b.set) return `<div class="sec-t">${bdT("День рождения", "Birthday")}</div><div class="box"><div class="row"><span class="pic y">${ic("cake")}</span>
    <div class="grow"><div class="t">${esc(b.date)}</div><div class="s">${bdT("изменить дату можно только через поддержку", "the date can be changed only via support")}</div></div>${ic("lock")}</div></div>`;
  const opt = (n, t) => `<option value="${n}">${t}</option>`;
  return `<div class="sec-t">${bdT("День рождения", "Birthday")}</div>
    <div class="bd-pick"><select id="bd-d"><option value="0">${bdT("день", "day")}</option>${Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1)).join("")}</select>
      <select id="bd-m"><option value="0">${bdT("месяц", "month")}</option>${BD_M.map((m, i) => opt(i + 1, m)).join("")}</select></div>
    <div class="disc bd-disc">${bdT("Указывается один раз, поменять потом нельзя. В день рождения — ключ от кейса и рамка «Именинник» на сутки, если дата указана не позже чем за", "Set once, cannot be changed later. On your birthday you get a case key and the “Birthday star” frame for a day, provided the date was set at least")} ${b.noticeDays} ${plural(b.noticeDays, ["день", "дня", "дней"])} ${bdT("до праздника и уровень не ниже", "in advance and your level is at least")} ${b.level}.</div>`;
}
const _epBd = editProfile;
editProfile = async function () {
  const r = await _epBd.apply(this, arguments);
  const s = SHEETS[SHEETS.length - 1], save = s && s.querySelector(".esave");
  if (!save || !ME.bday || s.querySelector(".bd-pick, .bd-disc")) return r;
  save.insertAdjacentHTML("beforebegin", bdayEditHTML(ME.bday));
  if (ME.bday.set || !s._save) return r;
  const sv = s._save;
  s._save = async () => {
    const d = +s.querySelector("#bd-d").value, m = +s.querySelector("#bd-m").value;
    if (d || m) {
      if (!d || !m) return toast(bdT("Укажи и день, и месяц", "Pick both the day and the month"), "err");
      if (!await confirmM(`${d} ${BD_M[m - 1]}`, bdT("Дата рождения указывается один раз — поменять её потом нельзя. Сохранить?", "The birthday is set once and cannot be changed later. Save it?"), bdT("Сохранить", "Save"))) return;
      const r2 = await post("bday", { m, d });
      ME.bday = r2.bday;
    }
    await sv();
  };
  return r;
};

// --- карточка на главной в день рождения ---
function bdayCard() {
  const b = ME && ME.bday;
  if (!b || !b.today) return "";
  const why = b.canClaim ? bdT("Забери подарок: ключ от кейса и рамка на сутки", "Claim your gift: a case key and a frame for the day")
    : b.why === "claimed" ? bdT("Подарок уже получен. Хорошего дня!", "Gift already claimed. Have a great day!")
    : b.why === "late" ? `${bdT("Подарок будет в следующем году: дату нужно указать за", "The gift comes next year: set the date at least")} ${b.noticeDays} ${plural(b.noticeDays, ["день", "дня", "дней"])} ${bdT("до праздника", "in advance")}`
    : b.why === "level" ? `${bdT("Подарок положен с", "Gift unlocks at level")} ${b.level} ${bdT("уровня", "")}` : "";
  return `<button class="stc st-bday${b.canClaim ? " hot" : ""}" data-act="bday-claim"><span class="stc-i">${ic("cake")}</span><span class="stc-t"><b>${bdT("С днём рождения!", "Happy birthday!")}</b>
    <small>${why}${b.wishes ? ` · ${bdT("поздравлений", "wishes")}: ${b.wishes}` : ""}</small></span>${ic("chev")}</button>`;
}
async function bdayClaim() {
  const b = ME && ME.bday;
  if (!b || !b.today) return;
  if (!b.canClaim) return toast(b.why === "claimed" ? bdT("Подарок за этот год уже получен", "This year's gift is already claimed") : b.why === "level" ? `${bdT("Подарок положен с", "Gift unlocks at level")} ${b.level} ${bdT("уровня", "")}`
    : `${bdT("Дата указана меньше чем за", "The date was set less than")} ${b.noticeDays} ${plural(b.noticeDays, ["день", "дня", "дней"])} ${bdT("до дня рождения — подарок будет в следующем году", "before your birthday, the gift comes next year")}`);
  try {
    const r = await post("bday/claim");
    ME.bday = r.bday; CASES = [];
    H.ok(); burst(innerWidth / 2, innerHeight / 3, ["#ffd76a", "#ff5a6e", "#7cc2ff", "#fff"], 140);
    loadMe().catch(() => {});
    if (typeof casesTidy === "function") casesTidy();
    if (typeof refreshProfileSheets === "function") refreshProfileSheets();
    await modal(`<h3>${bdT("С днём рождения!", "Happy birthday!")}</h3>
      <div class="box" style="margin-bottom:14px"><div class="row kv"><span class="pic b">${ic("key")}</span><div class="grow"><div class="t">${bdT("Ключ от кейса", "Case key")} «${esc(r.key)}»</div><div class="s">${bdT("открыть кейс бесплатно", "open the case for free")}</div></div></div>
        <div class="row kv"><span class="pic y">${ic("award")}</span><div class="grow"><div class="t">${bdT("Рамка «Именинник»", "“Birthday star” frame")}</div><div class="s">${bdT("на сутки, уже надета", "for a day, already on")}</div></div></div></div>
      <button class="btn gold" data-m="ok">${bdT("Забрать", "Claim")}</button>`);
  } catch (e) {}
}

// --- чужой профиль: сегодня день рождения — кнопка «Поздравить» (только друзьям) ---
const _phBd = profileHTML;
profileHTML = function (p, tab) {
  const h = _phBd(p, tab);
  if (!p.bdayToday || !ME || p.id === ME.id) return h;
  const can = p.rel === "friend" && !p.bdayWished;
  const box = `<div class="bd-prof${can ? "" : " done"}">${ic("cake")}<div class="grow"><b>${bdT("Сегодня день рождения!", "It's their birthday today!")}</b>
      <span>${p.bdayWished ? bdT("Поздравление отправлено", "Your wishes were sent") : p.rel === "friend" ? bdT("Поздравь — игроку придёт сообщение от бота", "Send your wishes, the bot will deliver them") : bdT("Поздравить могут только друзья", "Only friends can send wishes")}</span></div>
    ${can ? `<button class="btn sm gold" data-act="bday-wish" data-id="${p.id}">${bdT("Поздравить", "Wish")}</button>` : ""}</div>`;
  return h.replace('<div class="pacts">', box + '<div class="pacts">');
};
async function bdayWish(el) {
  el.disabled = true;
  try {
    await post("bday/wish/" + el.dataset.id);
    H.ok(); toast(bdT("Поздравление отправлено", "Your wishes were sent"), "ok");
    if (typeof refreshProfileSheets === "function") refreshProfileSheets();
  } catch (e) { el.disabled = false; }
}

// --- админ: сброс даты в карточке игрока ---
async function bdayAdmReset(el) {
  const id = +el.dataset.id;
  if (!await confirmM(bdT("Сбросить дату рождения?", "Reset the birthday?"), bdT("Игрок сможет указать её заново. Действие попадёт в журнал.", "The player will be able to set it again. The action goes to the log."), bdT("Сбросить", "Reset"))) return;
  try {
    await post(`admin/user/${id}/bday/reset`);
    H.ok(); toast(bdT("Дата сброшена", "Birthday reset"), "ok");
    const sh = el.closest(".sheet"); if (sh && sh._admDraw) sh._admDraw();
  } catch (e) {}
}
Object.assign(ACT, { "bday-claim": () => bdayClaim(), "bday-wish": el => bdayWish(el), "adm-bday-reset": el => bdayAdmReset(el) });
if (LANG === "en") i18nAdd({
  "День рождения": "Birthday", "С днём рождения!": "Happy birthday!", "Поздравить": "Wish", "Сбросить": "Reset",
  "Сегодня не день рождения": "It's not the birthday today", "Подарок за этот год уже получен": "This year's gift is already claimed",
  "Дата уже указана — изменить её можно только через поддержку": "The date is already set, it can be changed only via support",
  "Поздравить можно только друга": "You can only wish a friend", "Ты уже поздравлял(а) сегодня": "You already sent your wishes today",
  "Себя поздравлять не нужно — просто забери подарок": "No need to wish yourself, just claim the gift", "Неверная дата": "Invalid date",
  "января": "January", "февраля": "February", "марта": "March", "апреля": "April", "мая": "May", "июня": "June", "июля": "July", "августа": "August", "сентября": "September", "октября": "October", "ноября": "November", "декабря": "December",
});
