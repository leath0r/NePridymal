"""Банк казино: история прибыли по дням, акции казино с дивидендами, рекордсмены против банка."""
import asyncio
import json
import time

from fastapi import Depends, Request

import app as A
from app import R, app, auth, bal, db, err, event, notify, now, q, q1, tx, user_brief, day_start, GAME_KINDS, BANK_START, kv_get
from settings import conf

db.executescript("""
CREATE TABLE IF NOT EXISTS shares(user INTEGER PRIMARY KEY, n INTEGER DEFAULT 0, cost INTEGER DEFAULT 0, ts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS div_days(day INTEGER PRIMARY KEY, profit INTEGER, per_share REAL, total INTEGER, holders INTEGER, ts INTEGER);
CREATE TABLE IF NOT EXISTS clan_shares(clan INTEGER PRIMARY KEY, n INTEGER DEFAULT 0, cost INTEGER DEFAULT 0, ts INTEGER DEFAULT 0, div INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS bank_saviors(user INTEGER PRIMARY KEY, amount INTEGER DEFAULT 0, ts INTEGER);
CREATE TABLE IF NOT EXISTS crisis_log(id INTEGER PRIMARY KEY, start INTEGER, end INTEGER DEFAULT 0, low INTEGER);
CREATE TABLE IF NOT EXISTS bank_vault(id INTEGER PRIMARY KEY, user INTEGER, gift TEXT, value INTEGER, ts INTEGER);
CREATE TABLE IF NOT EXISTS bank_recycled(day INTEGER PRIMARY KEY, n INTEGER DEFAULT 0, value INTEGER DEFAULT 0);
""")
SUPPLY = 100_000        # всего акций: цена = банк / SUPPLY
MAX_PER_USER = 2_000    # не больше 2% казино в одни руки
DIV_SHARE = 0.20        # доля дневной прибыли казино, уходящая держателям
DIV_FLOOR = 10_000      # делим минимум на столько акций: пара акций у единственного держателя не должна забирать всю долю
SELL_FEE = 0.03
LOCK = 86400            # продать можно через сутки после последней покупки
BANK_KINDS = f"kind IN {GAME_KINDS} OR kind IN ('jackpot','ticket','share','div','crypto','futures','fee','loan','clan','clanprize','mkbank','tourn','clanspend','lucky','season','cashback','frcut','flash','thanks','bankgift','clanshare','clandiv','league')"


_BV = {"ts": 0, "v": 0}
DONATE_MIN = 1
CLAN_MAX = 5_000                                         # акций у одного клана (из казны)
# кризис банка: банк ниже порога → ставки ограничены, дивиденды на паузе, подарки банку дают титул «Спаситель банка»
CRISIS_AT = conf("bank.crisis_at", 35_000_000)
CRISIS_MAX_BET = conf("bank.crisis_max_bet", 100_000)
SAVIOR_MIN = conf("bank.savior_min", 10_000)


def crisis():
    return bank_value() < CRISIS_AT


A.BET_CAP = lambda: CRISIS_MAX_BET if crisis() else None   # app.check_bet режет ставку в кризис


def crisis_since():
    r = q1("SELECT start FROM crisis_log WHERE end=0 ORDER BY id DESC LIMIT 1")
    return r["start"] if r else 0


def _owners():
    try:
        from admin import OWNERS
        return list(OWNERS)
    except Exception:
        return []


def _crisis_watch():
    """Раз в минуту: вход/выход из кризиса — в журнал и владельцам в личку."""
    on, since, b = crisis(), crisis_since(), bank_value()
    if on and not since:
        with tx():
            db.execute("INSERT INTO crisis_log(start,low) VALUES(?,?)", (now(), b))
        for o in _owners():
            notify(o, f"🚨 Банк игры упал ниже ⭐ {CRISIS_AT:,} — включён КРИЗИС: ставки до ⭐ {CRISIS_MAX_BET:,}, дивиденды на паузе.".replace(",", " "))
    elif on:
        with tx():
            db.execute("UPDATE crisis_log SET low=MIN(low,?) WHERE end=0", (b,))
    elif since:
        with tx():
            db.execute("UPDATE crisis_log SET end=? WHERE end=0", (now(),))
        for o in _owners():
            notify(o, f"✅ Банк снова выше ⭐ {CRISIS_AT:,} — кризис закончился.".replace(",", " "))


# ---------------- хранилище банка: подарки, проигранные в апгрейде. Через VAULT_TTL перерабатываются ----------------
# Ценность подарка банк получил ещё в момент проигрыша (событие upgrade с минусом) — переработка только убирает подарок из витрины.
VAULT_TTL = 48 * 3600


