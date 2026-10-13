"""Кредиты банка казино на 3 дня, вернуть надо с комиссией 10%.
- под залог подарка: 50% ценности; не вернул — подарок переходит банку и выставляется на маркет;
- без залога: с 5 уровня, один за раз; лимит растёт с кредитной историей: ⭐ 10 000 + 10 000 за каждый вовремя возвращённый
  (до ⭐ 100 000), просрочка сбрасывает на 10 000 — иначе твинки брали бы 100 000 «бесплатной лотереей»;
  не вернул — долг списывается с баланса, даже в минус."""
from settings import conf
import asyncio
import math

from fastapi import Depends

from fastapi import Request

from app import (R, app, auth, bal, cancel_trades_with, db, err, esc, event, gift_out, in_open_trade, level, notify, now, own_gift,
                 q, q1, tx, unpin)

LOAN_OWNER = 2 * 10 ** 10  # подарок в залоге: owner = -(LOAN_OWNER + uid); выше диапазона сейфа (-(2e9 + uid), uid до ~1e10)
LTV = conf("loans.ltv", 0.5)                  # даём 50% ценности
FEE = conf("loans.fee", 0.10)                 # вернуть 110%
TERM = 3 * 86400
MAX_LOANS = 3
MIN_VALUE = 100
WARN = 12 * 3600           # напомнить за 12 часов до срока
CASH_STEP = conf("loans.cash_step", 10_000)   # кредит без залога: первый лимит и прибавка за каждый возвращённый
CASH_MAX = conf("loans.cash_max", 100_000)    # потолок
CASH_LEVEL = 5


def stars_locked(uid):
    """Пока есть кредит без залога или баланс в минусе — звёзды другим игрокам отдавать нельзя (против фарма с твинков)."""
    return bal(uid) < 0 or bool(q1("SELECT 1 FROM loans WHERE user=? AND status='open' AND gift IS NULL", uid))

db.executescript("""
CREATE TABLE IF NOT EXISTS loans(id INTEGER PRIMARY KEY, user INTEGER, gift INTEGER, principal INTEGER, debt INTEGER, ts INTEGER,
  until INTEGER, status TEXT DEFAULT 'open', closed INTEGER, warned INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS loans_user ON loans(user, status);
""")
try:   # paid — сколько уже внесено частями; осталось вернуть debt - paid
    db.execute("ALTER TABLE loans ADD COLUMN paid INTEGER DEFAULT 0")
except Exception:
    pass
PART_MIN = 100   # частичный взнос — не меньше (или весь остаток)


def _pay_events(uid, r, amount):
    """Взнос в счёт кредита: сначала гасится тело, потом комиссия (так журнал/прибыль банка сходятся при любом дроблении)."""
    paid = r["paid"] or 0
    body = max(0, min(amount, r["principal"] - paid))
    if body:
        event(uid, "loan", -body)
    if amount - body:
        event(uid, "fee", -(amount - body))
# переезд со старого кодирования -(3e9 + uid), которое могло совпасть с сейфом другого игрока
db.execute(f"UPDATE gifts SET owner=-({LOAN_OWNER}+(SELECT user FROM loans l WHERE l.gift=gifts.id AND l.status='open')) "
           "WHERE id IN (SELECT gift FROM loans WHERE status='open' AND gift IS NOT NULL)")


def cash_limit(uid):
    """Лимит кредита без залога: 10 000 + 10 000 за каждый возвращённый после последней просрочки, до 100 000."""
    lost = q1("SELECT MAX(closed) m FROM loans WHERE user=? AND gift IS NULL AND status='lost'", uid)["m"] or 0
    ok = q1("SELECT COUNT(*) n FROM loans WHERE user=? AND gift IS NULL AND status='repaid' AND closed>?", uid, lost)["n"]
    return min(CASH_MAX, CASH_STEP * (1 + ok))


def terms(value):
    principal = int(value * LTV)
    return principal, math.ceil(principal * (1 + FEE))


