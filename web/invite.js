"use strict";
// ============================================================
//  Окно «Пригласи друга»: личный QR-код со ссылкой игрока, ссылка с копированием, «Поделиться»
// ============================================================
function qrSVG(text) {
  const q = qrcode(0, "H");   // высокий уровень коррекции — в центре помещается значок
  q.addData(text); q.make();
  const n = q.getModuleCount(), hole = Math.ceil(n * 0.22) | 1, h0 = (n - hole) / 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!q.isDark(r, c)) continue;
    if (r >= h0 && r < h0 + hole && c >= h0 && c < h0 + hole) continue;   // место под значок
    d += `M${c} ${r}h1v1h-1z`;
  }
  return { svg: `<svg viewBox="-4 -4 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#14112a"/></svg>`, n };
}
function copyText(t) {
  const ok = () => { H.ok(); toast("Ссылка скопирована", "ok"); };
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(ok, () => copyFallback(t, ok));
  copyFallback(t, ok);
}
function copyFallback(t, ok) {
  const a = document.createElement("textarea"); a.value = t; a.setAttribute("readonly", ""); a.style.cssText = "position:fixed;opacity:0;top:0";
  document.body.appendChild(a); a.select();
  try { document.execCommand("copy"); ok(); } catch (e) { toast("Не получилось — выдели ссылку и скопируй вручную"); }
  a.remove();
}
invite = function () {
  H.imp("light");
  let qr = "";
  try { qr = qrSVG(ME.refLink).svg; } catch (e) {}
  const el = openSheet(`<div class="inv-hero"><h2>Пригласи друга</h2><p>Друг заходит по твоей ссылке — вам обоим по <b class="star">+${fmt(ME.refBonus)} ⭐</b></p></div>
    <div class="inv-qr"><div class="inv-code">${qr}<span class="inv-logo">${avaHTML(ME, 44)}</span></div>
      <span>Покажи QR-код — друг наведёт камеру и сразу попадёт в игру</span></div>
    <div class="inv-link"><code>${esc(ME.refLink.replace(/^https:\/\//, ""))}</code><button class="btn sm" data-act="inv-copy">${ic("layers")}Копировать</button></div>
    <button class="btn gold inv-share" data-act="inv-share">${ic("send")}Поделиться в Telegram</button>
    <div class="inv-stats"><div><b>${fmt(ME.refs)}</b><span>${plural(ME.refs, ["друг пришёл", "друга пришли", "друзей пришли"])}</span></div>
      <div><b class="tw">+${short(ME.refs * ME.refBonus)} ⭐</b><span>получено за приглашения</span></div></div>`, "inv-s");
  starify(el);
};
Object.assign(ACT, {
  "inv-copy": () => copyText(ME.refLink),
  "inv-share": () => {
    const text = `Залетай в кейс-симулятор подарков 🎁 По моей ссылке оба получим по ${ME.refBonus} ⭐ (игровых)`;
    const url = `https://t.me/share/url?url=${enc(ME.refLink)}&text=${enc(text)}`;
    if (inTg) tg.openTelegramLink(url); else copyText(ME.refLink);
  },
});
