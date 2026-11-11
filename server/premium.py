"""Платное за Telegram Stars, кроме пакетов звёзд:
  · VIP на 7 дней — бонус дня ×2, бесплатный кейс вдвое чаще, комиссия маркета −50%, золотая рамка и значок;
  · VIP-подписка — то же на 30 дней с автопродлением (подписка Telegram Stars: Telegram сам списывает раз в 30 дней и присылает
    successful_payment с is_recurring; отключить можно из игры — editUserStarSubscription — или в настройках Telegram, VIP тогда
    остаётся до конца оплаченного периода);
  · «Набор дня» — раз в сутки (по Москве): звёзды + ключ от дорогого кейса, наборы меняются по дням;
  · «Звёздный сундук» — кейс только за Telegram Stars: топ-коллекции, подарок — лучший из 6 бросков (редкие модели/фоны).
Счёт: shop.make_invoice; начисление: shop.on_paid → fulfill() (ровно один раз по charge)."""
import json
import random

from fastapi import Depends, Request

import economy as E
from app import R, app, auth, db, err, esc, event, gift_out, notify, now, q, q1, tx

from settings import conf

VIP_XTR, VIP_DAYS = 99, 7
VIP_SUB_XTR = conf("shop.vip_sub_xtr", 299)   # VIP-подписка: Telegram Stars за 30 дней, списывается автоматически
SUB_PERIOD = 2592000                            # единственный период подписки, который принимает Telegram (30 дней)
TZ = 3 * 3600
OFFERS = [   # (Telegram Stars, игровых звёзд, ключ от кейса)
    (49, 60_000, "peach"),
    (99, 120_000, "durov"),
    (199, 250_000, "mega"),
]
CHEST_XTR = 150
CHEST = [("Plush Pepe", 0.08), ("Heart Locket", 0.14), ("Durov's Cap", 0.33), ("Precious Peach", 0.45)]
CHEST_ROLLS = 6
KINDS = ("vip", "vipsub", "offer", "chest")
# подписка: charge — id первого платежа (им Telegram опознаёт подписку в editUserStarSubscription), expires — конец оплаченного
# периода, cancelled — автопродление отключено (VIP до expires), renewals — сколько раз продлилась
db.executescript("""
CREATE TABLE IF NOT EXISTS vip_sub(user INTEGER PRIMARY KEY, charge TEXT, started INTEGER, expires INTEGER, cancelled INTEGER DEFAULT 0,
  renewals INTEGER DEFAULT 0, ts INTEGER);
""")

for _c in ("vip_until INTEGER DEFAULT 0",):
    try:
        db.execute("ALTER TABLE users ADD COLUMN " + _c)
    except Exception:
        pass
try:
    db.execute("ALTER TABLE payments ADD COLUMN kind TEXT DEFAULT 'pack'")
except Exception:
    pass


def mday():
    return (now() + TZ) // 86400


def _d(ts):
    """«25 декабря» по Москве — для сообщений бота."""
    import time as _t
    g = _t.gmtime(ts + TZ)
    return f"{g.tm_mday} {('января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря')[g.tm_mon - 1]}"


def offer_today():
    d = mday()
    xtr, stars, cid = OFFERS[d % len(OFFERS)]
    return {"id": f"{d}", "xtr": xtr, "stars": stars, "cid": cid, "ends": (d + 1) * 86400 - TZ}


def offer_bought(uid):
    return bool(q1("SELECT 1 FROM payments WHERE user=? AND kind='offer' AND ts>=?", uid, mday() * 86400 - TZ))


def vip_until(uid):
    r = q1("SELECT vip_until FROM users WHERE id=?", uid)
    return r["vip_until"] if r and r["vip_until"] and r["vip_until"] > now() else 0


def sub_info(uid):
    """Подписка игрока для клиента и админки: active — оплаченный период ещё идёт."""
    r = q1("SELECT * FROM vip_sub WHERE user=?", uid)
    if not r:
        return {"active": False}
    return {"active": r["expires"] > now(), "expires": r["expires"], "cancelled": bool(r["cancelled"]), "renewals": r["renewals"], "since": r["started"]}


def chest_drop(rng=random):
    col = rng.choices([c for c, _ in CHEST], weights=[p for _, p in CHEST])[0]
    return max((E.roll(col, rng) for _ in range(CHEST_ROLLS)), key=lambda d: d["value"])


_CHEST_EV = {}


def chest_info():
    if not _CHEST_EV:
        for c, _ in CHEST:
            _CHEST_EV[c] = int(sum(max((E.roll(c) for _ in range(CHEST_ROLLS)), key=lambda d: d["value"])["value"] for _ in range(120)) / 120)
    return [{"col": c, "p": p, "ev": _CHEST_EV[c]} for c, p in CHEST]