def loan_out(r):
    g = q1("SELECT * FROM gifts WHERE id=?", r["gift"]) if r["gift"] else None
    return {"id": r["id"], "gift": gift_out(g) if g else None, "principal": r["principal"], "debt": r["debt"] - (r["paid"] or 0),
            "total": r["debt"], "paid": r["paid"] or 0, "partMin": PART_MIN,
            "ts": r["ts"], "until": r["until"], "status": r["status"]}


@app.get(R + "/loans")
def loans(uid=Depends(auth)):
    return {"loans": [loan_out(r) for r in q("SELECT * FROM loans WHERE user=? AND status='open' ORDER BY until", uid)],
            "ltv": LTV, "fee": FEE, "term": TERM, "max": MAX_LOANS, "now": now(), "cashMax": cash_limit(uid), "cashCap": CASH_MAX, "cashStep": CASH_STEP, "cashLevel": CASH_LEVEL,
            "stars": bal(uid)}


@app.post(R + "/loans/cash")
async def take_cash(req: Request, uid=Depends(auth)):
    amount = int((await req.json()).get("amount", 0))
    t = now()
    with tx():
        lim = cash_limit(uid)
        if not 100 <= amount <= lim:
            err(f"сейчас можно до ⭐ {lim:,}".replace(",", " ") + " — каждый вовремя возвращённый кредит поднимает лимит")
        u = q1("SELECT xp, stars FROM users WHERE id=?", uid)
        if level(u["xp"]) < CASH_LEVEL:
            err(f"кредит без залога — с {CASH_LEVEL} уровня")
        if u["stars"] < 0:
            err("сначала закрой минус на балансе")
        if q1("SELECT 1 FROM loans WHERE user=? AND status IN ('open') AND gift IS NULL", uid):
            err("кредит без залога можно брать только один")
        debt = math.ceil(amount * (1 + FEE))
        cur = db.execute("INSERT INTO loans(user,gift,principal,debt,ts,until) VALUES(?,NULL,?,?,?,?)", (uid, amount, debt, t, t + TERM))
        db.execute("UPDATE users SET stars=stars+? WHERE id=?", (amount, uid))
        event(uid, "loan", amount)
    return {"ok": True, "id": cur.lastrowid, "got": amount, "debt": debt, "until": t + TERM, "stars": bal(uid)}


@app.post(R + "/gift/{gid}/loan")
def take_loan(gid: int, uid=Depends(auth)):
    t = now()
    with tx():
        g = own_gift(gid, uid)
        if g["price"] is not None:
            err("сначала сними подарок с маркета")
        if in_open_trade(gid):
            err("подарок участвует в обмене")
        if g["value"] < MIN_VALUE:
            err(f"в залог берём подарки от ⭐ {MIN_VALUE}")
        if q1("SELECT COUNT(*) n FROM loans WHERE user=? AND status='open'", uid)["n"] >= MAX_LOANS:
            err(f"не больше {MAX_LOANS} кредитов сразу")
        principal, debt = terms(g["value"])
        db.execute("UPDATE gifts SET owner=? WHERE id=?", (-(LOAN_OWNER + uid), gid))
        unpin(uid, gid)
        cancel_trades_with(gid)
        cur = db.execute("INSERT INTO loans(user,gift,principal,debt,ts,until) VALUES(?,?,?,?,?,?)", (uid, gid, principal, debt, t, t + TERM))
        db.execute("UPDATE users SET stars=stars+? WHERE id=?", (principal, uid))
        event(uid, "loan", principal)
    return {"ok": True, "id": cur.lastrowid, "got": principal, "debt": debt, "until": t + TERM, "stars": bal(uid)}


