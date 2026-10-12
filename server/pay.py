"""Переводы звёзд между игроками (экран «Кошелёк» в стиле WeChat): свой QR «Получить», сканер, перевод по QR/поиску.
QR и ссылка ведут на бота: t.me/<бот>?start=pay_<id>[_<сумма>] → кнопка открывает игру с ?pay=<id>&amt=<сумма>.
Получатель получает ровно сумму перевода, комиссия (как в обменах) списывается с отправителя сверху и уходит в банк."""
import json
import math

from fastapi import Depends, Request

import loans
from app import BOT_NAME, R, app, auth, bal, db, err, esc, event, kv_get, notify, now, q, q1, tx, user_brief
from settings import conf

# настройки: по умолчанию из settings.toml, владелец меняет на лету в админке (вкладка «Переводы», хранится в kv 'paycfg')
DEFAULTS = {
    "on": True,
    "fee": conf("economy.transfer_fee", conf("economy.trade_fee", 0.05)),
    "min": conf("economy.transfer_min", 10),
    "max": conf("economy.transfer_max", 0),            # один перевод не больше (0 — без ограничения)
    "day": conf("economy.transfer_day_count", 50),     # переводов в сутки с одного аккаунта
}
LIMITS = {"fee": (0, 0.5), "min": (1, 10 ** 7), "max": (0, 10 ** 10), "day": (1, 1000)}
CFG = {}
NOTE_MAX = 60


def _load():
    try:
        v = json.loads(kv_get("paycfg", "{}") or "{}")
        CFG.clear()
        CFG.update({k: x for k, x in v.items() if k in DEFAULTS})
    except Exception as e:
        print("paycfg:", e, flush=True)


def cfg(k):
    return CFG.get(k, DEFAULTS[k])


_load()

db.executescript("""
CREATE TABLE IF NOT EXISTS transfers(id INTEGER PRIMARY KEY, src INTEGER, dst INTEGER, amount INTEGER, fee INTEGER, note TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS transfers_src ON transfers(src, ts);
CREATE INDEX IF NOT EXISTS transfers_dst ON transfers(dst, ts);
""")


def _fee(amount):
    return math.ceil(amount * cfg("fee"))


def _brief(uid):
    u = q1("SELECT * FROM users WHERE id=?", uid)
    return user_brief(u) if u else None


@app.get(R + "/pay")
def pay_home(uid=Depends(auth)):
    rows = q("SELECT * FROM transfers WHERE src=? OR dst=? ORDER BY id DESC LIMIT 30", uid, uid)
    peers = {}
    out = []
    for r in rows:
        other = r["dst"] if r["src"] == uid else r["src"]
        if other not in peers:
            peers[other] = _brief(other)
        if peers[other]:
            out.append({"in": r["dst"] == uid, "amount": r["amount"], "fee": r["fee"], "note": r["note"], "ts": r["ts"], "user": peers[other]})
    return {"stars": bal(uid), "fee": cfg("fee"), "min": cfg("min"), "max": cfg("max"), "on": cfg("on"), "link": f"https://t.me/{BOT_NAME}?start=pay_{uid}", "history": out}


@app.get(R + "/pay/peer/{tid}")
def pay_peer(tid: int, uid=Depends(auth)):
    if tid == uid:
        err("это твой QR-код — дай его отсканировать другу")
    return _brief(tid) or err("игрок не найден")


