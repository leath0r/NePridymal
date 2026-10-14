"""Реферальная программа: награды за друзей, которые реально играют, рубежи, доля с покупок, недельный топ.

Все числа — в админке («Рефералы»), kv 'refcfg'; settings.toml [start] ref_bonus — только значение по умолчанию.
- при регистрации по ссылке: другу new_bonus, пригласившему join_bonus;
- друг дорос до l1_level / l2_level — пригласившему l1_bonus / l2_bonus (только друзьям, пришедшим после запуска
  программы: иначе разом выплатили бы ~250 000 ⭐ за старых);
- рубежи по числу «активных» друзей (дошли до l1_level): «3:2000,10:7500,…» — считаются все друзья, и старые;
- доля с покупок: друг купил игровые звёзды за Telegram Stars — пригласившему buy_pct % (настоящие деньги — не накрутить);
- недельный топ: кто привёл больше активных друзей за неделю (по выплатам l1) — призы top_prizes, минимум top_min друзей.
Экономика: награды за друга растут с его уровнем, а не с оборотом ставок — правило «меньше 1% от оборота» не задето.
"""
import asyncio
import json
import re

from fastapi import Depends, Request

from settings import conf
import app as A
from app import R, app, auth, db, err, esc, event, notify, now, q, q1, tx, user_brief, week_start
from admin import OWNERS, admin, log

DEFAULTS = {
    "on": True,
    "new_bonus": conf("start.ref_bonus", 2500),   # ⭐ другу при регистрации по ссылке
    "join_bonus": 1000,                            # ⭐ пригласившему сразу
    "l1_level": 3, "l1_bonus": 1500,               # друг дорос до уровня — пригласившему
    "l2_level": 5, "l2_bonus": 2500,
    "milestones": "3:2000,10:7500,25:20000,50:50000",   # активных друзей : ⭐
    "buy_pct": 10,                                  # % от игровых звёзд, купленных другом за Telegram Stars
    "top_on": True, "top_prizes": "15000,7500,3000", "top_min": 3,
}
LIMITS = {"new_bonus": (0, 100000), "join_bonus": (0, 100000), "l1_level": (2, 50), "l1_bonus": (0, 100000),
          "l2_level": (2, 100), "l2_bonus": (0, 200000), "buy_pct": (0, 50), "top_min": (1, 100)}
CFG = {}
try:
    CFG.update({k: v for k, v in json.loads(A.kv_get("refcfg", "{}")).items() if k in DEFAULTS})
except Exception:
    pass


def cfg(k):
    return CFG.get(k, DEFAULTS[k])


def _pairs(s):
    out = []
    for p in str(s).replace(" ", "").split(","):
        if ":" in p:
            a, b = p.split(":", 1)
            out.append((int(a), int(b)))
    return sorted(out)


def _prizes(s):
    return [int(x) for x in str(s).replace(" ", "").split(",") if x]


def xp_for(L):
    return 100 * (L - 1) ** 2   # app.level(): L = √(xp/100) + 1


db.executescript("""
CREATE TABLE IF NOT EXISTS ref_pay(friend INTEGER, stage TEXT, ref INTEGER, amount INTEGER, ts INTEGER, PRIMARY KEY(friend, stage));
CREATE INDEX IF NOT EXISTS ref_pay_ref ON ref_pay(ref, stage, ts);
CREATE TABLE IF NOT EXISTS ref_ms(user INTEGER, cnt INTEGER, amount INTEGER, ts INTEGER, PRIMARY KEY(user, cnt));
CREATE TABLE IF NOT EXISTS ref_top(week INTEGER, place INTEGER, user INTEGER, n INTEGER, amount INTEGER, PRIMARY KEY(week, place));
""")
db.execute("CREATE INDEX IF NOT EXISTS users_ref_by ON users(ref_by) WHERE ref_by IS NOT NULL")
LAUNCH = int(A.kv_get("ref_v2", 0) or 0)
if not LAUNCH:   # запуск программы: награды за уровни друзей — только за пришедших после
    LAUNCH = now()
    db.execute("INSERT OR REPLACE INTO kv(k,v) VALUES('ref_v2',?)", (str(LAUNCH),))


