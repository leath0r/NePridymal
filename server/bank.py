"""Банк казино: история прибыли по дням, акции казино с дивидендами, рекордсмены против банка."""
import asyncio
import time

from fastapi import Depends, Request

from app import R, app, auth, bal, db, err, event, notify, now, q, q1, tx, user_brief, day_start, GAME_KINDS, BANK_START

db.executescript("""
CREATE TABLE IF NOT EXISTS shares(user INTEGER PRIMARY KEY, n INTEGER DEFAULT 0, cost INTEGER DEFAULT 0, ts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS div_days(day INTEGER PRIMARY KEY, profit INTEGER, per_share REAL, total INTEGER, holders INTEGER, ts INTEGER);
""")
SUPPLY = 100_000        # всего акций: цена = банк / SUPPLY
MAX_PER_USER = 2_000    # не больше 2% казино в одни руки
DIV_SHARE = 0.20        # доля дневной прибыли казино, уходящая держателям
DIV_FLOOR = 10_000      # делим минимум на столько акций: пара акций у единственного держателя не должна забирать всю долю
SELL_FEE = 0.03
LOCK = 86400            # продать можно через сутки после последней покупки
BANK_KINDS = f"kind IN {GAME_KINDS} OR kind IN ('jackpot','ticket','share','div','crypto','futures','fee','loan','clan','clanprize','mkbank','tourn','clanspend','lucky','season','cashback','frcut','flash')"


_BV = {"ts": 0, "v": 0}


def bank_value():
    """Банк казино (кэш 15 с — сумма по всей таблице событий, а она растёт на десятки тысяч строк в сутки)."""
    if time.time() - _BV["ts"] > 15:
        _BV.update(ts=time.time(), v=BANK_START - q1(f"SELECT COALESCE(SUM(delta),0) s FROM events WHERE {BANK_KINDS}")["s"])
    return _BV["v"]


def price():
    return max(1, round(bank_value() / SUPPLY))


def house_profit(day):
    return -q1(f"SELECT COALESCE(SUM(delta),0) s FROM events WHERE kind IN {GAME_KINDS} AND ts>=? AND ts<?", day, day + 86400)["s"]


def _pay(day):
    """Дивиденды за прошедший день (идемпотентно): DIV_SHARE прибыли делится на все акции у игроков."""
    with tx():
        if q1("SELECT 1 FROM div_days WHERE day BETWEEN ? AND ?", day - 60, day + 60):   # за этот день уже платили
            return []
        profit = house_profit(day)
        holders = q("SELECT user, n FROM shares WHERE n>0")
        held = sum(h["n"] for h in holders)
        per = DIV_SHARE * profit / max(held, DIV_FLOOR) if profit > 0 and held else 0
        paid = []
        for h in holders:
            amount = int(per * h["n"])
            if amount > 0:
                db.execute("UPDATE users SET stars=stars+? WHERE id=?", (amount, h["user"]))
                event(h["user"], "div", amount)
                paid.append((h["user"], amount))
        db.execute("INSERT INTO div_days VALUES(?,?,?,?,?,?)", (day, profit, per, sum(a for _, a in paid), len(paid), now()))
    for u, a in paid:
        notify(u, f"Дивиденды банка: +{a} ⭐ (игровых) за вчера.")
    return paid


async def div_loop():
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _pay, day_start() - 86400)
        except Exception as e:
            print("div:", e, flush=True)
        await asyncio.sleep(60)


@app.on_event("startup")
async def _div_start():
    asyncio.create_task(div_loop())