def _shop_on():
    import shop
    return shop.shop_on()


@app.get(R + "/premium")
def premium(uid=Depends(auth)):
    o = offer_today()
    c = E.CASES[o["cid"]]
    cols = chest_info()
    last = q1("SELECT id FROM gifts WHERE owner=? AND id IN (SELECT gift FROM feed WHERE user=? AND cs='chest') ORDER BY id DESC LIMIT 1", uid, uid)
    import shop
    return {"vip": {"until": vip_until(uid), "xtr": VIP_XTR, "days": VIP_DAYS, "on": shop.sale_on("vip"), "subXtr": VIP_SUB_XTR, "sub": sub_info(uid)},
            "offer": {**o, "bought": offer_bought(uid) or not _shop_on(), "off": not _shop_on(), "case": {"id": c["id"], "title": E.case_title(c["id"], uid), "cover": E.case_cover(c["id"], uid), "price": c["price"]}},
            "chest": {"on": shop.sale_on("chest"), "xtr": CHEST_XTR, "cols": cols, "ev": int(sum(x["p"] * x["ev"] for x in cols)), "last": last["id"] if last else 0},
            "now": now()}


@app.get(R + "/premium/chest/{after}")
def chest_last(after: int, uid=Depends(auth)):
    """Подарок из сундука, выданный после оплаты (клиент ждёт его, чтобы показать открытие)."""
    r = q1("SELECT g.* FROM gifts g JOIN feed f ON f.gift=g.id WHERE f.user=? AND f.cs='chest' AND g.id>? ORDER BY g.id DESC LIMIT 1", uid, after)
    return {"gift": gift_out(r) if r else None}


def amount(k):
    return {"vip": VIP_XTR, "vipsub": VIP_SUB_XTR, "offer": offer_today()["xtr"], "chest": CHEST_XTR}[k]


@app.post(R + "/premium/invoice")
async def premium_invoice(req: Request, uid=Depends(auth)):
    import shop
    k = str((await req.json()).get("k", ""))
    if k not in KINDS:
        err("Действие устарело — обнови экран")
    if not shop.sale_on({"offer": "shop", "vipsub": "vip"}.get(k, k)):
        err({"vip": "VIP сейчас не продаётся", "chest": "Звёздный сундук сейчас недоступен"}.get(k, "Покупка звёзд сейчас недоступна"))
    if k == "offer" and offer_bought(uid):
        err("Набор дня уже куплен — завтра будет новый")
    if k == "vipsub" and sub_info(uid)["active"]:
        err("VIP-подписка уже оформлена")
    o = offer_today()
    title, desc = {
        "vip": (f"VIP на {VIP_DAYS} дней", "Бонус дня ×2, бесплатный кейс вдвое чаще, комиссия маркета −50%, золотая рамка и значок VIP."),
        "vipsub": ("VIP-подписка", "VIP на 30 дней с автопродлением: бонус дня ×2, бесплатный кейс вдвое чаще, комиссия маркета −50%, золотая рамка и значок. "
                   "Отключить можно в любой момент в игре или в настройках Telegram."),
        "offer": ("Набор дня", f"{o['stars']:,} игровых звёзд + ключ от кейса «{E.case_title(o['cid'], uid)}». Только сегодня.".replace(",", " ")),
        "chest": ("Звёздный сундук", "Подарок из топ-коллекций с редкой моделью: Plush Pepe, Heart Locket, Durov's Cap, Precious Peach."),
    }[k]
    link = await shop.make_invoice(title, desc, {"u": uid, "x": amount(k), "k": k, "d": o["id"]}, amount(k),
                                   **({"subscription_period": SUB_PERIOD} if k == "vipsub" else {}))
    return {"link": link}


@app.post(R + "/premium/sub")
async def sub_toggle(req: Request, uid=Depends(auth)):
    """Отключить или включить обратно автопродление VIP-подписки. VIP в любом случае остаётся до конца оплаченного периода."""
    cancel = bool((await req.json()).get("cancel"))
    r = q1("SELECT * FROM vip_sub WHERE user=?", uid)
    if not r or r["expires"] <= now():
        err("Подписки нет")
    if bool(r["cancelled"]) == cancel:
        return {"sub": sub_info(uid)}
    import franchise
    from app import tg_call
    res = await tg_call("editUserStarSubscription", _token=franchise.pay_token(), user_id=uid, telegram_payment_charge_id=r["charge"], is_canceled=cancel)
    if not res.get("ok"):
        err("Telegram не принял запрос, попробуй позже или отключи подписку в настройках Telegram → Мои звёзды")
    with tx():
        db.execute("UPDATE vip_sub SET cancelled=? WHERE user=?", (1 if cancel else 0, uid))
    return {"sub": sub_info(uid)}