# ============================== регистрация (из app.register, внутри его транзакции) ==============================
def bonuses(has_ref):
    """(другу, пригласившему) при регистрации."""
    if not (has_ref and cfg("on")):
        return 0, 0
    return cfg("new_bonus"), cfg("join_bonus")


# ============================== выплаты ==============================
def _active_count(ref):
    return q1("SELECT COUNT(*) n FROM users WHERE ref_by=? AND xp>=? AND banned=0", ref, xp_for(cfg("l1_level")))["n"]


def _pay(uid, amount, kind, text):
    db.execute("UPDATE users SET stars=stars+? WHERE id=?", (amount, uid))
    event(uid, kind, amount)
    return (uid, text)


def _levels():
    """Друг дорос до l1/l2 — пригласившему бонус (друзья после запуска, один раз на этап)."""
    msgs = []
    for stage, L, bonus in (("l1", cfg("l1_level"), cfg("l1_bonus")), ("l2", cfg("l2_level"), cfg("l2_bonus"))):
        rows = q("SELECT u.id, u.name, u.ref_by FROM users u JOIN users r ON r.id=u.ref_by AND r.banned=0 "
                 "WHERE u.ref_by IS NOT NULL AND u.created>=? AND u.xp>=? AND u.banned=0 "
                 "AND NOT EXISTS (SELECT 1 FROM ref_pay p WHERE p.friend=u.id AND p.stage=?) LIMIT 500", LAUNCH, xp_for(L), stage)
        for f in rows:
            with tx():
                if q1("SELECT 1 FROM ref_pay WHERE friend=? AND stage=?", f["id"], stage):
                    continue
                db.execute("INSERT INTO ref_pay(friend,stage,ref,amount,ts) VALUES(?,?,?,?,?)", (f["id"], stage, f["ref_by"], bonus, now()))
                if bonus:
                    msgs.append(_pay(f["ref_by"], bonus, "ref_lvl", f"🎯 Твой друг <b>{esc(f['name'])}</b> дошёл до {L} уровня — тебе +{bonus:,} ⭐".replace(",", " ")))
    return msgs


def _milestones():
    """Рубежи по числу активных друзей — каждый один раз."""
    msgs = []
    ms = _pairs(cfg("milestones"))
    if not ms:
        return msgs
    for r in q("SELECT ref_by r, COUNT(*) n FROM users WHERE ref_by IS NOT NULL AND xp>=? AND banned=0 GROUP BY ref_by HAVING n>=?",
               xp_for(cfg("l1_level")), ms[0][0]):
        for cnt, amount in ms:
            if r["n"] < cnt:
                break
            with tx():
                if q1("SELECT 1 FROM ref_ms WHERE user=? AND cnt=?", r["r"], cnt) or not q1("SELECT 1 FROM users WHERE id=? AND banned=0", r["r"]):
                    continue
                db.execute("INSERT INTO ref_ms(user,cnt,amount,ts) VALUES(?,?,?,?)", (r["r"], cnt, amount, now()))
                msgs.append(_pay(r["r"], amount, "ref_ms", f"🏅 У тебя {cnt} активных друзей в игре — награда <b>+{amount:,} ⭐</b>".replace(",", " ")))
    return msgs


def _week_top(ws):
    """Активные друзья за неделю [ws, ws+7д): кому за неделю выплачен l1."""
    return q("SELECT ref, COUNT(*) n, MAX(ts) last FROM ref_pay WHERE stage='l1' AND ts>=? AND ts<? GROUP BY ref "
             "ORDER BY n DESC, last ASC LIMIT 20", ws, ws + 7 * 86400)