@app.get(R + "/bank/info")
def bank_info(uid=Depends(auth)):
    d = day_start()
    days = []
    for i in range(13, -1, -1):
        s = d - i * 86400
        days.append({"day": s, "profit": house_profit(s)})
    me = q1(f"SELECT COALESCE(SUM(delta),0) s FROM events WHERE user=? AND kind IN {GAME_KINDS}", uid)["s"]
    sh = q1("SELECT * FROM shares WHERE user=?", uid)
    held = q1("SELECT COALESCE(SUM(n),0) s FROM shares")["s"]
    last = q1("SELECT * FROM div_days ORDER BY day DESC LIMIT 1")
    my_div = q1("SELECT COALESCE(SUM(delta),0) s FROM events WHERE user=? AND kind='div'", uid)["s"]

    def top(order):
        out = []
        for r in q(f"SELECT user, SUM(delta) s FROM events WHERE kind IN {GAME_KINDS} GROUP BY user ORDER BY s {order} LIMIT 5"):
            u = q1("SELECT * FROM users WHERE id=?", r["user"])
            if u and (r["s"] > 0 if order == "DESC" else r["s"] < 0):
                out.append({**user_brief(u), "sum": r["s"]})
        return out
    holders = []
    for r in q("SELECT * FROM shares WHERE n>0 ORDER BY n DESC LIMIT 5"):
        u = q1("SELECT * FROM users WHERE id=?", r["user"])
        if u:
            holders.append({**user_brief(u), "n": r["n"]})
    p = price()
    n = sh["n"] if sh else 0
    today = house_profit(d)
    return {
        "bank": bank_value(), "start": BANK_START, "today": today, "days": days, "me": me,
        "price": p, "supply": SUPPLY, "held": held, "maxPer": MAX_PER_USER, "sellFee": SELL_FEE, "divShare": DIV_SHARE, "divFloor": DIV_FLOOR,
        "mine": {"n": n, "cost": sh["cost"] if sh else 0, "value": n * p, "div": my_div,
                 "sellIn": max(0, sh["ts"] + LOCK - now()) if n else 0,
                 "est": int(DIV_SHARE * max(0, today) / max(held, DIV_FLOOR) * n) if n else 0},
        "lastDiv": {"perShare": round(last["per_share"], 2), "total": last["total"], "profit": last["profit"]} if last else None,
        "endsIn": d + 86400 - now(), "robbers": top("DESC"), "sponsors": top("ASC"), "holders": holders,
    }


@app.post(R + "/bank/shares")
async def bank_shares(req: Request, uid=Depends(auth)):
    b = await req.json()
    n = int(b.get("n", 0))
    if not n or abs(n) > MAX_PER_USER:
        err("Неверное количество")
    with tx():
        p = price()
        sh = q1("SELECT * FROM shares WHERE user=?", uid) or {"n": 0, "cost": 0, "ts": 0}
        if n > 0:
            if sh["n"] + n > MAX_PER_USER:
                err(f"Можно держать не больше {MAX_PER_USER} акций")
            held = q1("SELECT COALESCE(SUM(n),0) s FROM shares")["s"]
            if held + n > SUPPLY:
                err("Свободных акций не осталось")
            cost = n * p
            if bal(uid) < cost:
                err("Не хватает звёзд")
            db.execute("UPDATE users SET stars=stars-? WHERE id=?", (cost, uid))
            db.execute("INSERT INTO shares(user,n,cost,ts) VALUES(?,?,?,?) ON CONFLICT(user) DO UPDATE SET n=n+?, cost=cost+?, ts=?",
                       (uid, n, cost, now(), n, cost, now()))
            event(uid, "share", -cost)
        else:
            n = -n
            if n > sh["n"]:
                err("У тебя нет столько акций")
            if sh["ts"] + LOCK > now():
                left = sh["ts"] + LOCK - now()
                err(f"Продать можно через {left // 3600} ч {left % 3600 // 60} мин после покупки")
            got = int(n * p * (1 - SELL_FEE))
            cost_part = round(sh["cost"] * n / sh["n"])
            db.execute("UPDATE users SET stars=stars+? WHERE id=?", (got, uid))
            db.execute("UPDATE shares SET n=n-?, cost=cost-? WHERE user=?", (n, cost_part, uid))
            event(uid, "share", got)
    return {"ok": True, "stars": bal(uid)}
