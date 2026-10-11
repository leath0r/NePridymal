"""Гарантированный доход: подарки приносят звёзды, сейф (стейкинг подарков), бизнесы."""
from settings import conf
import json

from fastapi import Depends, Request

from app import R, app, auth, bal, db, err, event, now, q, q1, tx, gift_out, unpin, cancel_trades_with, add_xp, INCOME_TAX

# ---------- схема ----------
for _c in ("inc_ts INTEGER DEFAULT 0",):
    try:
        db.execute("ALTER TABLE users ADD COLUMN " + _c)
    except Exception:
        pass
try:
    db.execute("ALTER TABLE gifts ADD COLUMN acq INTEGER DEFAULT 0")
    db.execute("UPDATE gifts SET acq=created")
except Exception:
    pass
db.executescript("""
-- когда подарок сменил владельца — с этого момента он начинает приносить доход новому владельцу
CREATE TRIGGER IF NOT EXISTS gift_acq AFTER UPDATE OF owner ON gifts WHEN NEW.owner > 0 AND NEW.owner != OLD.owner
BEGIN UPDATE gifts SET acq = CAST(strftime('%s','now') AS INTEGER) WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS gift_acq_new AFTER INSERT ON gifts
BEGIN UPDATE gifts SET acq = COALESCE(NEW.created, CAST(strftime('%s','now') AS INTEGER)) WHERE id = NEW.id; END;
CREATE TABLE IF NOT EXISTS vault(gift INTEGER PRIMARY KEY, user INTEGER, start INTEGER, until INTEGER, pct REAL);
CREATE TABLE IF NOT EXISTS biz(user INTEGER, bid TEXT, level INTEGER, ts INTEGER, PRIMARY KEY(user, bid));
""")

# ---------- 1. доход с коллекции ----------
GIFT_RATE = conf("economy.gift_income", 0.02)          # 2% ценности в сутки
GIFT_CAP = 12 * 3600      # копится максимум 12 часов
LAUNCH = 1791234400       # запуск дохода (2026-10-05 ~23:26 CEST) — с этого момента копят все


def _rate_mult(mp):
    return 2.0 if mp <= 5 else 1.5 if mp <= 10 else 1.0


def _gift_accrual(uid, t, inc_ts):
    """Сколько накапали подарки с прошлого сбора (каждый — с момента, как стал твоим)."""
    from app import LOOK
    total, per_day = 0.0, 0.0
    for g in q("SELECT col, model, value, acq FROM gifts WHERE owner=? AND price IS NULL", uid):
        mp = LOOK[g["col"]][0].get(g["model"], 99) if g["col"] in LOOK else 99
        day = g["value"] * GIFT_RATE * _rate_mult(mp)
        per_day += day
        since = max(inc_ts, g["acq"] or 0)
        total += day * max(0, min(t - since, t - inc_ts, GIFT_CAP)) / 86400
    return int(total), per_day, total


# ---------- 2. сейф ----------
VAULT = {1: 0.02, 3: 0.07, 7: 0.18}
VAULT_OWNER = 2 * 10 ** 9   # подарок в сейфе: owner = -(VAULT_OWNER + uid)

# ---------- 3. бизнесы ----------
BIZ = [  # id, название, картинка (коллекция), цена, доход/час на 1 уровне
    ("stall", "Ларёк с леденцами", "Lol Pop", 2_000, 17),
    ("coffee", "Кофейня", "Spiced Wine", 5_000, 42),
    ("bakery", "Кондитерская", "Homemade Cake", 8_000, 67),
    ("flowers", "Цветочный бутик", "Sakura Flower", 25_000, 210),
    ("jewelry", "Ювелирный салон", "Signet Ring", 80_000, 670),
    ("club", "Ночной клуб", "Party Sparkler", 250_000, 2_100),
    ("cinema", "Кинотеатр", "Record Player", 500_000, 2_100),
    ("durov", "Студия Дурова", "Durov's Cap", 1_000_000, 4_200),
    ("casino", "Мини-казино", "Money Pot", 2_500_000, 10_500),
    ("space", "Космодром", "Stellar Rocket", 6_000_000, 25_000),
    ("pepe", "Империя Пепе", "Plush Pepe", 15_000_000, 62_500),
]   # 2026-10-10: доходность урезана вдвое — до 500k ~20% цены в сутки, дороже ~10% (бизнесы печатали по 450k/сутки)
SHIFT_EVERY = 2 * 3600   # «Смена»: тапать 10 секунд, до часа дохода бизнеса, раз в 2 часа
SHIFT_TAPS = 40          # столько тапов — полный час дохода
try:
    db.execute("ALTER TABLE biz ADD COLUMN shift_ts INTEGER DEFAULT 0")
