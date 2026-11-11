"""Программа лояльности: очки за оборот ставок независимо от исхода и магазин очков (ключи от кейсов, рамки).
Очки начисляются из app.event() на каждую ставку со stake (игры и кейсы за звёзды; бесплатный кейс и ключи — без ставки, их нет).
Не считаются игры, где у банка нет своей доли с оборота (джекпот на подарки): иначе два аккаунта гоняли бы подарки по кругу ради очков.
Курс: 1 очко за [loyalty] per звёзд оборота, 1 очко ≈ 1 ⭐ в магазине → 0,5% оборота при per=200 (кэшбэк недели считается
отдельно и только по минусу). Уровни по накопленному за всё время: бронза, серебро (+25%), золото (+50%). В сутки не больше day_cap.
Вайп очки не трогает: это история лояльности, а не баланс."""
from settings import conf
import time

from fastapi import Depends, Request

import app as A
import economy as E
from app import R, app, auth, db, err, now, q, q1, tx

PER = max(1, conf("loyalty.per", 200))
DAY_CAP = conf("loyalty.day_cap", 50_000)
SILVER = conf("loyalty.silver", 20_000)
GOLD = conf("loyalty.gold", 100_000)
MULT = {"bronze": 1.0, "silver": 1.25, "gold": 1.5}
SKIP_KINDS = {"jroul"}   # ставка — ценность подарка, комиссии с подарков нет
FRAME_DAYS = 7
# магазин: id → (вид, что, название, цена в очках, дней)
ITEMS = {
    "key:pepehunt": ("key", "pepehunt", "Ключ «Охота на Пепе»", 525, 0),
    "key:luck": ("key", "luck", "Ключ «Удача»", 5_500, 0),
    "key:lux": ("key", "lux", "Ключ «Роскошь»", 7_000, 0),
    "key:elite": ("key", "elite", "Ключ «Элитный»", 17_500, 0),
    "key:cups": ("key", "cups", "Ключ «Кубки»", 30_000, 0),
    "fr:neon": ("frame", "neon", "Рамка «Неон» на 7 дней", 10_000, FRAME_DAYS),
    "fr:fire": ("frame", "fire", "Рамка «Пламя» на 7 дней", 18_000, FRAME_DAYS),
    "fr:loyal": ("frame", "loyal", "Рамка «Постоянный клиент» на 30 дней", 25_000, 30),
}

db.executescript("""
CREATE TABLE IF NOT EXISTS loyalty(user INTEGER PRIMARY KEY, pts INTEGER DEFAULT 0, total INTEGER DEFAULT 0, turn INTEGER DEFAULT 0,
  acc INTEGER DEFAULT 0, day INTEGER DEFAULT 0, dpts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS loyalty_log(id INTEGER PRIMARY KEY, user INTEGER, delta INTEGER, item TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS loyalty_log_user ON loyalty_log(user, id);
""")


def tier(total):
    return "gold" if total >= GOLD else "silver" if total >= SILVER else "bronze"


def add(uid, kind, stake):
    """Вызывается из app.event() внутри транзакции игры. stake — ставка в звёздах."""
    if stake <= 0 or kind in SKIP_KINDS:
        return
    r = q1("SELECT * FROM loyalty WHERE user=?", uid)
    if not r:
        db.execute("INSERT OR IGNORE INTO loyalty(user) VALUES(?)", (uid,))
        r = {"pts": 0, "total": 0, "turn": 0, "acc": 0, "day": 0, "dpts": 0}
    day = now() // 86400
    dpts = r["dpts"] if r["day"] == day else 0
    acc = r["acc"] + int(stake * MULT[tier(r["total"])])
    pts, acc = acc // PER, acc % PER
    pts = max(0, min(pts, DAY_CAP - dpts))
    db.execute("UPDATE loyalty SET pts=pts+?, total=total+?, turn=turn+?, acc=?, day=?, dpts=? WHERE user=?",
               (pts, pts, stake, acc, day, dpts + pts, uid))


A.LOY_ADD = add


def brief(uid):
    r = q1("SELECT pts, total FROM loyalty WHERE user=?", uid)
    return {"pts": r["pts"], "tier": tier(r["total"])} if r else {"pts": 0, "tier": "bronze"}


A.LOY_ME = brief


def _items(uid):
    out = []
    for i, (kind, what, name, price, days) in ITEMS.items():
        d = {"id": i, "kind": kind, "name": name, "price": price, "days": days}
        if kind == "key":
            c = E.CASES.get(what)
            if not c:
                continue
            d.update(case=what, cover=c["cover"], value=c["price"], title=c["title"])
        else:
            d.update(frame=what)
        out.append(d)
    return out


@app.get(R + "/loyal")
def loyal(uid=Depends(auth)):
    r = q1("SELECT * FROM loyalty WHERE user=?", uid) or {"pts": 0, "total": 0, "turn": 0, "day": 0, "dpts": 0}
    t = tier(r["total"])
    nxt = SILVER if t == "bronze" else GOLD if t == "silver" else 0
    return {"pts": r["pts"], "total": r["total"], "turn": r["turn"], "tier": t, "mult": MULT[t], "next": nxt, "per": PER, "dayCap": DAY_CAP,
            "today": r["dpts"] if r["day"] == now() // 86400 else 0, "silver": SILVER, "gold": GOLD,
            "items": _items(uid), "log": [dict(x) for x in q("SELECT delta, item, ts FROM loyalty_log WHERE user=? ORDER BY id DESC LIMIT 20", uid)]}


@app.post(R + "/loyal/buy")
async def buy(req: Request, uid=Depends(auth)):
    item = str((await req.json()).get("item", ""))
    if item not in ITEMS:
        err("Нет такого товара — обнови экран")
    kind, what, name, price, days = ITEMS[item]
    with tx():
        r = q1("SELECT pts FROM loyalty WHERE user=?", uid)
        if not r or r["pts"] < price:
            err(f"Не хватает очков: нужно {price:,}".replace(",", " "))
        t = now()
        db.execute("UPDATE loyalty SET pts=pts-? WHERE user=?", (price, uid))
        db.execute("INSERT INTO loyalty_log(user,delta,item,ts) VALUES(?,?,?,?)", (uid, -price, item, t))
        if kind == "key":
            db.execute("INSERT INTO case_keys(user,cid,n) VALUES(?,?,1) ON CONFLICT(user,cid) DO UPDATE SET n=n+1", (uid, what))
        else:
            import style
            style.grant(uid, what, t + days * 86400)
        pts = q1("SELECT pts FROM loyalty WHERE user=?", uid)["pts"]
    return {"ok": True, "pts": pts, "name": name}