def vault_put(uid, gifts):
    """Внутри tx апгрейда: копия подарка (как его видел игрок) — в хранилище."""
    for g in gifts:
        db.execute("INSERT INTO bank_vault(user,gift,value,ts) VALUES(?,?,?,?)", (uid, json.dumps(A.gift_out(g)), g["value"], now()))


A.VAULT_PUT = vault_put


def _vault_recycle():
    """Раз в минуту: подарки старше 48 ч перерабатываются (статистика по дням — bank_recycled)."""
    old = q1("SELECT COUNT(*) n, COALESCE(SUM(value),0) v FROM bank_vault WHERE ts<=?", now() - VAULT_TTL)
    if not old["n"]:
        return
    with tx():
        db.execute("INSERT INTO bank_recycled(day,n,value) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET n=n+excluded.n, value=value+excluded.value",
                   (day_start(), old["n"], old["v"]))
        db.execute("DELETE FROM bank_vault WHERE ts<=?", (now() - VAULT_TTL,))


@app.get(R + "/bank/vault")
def bank_vault(uid=Depends(auth)):
    t = now()
    rows = q("SELECT * FROM bank_vault ORDER BY value DESC LIMIT 200")
    names = {}
    out = []
    for r in rows:
        if r["user"] not in names:
            u = q1("SELECT * FROM users WHERE id=?", r["user"])
            names[r["user"]] = user_brief(u) if u else {"id": r["user"], "name": "Игрок"}
        g = json.loads(r["gift"])
        out.append({"id": r["id"], "gift": g, "value": r["value"], "from": names[r["user"]], "left": max(0, r["ts"] + VAULT_TTL - t), "mine": r["user"] == uid})
    tot = q1("SELECT COUNT(*) n, COALESCE(SUM(value),0) v FROM bank_vault")
    rec = q1("SELECT COALESCE(SUM(n),0) n, COALESCE(SUM(value),0) v FROM bank_recycled WHERE day>=?", day_start() - 6 * 86400)
    return {"items": out, "count": tot["n"], "value": tot["v"], "ttl": VAULT_TTL, "recycled": {"n": rec["n"], "value": rec["v"]}}


def held_total():
    """Все акции на руках: у игроков и у кланов."""
    return q1("SELECT COALESCE(SUM(n),0) s FROM shares")["s"] + q1("SELECT COALESCE(SUM(n),0) s FROM clan_shares")["s"]


def bank_addr():
    """Адрес банка в формате кошелька (NP + 16 + контрольная сумма): на него можно перевести звёзды просто так."""
    from pay import _addr_sum
    body = "BANKGC0000000000"
    return "NP" + body + _addr_sum(body)


def donate(uid, amount):
    """Подарок банку: звёзды игрока уходят в банк, взамен ничего. Банк = старт − сумма событий, поэтому событие с минусом растит банк."""
    if amount < DONATE_MIN:
        err(f"минимум {DONATE_MIN} ⭐")
    with tx():
        if bal(uid) < amount:
            err("Не хватает звёзд")
        db.execute("UPDATE users SET stars=stars-? WHERE id=?", (amount, uid))
        event(uid, "bankgift", -amount)
        if crisis():   # в кризис подарок засчитывается в «Спасители банка»
            db.execute("INSERT INTO bank_saviors(user,amount,ts) VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET amount=amount+excluded.amount, ts=excluded.ts",
                       (uid, amount, now()))
    _BV["ts"] = 0
    return {"ok": True, "stars": bal(uid), "bank": bank_value()}


def bank_from():
    """С какого момента считаем банк: вайп (wipe.py) сбрасывает его к стартовому резерву — kv 'bank_from'."""
    return int(kv_get("bank_from", 0) or 0)