except Exception:
    pass
BIZ_CAP = 8 * 3600
BIZ_MAX = 10
BIZ_MAP = {b[0]: b for b in BIZ}


def biz_income(bid, level):
    return int(BIZ_MAP[bid][4] * (1 + 0.35 * (level - 1)))


def biz_upgrade(bid, level):
    return int(BIZ_MAP[bid][3] * 0.5 * 1.6 ** (level - 1))


def _biz_rows(uid, t):
    own = {r["bid"]: r for r in q("SELECT * FROM biz WHERE user=?", uid)}
    out, ready = [], 0
    for bid, name, col, price, _ in BIZ:
        r = own.get(bid)
        item = {"id": bid, "name": name, "col": col, "price": price, "level": r["level"] if r else 0}
        if r:
            inc = biz_income(bid, r["level"])
            acc = int(inc * min(t - r["ts"], BIZ_CAP) / 3600)
            ready += acc
            item.update(income=inc, accrued=acc, cap=inc * BIZ_CAP // 3600, full=t - r["ts"] >= BIZ_CAP,
                        shiftIn=max(0, (r["shift_ts"] or 0) + SHIFT_EVERY - t),
                        upgrade=biz_upgrade(bid, r["level"]) if r["level"] < BIZ_MAX else None,
                        next=biz_income(bid, r["level"] + 1) if r["level"] < BIZ_MAX else None)
        else:
            item.update(income=biz_income(bid, 1))
        out.append(item)
    return out, ready


def _uinc(uid, t):
    u = q1("SELECT inc_ts, created FROM users WHERE id=?", uid)
    if not u["inc_ts"]:
        first = q1("SELECT MIN(acq) a FROM gifts WHERE owner=? AND price IS NULL", uid)["a"] or t
        start = min(t, max(LAUNCH, t - GIFT_CAP, first))   # копилка — с первого подарка, не раньше запуска
        with tx():
            db.execute("UPDATE users SET inc_ts=? WHERE id=?", (start, uid))
        return start
    return u["inc_ts"]


@app.get(R + "/income")
def income(uid=Depends(auth)):
    t = now()
    inc_ts = _uinc(uid, t)
    gacc, per_day, exact = _gift_accrual(uid, t, inc_ts)
    biz, bready = _biz_rows(uid, t)
    vault = []
    for v in q("SELECT * FROM vault WHERE user=? ORDER BY until", uid):
        g = q1("SELECT * FROM gifts WHERE id=?", v["gift"])
        if g:
            vault.append({"gift": gift_out(g), "until": v["until"], "start": v["start"], "pct": v["pct"],
                          "reward": int(g["value"] * v["pct"]), "ready": t >= v["until"]})
    return {"now": t, "gifts": {"perDay": int(per_day), "accrued": gacc, "exact": round(exact, 3), "since": inc_ts, "cap": GIFT_CAP,
                                "full": t - inc_ts >= GIFT_CAP},
            "biz": biz, "bizReady": bready, "vault": vault, "vaultPlans": [{"days": d, "pct": p} for d, p in VAULT.items()],
            "ready": gacc + bready}


@app.post(R + "/income/collect")
def income_collect(uid=Depends(auth)):
    t = now()
    with tx():
        inc_ts = q1("SELECT inc_ts FROM users WHERE id=?", uid)["inc_ts"] or t
        gacc, _, _ = _gift_accrual(uid, t, inc_ts)
        _, bready = _biz_rows(uid, t)
        from clans import income_bonus
        gross = int((gacc + bready) * income_bonus(uid))   # бонус уровня клана
        if gross <= 0:
            err("пока нечего забирать")
        tax = int(gross * INCOME_TAX)
        total = gross - tax
        db.execute("UPDATE users SET stars=stars+?, inc_ts=? WHERE id=?", (total, t, uid))
        db.execute("UPDATE biz SET ts=? WHERE user=?", (t, uid))
        event(uid, "income", gross)
        if tax:
            event(uid, "fee", -tax)
    return {"got": total, "gifts": gacc, "biz": bready, "tax": tax, "stars": bal(uid)}