def _top_payout():
    """Понедельник: призы за прошлую неделю (один раз — по ref_top)."""
    if not cfg("top_on"):
        return []
    prev = week_start() - 7 * 86400
    if q1("SELECT 1 FROM ref_top WHERE week=?", prev) or prev < LAUNCH - 7 * 86400:
        return []
    msgs = []
    with tx():
        if q1("SELECT 1 FROM ref_top WHERE week=?", prev):
            return []
        place = 0
        for r in _week_top(prev):
            if place >= len(_prizes(cfg("top_prizes"))) or r["n"] < cfg("top_min"):
                break
            if not q1("SELECT 1 FROM users WHERE id=? AND banned=0", r["ref"]):
                continue
            amount = _prizes(cfg("top_prizes"))[place]
            place += 1
            db.execute("INSERT INTO ref_top(week,place,user,n,amount) VALUES(?,?,?,?,?)", (prev, place, r["ref"], r["n"], amount))
            msgs.append(_pay(r["ref"], amount, "ref_top", f"🏆 {place} место в недельном топе приглашений ({r['n']} активных друзей) — <b>+{amount:,} ⭐</b>".replace(",", " ")))
        if not place:   # пометка «неделя закрыта», даже если никто не прошёл порог
            db.execute("INSERT INTO ref_top(week,place,user,n,amount) VALUES(?,0,0,0,0)", (prev,))
    return msgs


def _tick():
    if not cfg("on"):
        return
    for uid, text in _levels() + _milestones() + _top_payout():
        notify(uid, text)


async def ref_loop():
    await asyncio.sleep(45)
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _tick)
        except Exception as e:
            print("refs", e, flush=True)
        await asyncio.sleep(300)


def on_buy(uid, stars):
    """Из shop.on_paid: друг купил игровые звёзды за Telegram Stars — пригласившему buy_pct %."""
    if not (cfg("on") and cfg("buy_pct")):
        return
    u = q1("SELECT ref_by, name FROM users WHERE id=?", uid)
    if not (u and u["ref_by"]):
        return
    amount = int(stars * cfg("buy_pct") / 100)
    if amount <= 0:
        return
    with tx():
        if not q1("SELECT 1 FROM users WHERE id=? AND banned=0", u["ref_by"]):
            return
        _pay(u["ref_by"], amount, "ref_buy", "")
    notify(u["ref_by"], f"💎 Твой друг <b>{esc(u['name'])}</b> пополнил баланс — тебе {cfg('buy_pct')}%: <b>+{amount:,} ⭐</b>".replace(",", " "))


# ============================== игроку ==============================
def summary(uid):
    """Для /me и /ref: что даёт программа."""
    return {"on": cfg("on"), "new": cfg("new_bonus"), "join": cfg("join_bonus"), "l1": [cfg("l1_level"), cfg("l1_bonus")],
            "l2": [cfg("l2_level"), cfg("l2_bonus")], "buyPct": cfg("buy_pct")}


@app.get(R + "/refs")
def my_refs(uid=Depends(auth)):
    u = q1("SELECT refs FROM users WHERE id=?", uid)
    active = _active_count(uid)
    earned = q1("SELECT COALESCE(SUM(delta),0) s FROM events WHERE user=? AND kind IN ('ref','ref_lvl','ref_ms','ref_buy','ref_top')", uid)["s"]
    ms = _pairs(cfg("milestones"))
    got = {r["cnt"] for r in q("SELECT cnt FROM ref_ms WHERE user=?", uid)}
    friends = [{**user_brief(f), "lv": A.level(f["xp"]), "ts": f["created"]}
               for f in q("SELECT * FROM users WHERE ref_by=? ORDER BY created DESC LIMIT 50", uid)]
    ws = week_start()
    top = []
    if cfg("top_on"):
        for r in _week_top(ws)[:10]:
            b = q1("SELECT * FROM users WHERE id=?", r["ref"])
            if b:
                top.append({**user_brief(b), "n": r["n"]})
    mine = q1("SELECT COUNT(*) n FROM ref_pay WHERE stage='l1' AND ref=? AND ts>=?", uid, ws)["n"]
    return {**summary(uid), "invited": u["refs"], "active": active, "earned": earned,
            "milestones": [{"n": c, "amount": a, "done": c in got} for c, a in ms],
            "friends": friends, "top": top, "topOn": cfg("top_on"), "prizes": _prizes(cfg("top_prizes")), "topMin": cfg("top_min"),
            "myWeek": mine, "weekEnds": ws + 7 * 86400, "link": f"https://t.me/{A.bot_name()}?start=ref_{uid}"}