@app.post(R + "/loans/{lid}/repay")
async def repay(lid: int, req: Request, uid=Depends(auth)):
    """Вернуть кредит целиком или частью: {amount} — взнос; без amount или ≥ остатка — закрыть полностью."""
    try:
        b = await req.json()
    except Exception:
        b = {}
    amount = (b or {}).get("amount") if isinstance(b, dict) else None
    with tx():
        r = q1("SELECT * FROM loans WHERE id=? AND user=? AND status='open'", lid, uid) or err("кредит уже закрыт")
        left = r["debt"] - (r["paid"] or 0)
        if amount is None:
            amount = left
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            err("введи сумму")
        amount = min(amount, left)
        if amount < min(PART_MIN, left):
            err(f"взнос — от ⭐ {PART_MIN}")
        if bal(uid) < amount:
            err(f"Нужно ⭐ {amount}")
        db.execute("UPDATE users SET stars=stars-? WHERE id=?", (amount, uid))
        _pay_events(uid, r, amount)
        closed = amount == left
        if closed:
            if r["gift"]:
                db.execute("UPDATE gifts SET owner=? WHERE id=?", (uid, r["gift"]))
            db.execute("UPDATE loans SET status='repaid', closed=?, paid=debt WHERE id=?", (now(), lid))
        else:
            db.execute("UPDATE loans SET paid=COALESCE(paid,0)+? WHERE id=?", (amount, lid))
    return {"ok": True, "stars": bal(uid), "closed": closed, "paid": amount, "left": left - amount, "gift": bool(r["gift"])}


def _sweep():
    """Просрочка → подарок банку на маркет; напоминание за 12 ч."""
    t, msgs = now(), []
    with tx():
        for r in q("SELECT * FROM loans WHERE status='open' AND until<=?", t):
            db.execute("UPDATE loans SET status='lost', closed=? WHERE id=?", (t, r["id"]))
            left = r["debt"] - (r["paid"] or 0)
            if not r["gift"]:   # без залога — списываем остаток долга с баланса, хоть в минус
                db.execute("UPDATE users SET stars=stars-? WHERE id=?", (left, r["user"]))
                _pay_events(r["user"], r, left)
                msgs.append((r["user"], f"⌛ Срок кредита истёк — ⭐ {left} списаны с баланса. Если звёзд не хватило, баланс ушёл в минус: "
                                        "доход и выигрыши сначала закроют долг."))
                continue
            g = q1("SELECT * FROM gifts WHERE id=?", r["gift"])
            if r["paid"]:   # подарок забирает банк — внесённое частями возвращаем, иначе платить частями было бы хуже, чем не платить
                db.execute("UPDATE users SET stars=stars+? WHERE id=?", (r["paid"], r["user"]))
                back_fee = max(0, r["paid"] - r["principal"])
                event(r["user"], "loan", r["paid"] - back_fee)
                if back_fee:
                    event(r["user"], "fee", back_fee)
            if g:
                db.execute("UPDATE gifts SET owner=0, price=?, listed=? WHERE id=?", (max(10, g["value"]), t, g["id"]))
                msgs.append((r["user"], f"⌛ Срок кредита истёк — <b>{esc(g['col'])} #{g['num']}</b> перешёл банку казино и выставлен на маркет."
                                        + (f" Внесённые частями ⭐ {r['paid']} вернули на баланс." if r["paid"] else "")))
        for r in q("SELECT * FROM loans WHERE status='open' AND warned=0 AND until-?<=?", t, WARN):
            db.execute("UPDATE loans SET warned=1 WHERE id=?", (r["id"],))
            msgs.append((r["user"], f"⏰ Через {max(1, (r['until'] - t) // 3600)} ч истекает кредит: верни ⭐ {r['debt'] - (r['paid'] or 0)}, иначе "
                                    + ("подарок заберёт банк." if r["gift"] else "долг спишется с баланса, даже в минус.")))
    for uid, text in msgs:
        notify(uid, text)


async def loans_loop():
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _sweep)
        except Exception as e:
            print("loans:", e, flush=True)
        await asyncio.sleep(60)


@app.on_event("startup")
async def _loans_start():
    asyncio.create_task(loans_loop())
