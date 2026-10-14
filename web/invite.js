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
invite = async function () {
  H.imp("light");
  let qr = "";
  try { qr = qrSVG(ME.refLink).svg; } catch (e) {}
  const r = ME.ref || {};
  const el = openSheet(`<div class="inv-hero"><h2>Пригласи друга</h2><p>${r.on === false ? "Друг заходит по твоей ссылке и играет с тобой"
      : `Друг заходит по твоей ссылке${r.new ? ` и сразу получает <b class="star">+${fmt(r.new)} ⭐</b>` : ""}. Чем дальше он играет — тем больше получаешь ты`}</p></div>
    <div class="inv-qr"><div class="inv-code">${qr}<span class="inv-logo">${avaHTML(ME, 44)}</span></div>
      <span>Покажи QR-код — друг наведёт камеру и сразу попадёт в игру</span></div>
    <div class="inv-link"><code>${esc(ME.refLink.replace(/^https:\/\//, ""))}</code><button class="btn sm" data-act="inv-copy">${ic("layers")}Копировать</button></div>
    <button class="btn gold inv-share" data-act="inv-share">${ic("send")}Поделиться в Telegram</button>
    <div id="inv-more"><div class="empty" style="padding:24px 0"><b>⏳</b></div></div>`, "inv-s");
  starify(el);
  const d = await api("refs").catch(() => null);
  const box = el.querySelector("#inv-more"); if (!box) return;
  if (!d) { box.innerHTML = ""; return; }
  const step = (icn, cls, t, s) => `<div class="row"><span class="pic ${cls}">${ic(icn)}</span><div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div></div>`;
  const next = d.milestones.find(m => !m.done);
  box.innerHTML = `<div class="inv-stats inv-s3"><div><b>${fmt(d.invited)}</b><span>${plural(d.invited, ["друг пришёл", "друга пришли", "друзей пришли"])}</span></div>
      <div><b>${fmt(d.active)}</b><span>активных (${d.l1[0]}+ ур.)</span></div>
      <div><b class="tw">+${short(d.earned)} ⭐</b><span>заработано</span></div></div>
    ${d.on ? `<div class="sec-t">Что ты получаешь</div><div class="box">
      ${d.join ? step("userPlus", "b", `+${fmt(d.join)} ⭐ сразу`, "когда друг зайдёт по ссылке") : ""}
      ${d.l1[1] ? step("medal", "g", `+${fmt(d.l1[1])} ⭐`, `когда друг дойдёт до ${d.l1[0]} уровня`) : ""}
      ${d.l2[1] ? step("crown", "y", `+${fmt(d.l2[1])} ⭐`, `когда друг дойдёт до ${d.l2[0]} уровня`) : ""}
      ${d.buyPct ? step("gift", "b", `${d.buyPct}% с покупок друга`, "от звёзд, которые он купит в магазине") : ""}</div>` : ""}
    ${d.on && d.milestones.length ? `<div class="sec-t">Награды за активных друзей</div><div class="box">${d.milestones.map(m => `<div class="row kv inv-ms${m.done ? " done" : ""}">
        <div class="grow"><div class="t">${m.n} ${plural(m.n, ["друг", "друга", "друзей"])}</div>
        <div class="inv-bar"><i style="width:${Math.min(100, d.active / m.n * 100)}%"></i></div></div>
        <b>${m.done ? "✓ " : ""}+${short(m.amount)} ⭐</b></div>`).join("")}</div>
      ${next ? `<div class="hint" style="font-size:12px;text-align:center;margin-top:6px">До награды +${fmt(next.amount)} ⭐ — ещё ${next.n - d.active} ${plural(next.n - d.active, ["активный друг", "активных друга", "активных друзей"])}</div>` : ""}` : ""}
    ${d.on && d.topOn ? `<div class="sec-t">Топ недели · до ${new Date(d.weekEnds * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</div>
      <div class="hint" style="font-size:12px;margin:-4px 0 8px">Кто приведёт больше активных друзей за неделю. Призы: ${d.prizes.map((p, i) => `${i + 1} место — ${short(p)} ⭐`).join(", ")} (от ${d.topMin} друзей). У тебя за неделю: <b>${d.myWeek}</b></div>
      <div class="box">${d.top.map((u, i) => `<div class="row tap" data-act="profile" data-id="${u.id}"><span class="inv-pl">${i + 1}</span>${avaHTML(u, 32)}<div class="grow" style="min-width:0"><div class="t">${esc(u.name)}</div></div><b>${u.n}</b></div>`).join("")
        || `<div class="hint" style="padding:14px">На этой неделе пока никого — стань первым</div>`}</div>` : ""}
    ${d.friends.length ? `<div class="sec-t">Мои друзья</div><div class="box">${d.friends.map(f => `<div class="row tap" data-act="profile" data-id="${f.id}">${avaHTML(f, 32)}
        <div class="grow" style="min-width:0"><div class="t">${esc(f.name)}</div><div class="s">${f.lv} ур.${d.on && f.lv < d.l2[0] ? ` · до бонуса ${f.lv < d.l1[0] ? d.l1[0] : d.l2[0]} ур.` : ""}</div></div></div>`).join("")}</div>` : ""}`;
  starify(box);
};
Object.assign(ACT, {
  "inv-copy": () => copyText(ME.refLink),
  "inv-share": () => {
    const text = ME.refBonus ? `Залетай в кейс-симулятор подарков 🎁 По моей ссылке получишь +${ME.refBonus} ⭐ на старт (игровых)` : "Залетай в кейс-симулятор подарков 🎁";
    const url = `https://t.me/share/url?url=${enc(ME.refLink)}&text=${enc(text)}`;
    if (inTg) tg.openTelegramLink(url); else copyText(ME.refLink);
  },
});
