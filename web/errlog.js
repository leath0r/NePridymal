"use strict";
// ошибки JS с устройства игрока — на сервер (журнал сервиса), чтобы чинить баги без доступа к телефону
(() => {
  let n = 0;
  const send = (m, s, l) => {
    if (++n > 15) return;
    try {
      const h = { "Content-Type": "application/json" };
      if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) h["X-Init-Data"] = Telegram.WebApp.initData;
      fetch("api/clienterr", { method: "POST", headers: h, body: JSON.stringify({ m: String(m), s: String(s || ""), l, ua: navigator.userAgent }) }).catch(() => {});
    } catch (e) {}
  };
  addEventListener("error", e => send(e.message, e.filename, e.lineno + ":" + e.colno));
  addEventListener("unhandledrejection", e => { const r = e.reason; if (r && r.status) return; send(r && r.message ? r.message + (r.stack && !String(r.stack).includes(r.message) ? " | " + r.stack : "") : r && r.stack || r, "promise", 0); });   // Safari кладёт в stack только кадры, без текста
})();