def bank_value():
    """Банк казино (кэш 15 с — сумма по всей таблице событий, а она растёт на десятки тысяч строк в сутки)."""
    if time.time() - _BV["ts"] > 15:
        _BV.update(ts=time.time(), v=BANK_START - q1(f"SELECT COALESCE(SUM(delta),0) s FROM events WHERE ({BANK_KINDS}) AND ts>=?", bank_from())["s"])
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
        clans_h = q("SELECT clan, n FROM clan_shares WHERE n>0")
        held = sum(h["n"] for h in holders) + sum(c["n"] for c in clans_h)
        per = DIV_SHARE * profit / max(held, DIV_FLOOR) if profit > 0 and held and not crisis() else 0   # в кризис дивиденды на паузе
        paid, cpaid = [], []
        for c in clans_h:   # клановые акции — дивиденды в казну клана
            amount = int(per * c["n"])
            if amount > 0:
                db.execute("UPDATE clans SET bank=bank+? WHERE id=?", (amount, c["clan"]))
                db.execute("UPDATE clan_shares SET div=div+? WHERE clan=?", (amount, c["clan"]))
                event(0, "clandiv", amount)
                cpaid.append((c["clan"], amount))
        for h in holders:
            amount = int(per * h["n"])
            if amount > 0:
                db.execute("UPDATE users SET stars=stars+? WHERE id=?", (amount, h["user"]))
                event(h["user"], "div", amount)
                paid.append((h["user"], amount))
        db.execute("INSERT INTO div_days VALUES(?,?,?,?,?,?)", (day, profit, per, sum(a for _, a in paid) + sum(a for _, a in cpaid), len(paid), now()))
        if cpaid:
            import clans
            for cid, a in cpaid:
                o = q1("SELECT owner FROM clans WHERE id=?", cid)
                clans.feed(cid, o["owner"] if o else 0, "sharediv", a)
    for u, a in paid:
        notify(u, f"Дивиденды банка: +{a} ⭐ (игровых) за вчера.")
    return paid


async def div_loop():
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _pay, day_start() - 86400)
        except Exception as e:
            print("div:", e, flush=True)
        try:
            await asyncio.get_running_loop().run_in_executor(None, _vault_recycle)
        except Exception as e:
            print("vault:", e, flush=True)
        try:
            await asyncio.get_running_loop().run_in_executor(None, _crisis_watch)
        except Exception as e:
            print("crisis:", e, flush=True)
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
    me = q1(f"SELECT COALESCE(SUM(delta),0) s FROM events WHERE user=? AND kind IN {GAME_KINDS} AND ts>=?", uid, bank_from())["s"]
    sh = q1("SELECT * FROM shares WHERE user=?", uid)
    held = held_total()
    last = q1("SELECT * FROM div_days ORDER BY day DESC LIMIT 1")
    my_div = q1("SELECT COALESCE(SUM(delta),0) s FROM events WHERE user=? AND kind='div'", uid)["s"]

    def top(order):
        out = []
        for r in q(f"SELECT user, SUM(delta) s FROM events WHERE kind IN {GAME_KINDS} AND ts>=? GROUP BY user ORDER BY s {order} LIMIT 5", bank_from()):
            u = q1("SELECT * FROM users WHERE id=?", r["user"])
            if u and (r["s"] > 0 if order == "DESC" else r["s"] < 0):
                out.append({**user_brief(u), "sum": r["s"]})
        return out
    donors = []
    for r in q("SELECT user, -SUM(delta) s FROM events WHERE kind='bankgift' AND ts>=? GROUP BY user ORDER BY s DESC LIMIT 5", bank_from()):
        u = q1("SELECT * FROM users WHERE id=?", r["user"])
        if u:
            donors.append({**user_brief(u), "sum": r["s"]})
    gifted = q1("SELECT COALESCE(-SUM(delta),0) s FROM events WHERE user=? AND kind='bankgift'", uid)["s"]
    saviors = []
    for r in q("SELECT * FROM bank_saviors ORDER BY amount DESC LIMIT 5"):
        u = q1("SELECT * FROM users WHERE id=?", r["user"])
        if u:
            saviors.append({**user_brief(u), "sum": r["amount"]})
    sv = q1("SELECT amount FROM bank_saviors WHERE user=?", uid)
    clan_holders = [{"id": r["id"], "tag": r["tag"], "name": r["name"], "n": r["n"]}
                    for r in q("SELECT c.id, c.tag, c.name, s.n FROM clan_shares s JOIN clans c ON c.id=s.clan WHERE s.n>0 ORDER BY s.n DESC LIMIT 5")]
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
        "vault": {"count": q1("SELECT COUNT(*) n FROM bank_vault")["n"], "value": q1("SELECT COALESCE(SUM(value),0) v FROM bank_vault")["v"]},
        "addr": bank_addr(), "donors": donors, "gifted": gifted, "clanHolders": clan_holders, "clanMax": CLAN_MAX,
        "crisis": {"on": crisis(), "at": CRISIS_AT, "maxBet": CRISIS_MAX_BET, "since": crisis_since(), "saviorMin": SAVIOR_MIN,
                   "saviors": saviors, "mine": sv["amount"] if sv else 0, "need": max(0, CRISIS_AT - bank_value())},
    }