# ============================== админка ==============================
@app.get(R + "/admin/refs")
def admin_refs(aid=Depends(admin)):
    t = now()
    w = t - 7 * 86400
    st = {"new7": q1("SELECT COUNT(*) n FROM users WHERE ref_by IS NOT NULL AND created>=?", w)["n"],
          "all": q1("SELECT COUNT(*) n FROM users WHERE ref_by IS NOT NULL")["n"],
          "users": q1("SELECT COUNT(*) n FROM users")["n"],
          "active": q1("SELECT COUNT(*) n FROM users WHERE ref_by IS NOT NULL AND xp>=?", xp_for(cfg("l1_level")))["n"],
          "paid7": {r["kind"]: r["s"] for r in q("SELECT kind, SUM(delta) s FROM events WHERE kind IN ('ref','ref_lvl','ref_ms','ref_buy','ref_top') AND ts>=? GROUP BY kind", w)}}
    top = []
    for r in q("SELECT ref_by r, COUNT(*) n, SUM(xp>=?) a FROM users WHERE ref_by IS NOT NULL AND created>=? GROUP BY ref_by ORDER BY n DESC LIMIT 10",
               xp_for(cfg("l1_level")), w):
        b = q1("SELECT * FROM users WHERE id=?", r["r"])
        if b:
            top.append({**user_brief(b), "n": r["n"], "a": r["a"]})
    return {"cfg": {k: cfg(k) for k in DEFAULTS}, "defaults": DEFAULTS, "changed": list(CFG), "canEdit": aid in OWNERS, "stats": st, "top": top}


@app.post(R + "/admin/refs")
async def admin_refs_set(req: Request, aid=Depends(admin)):
    if aid not in OWNERS:
        err("Менять рефералку может только владелец")
    body = await req.json()
    if not isinstance(body, dict):
        err("неверные данные")
    cur = dict(CFG)
    for k, v in body.items():
        if k not in DEFAULTS:
            continue
        if v is None:
            cur.pop(k, None)
        elif isinstance(DEFAULTS[k], bool):
            cur[k] = v in (True, 1, "1", "true")
        elif k == "milestones":
            parts = [x for x in str(v).replace(" ", "").split(",") if x]   # пусто — без рубежей
            if any(not re.fullmatch(r"\d+:\d+", x) for x in parts):
                err("формат: 3:2000,10:7500 (друзей:звёзд)")
            ps = _pairs(v)
            if len(ps) > 10 or any(not (1 <= a <= 10000 and 0 <= b <= 1_000_000) for a, b in ps):
                err("до 10 рубежей, друзей 1–10000, звёзд до 1 000 000")
            cur[k] = ",".join(f"{a}:{b}" for a, b in ps)
        elif k == "top_prizes":
            if any(not x.isdigit() for x in str(v).replace(" ", "").split(",") if x):
                err("формат: 15000,7500,3000")
            ps = _prizes(v)
            if len(ps) > 10 or any(not 0 <= p <= 1_000_000 for p in ps):
                err("до 10 призов, до 1 000 000 ⭐")
            cur[k] = ",".join(map(str, ps))
        else:
            try:
                v = int(v)
            except (TypeError, ValueError):
                err("введи целое число")
            lo, hi = LIMITS[k]
            if not lo <= v <= hi:
                err(f"от {lo} до {hi}")
            cur[k] = v
    if cur.get("l2_level", DEFAULTS["l2_level"]) <= cur.get("l1_level", DEFAULTS["l1_level"]):
        err("второй уровень должен быть выше первого")
    with tx():
        db.execute("INSERT INTO kv(k,v) VALUES('refcfg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (json.dumps(cur),))
        log(aid, "refcfg", None, ", ".join(f"{k}={cur.get(k, DEFAULTS[k])}" for k in DEFAULTS))
    CFG.clear()
    CFG.update(cur)
    return {"ok": True, "cfg": {k: cfg(k) for k in DEFAULTS}}


@app.on_event("startup")
async def _start():
    if not A.DEV:
        asyncio.create_task(ref_loop())
