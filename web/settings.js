"use strict";
// ============================================================
//  Настройки устройства: режим оптимизации (для слабых телефонов), вибрация, уведомления от бота.
//  Хранятся в localStorage — у каждого телефона свои.
// ============================================================
ICONS.gear = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
const PREF = (() => { try { return JSON.parse(localStorage.getItem("prefs") || "{}"); } catch (e) { return {}; } })();
// слабый телефон: Telegram на Android пишет класс производительности в конце user-agent (… ; LOW|AVERAGE|HIGH),
// плюс мало памяти. Тогда режим оптимизации включён по умолчанию; если игрок переключил его сам — решает он.
const WEAK_DEVICE = /;\s*LOW\)\s*$/.test(navigator.userAgent) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2);
function prefApply() {
  window.LITE = PREF.lite != null ? !!PREF.lite : WEAK_DEVICE;
  window.NO_VIBRO = !!PREF.noVibro;
  document.documentElement.classList.toggle("lite", window.LITE);
}
function prefSave() { try { localStorage.setItem("prefs", JSON.stringify(PREF)); } catch (e) {} prefApply(); }
prefApply();
// слабый телефон (≤4 ядер и мало памяти) — предлагаем оптимизацию сами один раз
setTimeout(() => {
  try {
    if (PREF.asked || window.LITE) return;   // уже включён (вручную или сам на слабом телефоне)
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
    if (!weak) return;
    PREF.asked = true; prefSave();
    confirmM("Включить режим оптимизации?", "Похоже, телефон не самый мощный. Режим уберёт тяжёлые украшения — игра станет плавнее, а всё игровое останется. Поменять можно в профиле → Настройки.", "Включить")
      .then(ok => { PREF.lite = !!ok; prefSave(); if (ok) toast("Режим оптимизации включён", "ok"); });
  } catch (e) {}
}, 6000);

function openSettings() {
  const row = (k, t, s, on) => `<div class="row kv"><div class="grow"><div class="t">${t}</div><div class="s" style="white-space:normal">${s}</div></div><button class="sw${on ? " on" : ""}" data-act="pref" data-k="${k}"></button></div>`;
  openSheet(`<h2 class="gtitle">${ic("gear")} Настройки</h2>
    <div class="box">
      ${row("lite", "Режим оптимизации", `Для слабых телефонов: без размытий, фоновых эффектов, бесконечных анимаций и анимированных подарков, меньше монет и конфетти${PREF.lite == null && WEAK_DEVICE ? " · включён сам: телефон слабый" : ""}`, window.LITE)}
      ${row("sound", "Звук", "Тики рулеток, звон монет, фанфары на крупном выигрыше", !PREF.noSound)}
      ${row("vibro", "Вибрация", "Отклик телефона на нажатия, выигрыши и проигрыши", !PREF.noVibro)}
      ${row("notif", "Уведомления от бота", "Бесплатный кейс, серия бонусов, твой ход за столом, дивиденды", ME.notif !== false)}
    </div>
    <div class="disc">Режим оптимизации, звук и вибрация сохраняются на этом телефоне.</div>`);
}
Object.assign(ACT, {
  settings: () => openSettings(),
  pref: async el => {
    const k = el.dataset.k, on = !el.classList.contains("on");
    el.classList.toggle("on", on);
    if (k === "lite") { PREF.lite = on; prefSave(); }
    else if (k === "vibro") { PREF.noVibro = !on; prefSave(); }
    else if (k === "sound") { PREF.noSound = !on; prefSave(); }
    else if (k === "notif") { await post("settings", { notif: on }); ME.notif = on; }
    H.sel();
  },
});