@app.post(R + "/pay/send")
async def pay_send(req: Request, uid=Depends(auth)):
    b = await req.json()
    try:
        to, amount = int(b.get("to", 0)), int(b.get("amount", 0))
    except (TypeError, ValueError):
        err("введи сумму")
    note = " ".join(str(b.get("note", "")).split())[:NOTE_MAX]
    if to == uid:
        err("себе перевести нельзя")
    if not cfg("on"):
        err("Переводы временно отключены")
    if amount < cfg("min"):
        err(f"минимум {cfg('min')} ⭐")
    if cfg("max") and amount > cfg("max"):
        err(f"за один раз не больше {cfg('max'):,} ⭐".replace(",", " "))
    fee = _fee(amount)
    with tx():
        dst = q1("SELECT id, banned FROM users WHERE id=?", to)
        if not dst or dst["banned"]:
            err("игрок не найден")
        if loans.stars_locked(uid):
            err("пока не закрыт кредит без залога или баланс в минусе, переводить звёзды нельзя")
        if q1("SELECT COUNT(*) n FROM transfers WHERE src=? AND ts>?", uid, now() - 86400)["n"] >= cfg("day"):
            err(f"не больше {cfg('day')} переводов в сутки")
        if bal(uid) < amount + fee:
            err(f"Не хватает звёзд: нужно {amount + fee} ⭐ с комиссией")
        db.execute("UPDATE users SET stars=stars-? WHERE id=?", (amount + fee, uid))
        db.execute("UPDATE users SET stars=stars+? WHERE id=?", (amount, to))
        event(uid, "transfer", -amount)
        if fee:
            event(uid, "fee", -fee)
        event(to, "transfer", amount)
        db.execute("INSERT INTO transfers(src,dst,amount,fee,note,ts) VALUES(?,?,?,?,?,?)", (uid, to, amount, fee, note, now()))
        name = q1("SELECT name FROM users WHERE id=?", uid)["name"]
        left = bal(uid)
    notify(to, f"💸 Перевод от <b>{esc(name)}</b>: <b>{amount:,} ⭐</b>".replace(",", " ") + (f"\n\n<i>«{esc(note)}»</i>" if note else ""))
    return {"ok": True, "stars": left, "amount": amount, "fee": fee}


# ---------------- админка: переводы игрока (в карточке игрока) ----------------
def _admin_routes():
    from admin import OWNERS, admin, log

    @app.get(R + "/admin/pay")
    def admin_pay(aid=Depends(admin)):
        since = now() - 7 * 86400
        st = q1("SELECT COUNT(*) n, COALESCE(SUM(amount),0) s, COALESCE(SUM(fee),0) f, COUNT(DISTINCT src) u FROM transfers WHERE ts>=?", since)
        top = q("SELECT src, dst, SUM(amount) s, COUNT(*) n FROM transfers WHERE ts>=? GROUP BY src, dst ORDER BY s DESC LIMIT 10", since)
        recent = q("SELECT * FROM transfers ORDER BY id DESC LIMIT 40")
        peers = {}
        b = lambda i: peers.setdefault(i, _brief(i))
        return {"cfg": {k: cfg(k) for k in DEFAULTS}, "defaults": DEFAULTS, "changed": list(CFG), "canEdit": aid in OWNERS,
                "week": {"n": st["n"], "sum": st["s"], "fee": st["f"], "users": st["u"]},
                "top": [{"a": b(r["src"]), "b": b(r["dst"]), "sum": r["s"], "n": r["n"]} for r in top if b(r["src"]) and b(r["dst"])],
                "recent": [{"a": b(r["src"]), "b": b(r["dst"]), "amount": r["amount"], "note": r["note"], "ts": r["ts"]}
                           for r in recent if b(r["src"]) and b(r["dst"])]}

    @app.post(R + "/admin/pay")
    async def admin_pay_set(req: Request, aid=Depends(admin)):
        if aid not in OWNERS:
            err("Менять настройки переводов может только владелец")
        body = await req.json()
        cur = dict(CFG)
        for k, v in body.items():
            if k not in DEFAULTS:
                continue
            if v is None:
                cur.pop(k, None)
            elif k == "on":
                cur[k] = bool(v)
            else:
                try:
                    v = round(float(v), 4) if k == "fee" else int(v)
                except (TypeError, ValueError):
                    err("введи число")
                lo, hi = LIMITS[k]
                if not lo <= v <= hi:
                    err("недопустимое значение")
                cur[k] = v
        with tx():
            db.execute("INSERT INTO kv(k,v) VALUES('paycfg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (json.dumps(cur),))
            log(aid, "paycfg", None, ", ".join(f"{k}={cur.get(k, DEFAULTS[k])}" for k in DEFAULTS))
        CFG.clear()
        CFG.update(cur)
        return {"ok": True}

    @app.get(R + "/admin/user/{tid}/transfers")
    def admin_transfers(tid: int, aid=Depends(admin)):
        rows = q("SELECT * FROM transfers WHERE src=? OR dst=? ORDER BY id DESC LIMIT 50", tid, tid)
        sent = q1("SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE src=?", tid)["s"]
        got = q1("SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE dst=?", tid)["s"]
        peers, out = {}, []
        for r in rows:
            other = r["dst"] if r["src"] == tid else r["src"]
            if other not in peers:
                peers[other] = _brief(other)
            if peers[other]:
                out.append({"in": r["dst"] == tid, "amount": r["amount"], "note": r["note"], "ts": r["ts"], "user": peers[other]})
        return {"sent": sent, "got": got, "list": out}


_admin_routes()