def ticker():
    """Для плашки банка: кризис и последний крупный выигрыш (не старше минуты)."""
    w = q1("SELECT * FROM bigwins WHERE ts>=? ORDER BY id DESC LIMIT 1", now() - 60)
    win = None
    if w:
        import live
        u = q1("SELECT * FROM users WHERE id=?", w["user"])
        win = {"id": w["id"], "amount": w["amount"], "game": live.NAMES.get(w["kind"], w["kind"]), "name": user_brief(u)["name"] if u else "Игрок"}
    return {"crisis": crisis(), "crisisAt": CRISIS_AT, "win": win}


# ---------------- акции банка у кланов: покупает и продаёт глава из казны, дивиденды — в казну ----------------
def _my_clan(uid):
    import clans
    cid = clans.my_clan_id(uid)
    return (cid, clans.my_role(uid, cid)) if cid else (None, None)


@app.get(R + "/bank/clan")
def bank_clan(uid=Depends(auth)):
    cid, role = _my_clan(uid)
    if not cid:
        return {"clan": None}
    c = q1("SELECT bank FROM clans WHERE id=?", cid)
    sh = q1("SELECT * FROM clan_shares WHERE clan=?", cid)
    n, p, held = (sh["n"] if sh else 0), price(), held_total()
    return {"clan": cid, "owner": role == "owner", "pool": c["bank"] or 0, "n": n, "cost": sh["cost"] if sh else 0, "value": n * p, "price": p,
            "div": sh["div"] if sh else 0, "max": CLAN_MAX, "room": max(0, min(CLAN_MAX - n, SUPPLY - held)),
            "sellIn": max(0, sh["ts"] + LOCK - now()) if n else 0, "sellFee": SELL_FEE, "crisis": crisis(),
            "est": int(DIV_SHARE * max(0, house_profit(day_start())) / max(held, DIV_FLOOR) * n) if n and not crisis() else 0}


@app.post(R + "/bank/clan")
async def bank_clan_trade(req: Request, uid=Depends(auth)):
    n = int((await req.json()).get("n", 0))
    if not n or abs(n) > CLAN_MAX:
        err("Неверное количество")
    import clans
    with tx():
        cid, role = _my_clan(uid)
        if not cid:
            err("ты не в клане")
        if role != "owner":
            err("акциями клана распоряжается только глава")
        p = price()
        c = q1("SELECT bank FROM clans WHERE id=?", cid)
        sh = q1("SELECT * FROM clan_shares WHERE clan=?", cid) or {"n": 0, "cost": 0, "ts": 0}
        if n > 0:
            if sh["n"] + n > CLAN_MAX:
                err(f"клан может держать не больше {CLAN_MAX:,} акций".replace(",", " "))
            if held_total() + n > SUPPLY:
                err("Свободных акций не осталось")
            cost = n * p
            if (c["bank"] or 0) < cost:
                err(f"в казне только ⭐ {c['bank'] or 0:,}".replace(",", " "))
            db.execute("UPDATE clans SET bank=bank-? WHERE id=?", (cost, cid))
            db.execute("INSERT INTO clan_shares(clan,n,cost,ts) VALUES(?,?,?,?) ON CONFLICT(clan) DO UPDATE SET n=n+?, cost=cost+?, ts=?",
                       (cid, n, cost, now(), n, cost, now()))
            event(0, "clanshare", -cost)
            clans.feed(cid, uid, "sharebuy", n)
        else:
            n = -n
            if n > sh["n"]:
                err("у клана нет столько акций")
            if sh["ts"] + LOCK > now():
                left = sh["ts"] + LOCK - now()
                err(f"Продать можно через {left // 3600} ч {left % 3600 // 60} мин после покупки")
            got = int(n * p * (1 - SELL_FEE))
            db.execute("UPDATE clans SET bank=bank+? WHERE id=?", (got, cid))
            db.execute("UPDATE clan_shares SET n=n-?, cost=cost-? WHERE clan=?", (n, round(sh["cost"] * n / sh["n"]), cid))
            event(0, "clanshare", got)
            clans.feed(cid, uid, "sharesell", got)
    _BV["ts"] = 0
    return bank_clan(uid)


@app.post(R + "/bank/donate")
async def bank_donate(req: Request, uid=Depends(auth)):
    b = await req.json()
    try:
        amount = int(b.get("amount", 0))
    except (TypeError, ValueError):
        err("введи сумму")
    return donate(uid, amount)


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
            held = held_total()
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