def validate(p, total):
    k = p.get("k")
    if k not in KINDS:
        return False
    if k == "offer":   # набор мог смениться в полночь — принимаем вчерашний счёт по его же цене
        return int(total) == p.get("x") and p.get("x") in [x for x, _, _ in OFFERS]
    return int(total) == amount(k)


def fulfill(uid, k, xtr, charge, p, sp=None):
    """Начисление после successful_payment (внутри — своя транзакция, идемпотентно по charge). sp — сам successful_payment:
    у подписки в нём subscription_expiration_date и is_first_recurring."""
    msg = None
    sp = sp or {}
    with tx():
        if q1("SELECT 1 FROM payments WHERE charge=?", charge):
            return
        t = now()
        stars = 0
        if k == "vipsub":
            exp = int(sp.get("subscription_expiration_date") or 0) or t + SUB_PERIOD
            u = q1("SELECT vip_until FROM users WHERE id=?", uid)
            cur = q1("SELECT * FROM vip_sub WHERE user=?", uid)
            # продление Telegram шлёт с is_recurring без is_first_recurring; если полей нет — судим по сроку прошлой подписки
            first = bool(sp.get("is_first_recurring")) or not cur or (not sp.get("is_recurring") and cur["expires"] <= t)
            if first:   # новая подписка: остаток разового VIP не пропадает — добавляется к оплаченному периоду
                until = exp + max(0, (u["vip_until"] or 0) - t)
                db.execute("INSERT INTO vip_sub(user,charge,started,expires,cancelled,renewals,ts) VALUES(?,?,?,?,0,0,?) "
                           "ON CONFLICT(user) DO UPDATE SET charge=excluded.charge, started=excluded.started, expires=excluded.expires, cancelled=0, renewals=0, ts=excluded.ts",
                           (uid, charge, t, exp, t))
                msg = f"👑 VIP-подписка оформлена: бонус дня ×2, бесплатный кейс вдвое чаще, комиссия маркета −50%. Продлится сама {_d(exp)}. Спасибо!"
            else:
                until = max(u["vip_until"] or 0, exp)
                db.execute("UPDATE vip_sub SET expires=?, cancelled=0, renewals=renewals+1, ts=? WHERE user=?", (exp, t, uid))
                msg = f"👑 VIP-подписка продлена до {_d(exp)}. Спасибо, что с нами!"
            db.execute("UPDATE users SET vip_until=? WHERE id=?", (until, uid))
        elif k == "vip":
            u = q1("SELECT vip_until FROM users WHERE id=?", uid)
            until = max(t, u["vip_until"] or 0) + VIP_DAYS * 86400
            db.execute("UPDATE users SET vip_until=? WHERE id=?", (until, uid))
            msg = f"👑 VIP активирован на {VIP_DAYS} дней: бонус дня ×2, бесплатный кейс вдвое чаще, комиссия маркета −50%. Спасибо!"
        elif k == "offer":
            o = next(((x, s, c) for x, s, c in OFFERS if x == xtr), OFFERS[0])
            stars = o[1]
            db.execute("UPDATE users SET stars=stars+? WHERE id=?", (stars, uid))
            event(uid, "buy", stars)
            __import__("bank").back(stars)
            db.execute("INSERT INTO case_keys(user,cid,n) VALUES(?,?,1) ON CONFLICT(user,cid) DO UPDATE SET n=n+1", (uid, o[2]))
            msg = (f"🎁 Набор дня: +{stars:,} ⭐ и ключ от кейса «{esc(E.case_title(o[2], uid))}». Спасибо!").replace(",", " ")
        elif k == "chest":
            import fair
            rng = fair.stream(uid, "chest", "chest")
            d = chest_drop(rng)
            fair.record(uid, "chest", 0, d["value"], {"col": d["col"], "value": d["value"]}, fair.close_stream(rng))
            cur = db.execute("INSERT INTO gifts(owner,col,model,backdrop,symbol,num,value,created) VALUES(?,?,?,?,?,?,?,?)",
                             (uid, d["col"], d["model"], d["backdrop"], d["symbol"], d["num"], d["value"], t))
            db.execute("INSERT INTO feed(user,gift,cs,ts) VALUES(?,?,?,?)", (uid, cur.lastrowid, "chest", t))
            msg = (f"💎 Звёздный сундук: {esc(d['col'])} «{esc(d['model'])}» — ценность ⭐ {d['value']:,}. Подарок уже в сумке!").replace(",", " ")
        db.execute("INSERT INTO payments(charge,user,xtr,stars,ts,kind) VALUES(?,?,?,?,?,?)", (charge, uid, xtr, stars, t, k))
    if msg:
        notify(uid, msg)