@app.post(R + "/vault/put")
async def vault_put(req: Request, uid=Depends(auth)):
    b = await req.json()
    gids, days = [int(x) for x in b.get("gifts", [])][:10], int(b.get("days", 1))
    if days not in VAULT:
        err("срок: 1, 3 или 7 дней")
    if not gids:
        err("выбери подарки")
    t = now()
    with tx():
        for g in gids:
            x = q1("SELECT owner, price FROM gifts WHERE id=?", g)
            if not x or x["owner"] != uid:
                err("это не твой подарок")
            if x["price"] is not None:
                err("сначала сними подарок с маркета")
        for g in gids:
            db.execute("UPDATE gifts SET owner=? WHERE id=?", (-(VAULT_OWNER + uid), g))
            unpin(uid, g)
            cancel_trades_with(g)
            db.execute("INSERT OR REPLACE INTO vault VALUES(?,?,?,?,?)", (g, uid, t, t + days * 86400, VAULT[days]))
    return {"ok": True, "count": len(gids)}


@app.post(R + "/vault/{gid}/take")
def vault_take(gid: int, uid=Depends(auth)):
    t = now()
    with tx():
        v = q1("SELECT * FROM vault WHERE gift=? AND user=?", gid, uid) or err("этого подарка нет в сейфе")
        g = q1("SELECT value FROM gifts WHERE id=?", gid)
        reward = int(g["value"] * v["pct"]) if t >= v["until"] else 0
        db.execute("UPDATE gifts SET owner=? WHERE id=?", (uid, gid))
        db.execute("DELETE FROM vault WHERE gift=?", (gid,))
        if reward:
            tax = int(reward * INCOME_TAX)
            db.execute("UPDATE users SET stars=stars+? WHERE id=?", (reward - tax, uid))
            event(uid, "stake", reward)
            if tax:
                event(uid, "fee", -tax)
            reward -= tax
    return {"reward": reward, "early": reward == 0, "stars": bal(uid)}


@app.post(R + "/biz/{bid}/buy")
def biz_buy(bid: str, uid=Depends(auth)):
    if bid not in BIZ_MAP:
        err("нет такого бизнеса")
    t = now()
    with tx():
        r = q1("SELECT * FROM biz WHERE user=? AND bid=?", uid, bid)
        if r and r["level"] >= BIZ_MAX:
            err("максимальный уровень")
        cost = biz_upgrade(bid, r["level"]) if r else BIZ_MAP[bid][3]
        if bal(uid) < cost:
            err("Не хватает звёзд")
        if r:   # перед прокачкой забираем накопленное по старой ставке
            acc = int(biz_income(bid, r["level"]) * min(t - r["ts"], BIZ_CAP) / 3600)
            db.execute("UPDATE biz SET level=level+1, ts=? WHERE user=? AND bid=?", (t, uid, bid))
            tax = int(acc * INCOME_TAX)
            db.execute("UPDATE users SET stars=stars-?+? WHERE id=?", (cost, acc - tax, uid))
            if acc:
                event(uid, "income", acc)
            if tax:
                event(uid, "fee", -tax)
        else:
            db.execute("INSERT INTO biz(user,bid,level,ts) VALUES(?,?,?,?)", (uid, bid, 1, t))
            db.execute("UPDATE users SET stars=stars-? WHERE id=?", (cost, uid))
        event(uid, "bizbuy", -cost)
        lvl = add_xp(uid, max(10, cost // 50))
    return {"ok": True, "stars": bal(uid), "levelup": lvl}


@app.post(R + "/biz/{bid}/shift")
async def biz_shift(bid: str, req: Request, uid=Depends(auth)):
    """Смена в бизнесе: награда = доход за час × (тапы / 40), не чаще раза в 2 часа на бизнес."""
    taps = max(0, min(SHIFT_TAPS, int((await req.json()).get("taps", 0))))
    if bid not in BIZ_MAP:
        err("нет такого бизнеса")
    t = now()
    with tx():
        r = q1("SELECT * FROM biz WHERE user=? AND bid=?", uid, bid) or err("сначала купи этот бизнес")
        if (r["shift_ts"] or 0) + SHIFT_EVERY > t:
            err("смена ещё не началась — загляни позже")
        gross = int(biz_income(bid, r["level"]) * taps / SHIFT_TAPS)
        tax = int(gross * INCOME_TAX)
        db.execute("UPDATE biz SET shift_ts=? WHERE user=? AND bid=?", (t, uid, bid))
        if gross:
            db.execute("UPDATE users SET stars=stars+? WHERE id=?", (gross - tax, uid))
            event(uid, "income", gross)
            if tax:
                event(uid, "fee", -tax)
    return {"got": gross - tax, "taps": taps, "full": taps >= SHIFT_TAPS, "stars": bal(uid), "next": t + SHIFT_EVERY}
