"""Переводы звёзд между игроками (экран «Кошелёк» в стиле WeChat): свой QR «Получить», сканер, перевод по QR/поиску.
QR и ссылка ведут на бота: t.me/<бот>?start=pay_<id>[_<сумма>] → кнопка открывает игру с ?pay=<id>&amt=<сумма>.
Получатель получает ровно сумму перевода, комиссия (как в обменах) списывается с отправителя сверху и уходит в банк."""
import math

from fastapi import Depends, Request

import loans
from app import BOT_NAME, R, app, auth, bal, db, err, esc, event, notify, now, q, q1, tx, user_brief
from settings import conf

FEE = conf("economy.transfer_fee", conf("economy.trade_fee", 0.05))
MIN = conf("economy.transfer_min", 10)
DAY_MAX = conf("economy.transfer_day_count", 50)   # переводов в сутки с одного аккаунта
NOTE_MAX = 60

db.executescript("""
CREATE TABLE IF NOT EXISTS transfers(id INTEGER PRIMARY KEY, src INTEGER, dst INTEGER, amount INTEGER, fee INTEGER, note TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS transfers_src ON transfers(src, ts);
CREATE INDEX IF NOT EXISTS transfers_dst ON transfers(dst, ts);
""")


def _fee(amount):
    return math.ceil(amount * FEE)


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
    return {"stars": bal(uid), "fee": FEE, "min": MIN, "link": f"https://t.me/{BOT_NAME}?start=pay_{uid}", "history": out}


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
    if amount < MIN:
        err(f"минимум {MIN} ⭐")
    fee = _fee(amount)
    with tx():
        dst = q1("SELECT id, banned FROM users WHERE id=?", to)
        if not dst or dst["banned"]:
            err("игрок не найден")
        if loans.stars_locked(uid):
            err("пока не закрыт кредит без залога или баланс в минусе, переводить звёзды нельзя")
        if q1("SELECT COUNT(*) n FROM transfers WHERE src=? AND ts>?", uid, now() - 86400)["n"] >= DAY_MAX:
            err(f"не больше {DAY_MAX} переводов в сутки")
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
    from admin import admin

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
