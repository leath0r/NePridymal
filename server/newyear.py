"""Новый год: адвент-календарь и Тайный Санта. Все даты — по московскому времени.

Адвент (1–31 декабря): каждый день — одна дверца. Открыть можно только сегодняшнюю, с 3-го уровня и только сыграв
сегодня хотя бы раунд (как огоньки: иначе это ферма на твинках). Пропущенные дни сгорают. Открыл все 31 —
рамка «2027» на весь следующий год (style.AWARD, не продаётся).

Тайный Санта: с 1 декабря до 25 декабря 12:00 игрок кладёт в общий мешок один подарок с открыткой. Подарок замораживается
(owner = -(SANTA_OWNER + id записи)): его нельзя продать, подарить или заложить, пока он в мешке; забрать обратно
можно до жеребьёвки. 25 декабря в 12:00 (днём — чтобы сообщения не будили ночью) мешок делится на группы подарков похожей цены (самый дорогой в группе
дороже самого дешёвого не больше чем в SANTA_RATIO раза) и внутри группы подарки идут по кругу: никто не получит
свой. Кому не нашлось пары по цене — подарок возвращается. 31 декабря в 12:00 каждый получает чужой подарок
с открыткой (анонимно), отправитель — сообщение, кому он достался.
Переключатели админа (kv advent / santa = off) только закрывают дверцы и запись: то, что уже лежит в мешке,
всегда разыгрывается или возвращается."""
import asyncio
import calendar
import json
import random
import re
import time

from fastapi import Depends, Request

import app as A
from app import (GAME_KINDS, R, app, auth, cancel_trades_with, conf, db, err, esc, event, gift_out, in_open_trade, kv_get, notify, now,
                 own_gift, prize_k, q, q1, tx, unpin, user_brief)

TZ = 3 * 3600
LEVEL = 3                       # адвент и Санта — с этого уровня (против твинков)
ADV_CASE = "winter"             # ключи из адвента — от кейса «Новогодний»
ADV_KEYS = {7: 1, 14: 1, 21: 1, 28: 1, 31: 2}
SANTA_OWNER = 4 * 10 ** 10      # ниже всех других заморозок: ссылки-подарки — -(3e10 + id)
SANTA_RATIO = 1.5
SANTA_GROUP = 4                 # обычный размер группы; до 5 — чтобы никто не остался один
TEXT_MAX = 120
NO_LINKS = re.compile(r"https?://|www\.|t\.me|telegram\.(me|dog)|@[a-z0-9_]{4,}", re.I)

db.executescript("""
CREATE TABLE IF NOT EXISTS advent(user INTEGER, year INTEGER, day INTEGER, stars INTEGER, keys INTEGER, ts INTEGER,
  PRIMARY KEY(user, year, day));
CREATE TABLE IF NOT EXISTS santa(id INTEGER PRIMARY KEY, year INTEGER, user INTEGER, gift INTEGER, value INTEGER, snap TEXT, text TEXT,
  ts INTEGER, status TEXT DEFAULT 'in', grp INTEGER DEFAULT 0, dst INTEGER DEFAULT 0, done INTEGER DEFAULT 0, seen INTEGER DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS santa_one ON santa(year, user) WHERE status IN ('in','packed');
CREATE INDEX IF NOT EXISTS santa_user ON santa(user, year);
CREATE INDEX IF NOT EXISTS santa_dst ON santa(dst, year);
CREATE INDEX IF NOT EXISTS santa_status ON santa(status, year);
""")


# ---------------- время по Москве ----------------
def msk(t=None):
    return time.gmtime((now() if t is None else t) + TZ)


def msk_ts(y, m, d, hh=0):
    """Unix-время начала часа hh дня y-m-d по Москве."""
    return calendar.timegm((y, m, d, hh, 0, 0)) - TZ


def day_start_ts(t=None):
    t = (now() if t is None else t) + TZ
    return t - t % 86400 - TZ


def season_on(t=None):
    """Новогодний сезон для главной: весь декабрь и 1–15 января."""
    m = msk(t)
    return m.tm_mon == 12 or (m.tm_mon == 1 and m.tm_mday <= 15)


def _level(uid):
    return A.level(q1("SELECT xp FROM users WHERE id=?", uid)["xp"])


# ---------------- рамка за адвент: «2027» за декабрь 2026 и т. д. ----------------
def frame_id(y):
    return f"ny{(y + 1) % 100:02d}"


def _register_frames():
    import style
    for y in range(2026, msk().tm_year + 1):
        fid = frame_id(y)
        style.ITEMS.setdefault(fid, ("frame", str(y + 1), 0))
        style.AWARD.setdefault(fid, f"Рамку «{y + 1}» дают за все 31 дверцу адвент-календаря")


_register_frames()


# ============================== адвент-календарь ==============================
def adv_today():
    """(год, день декабря) — или (None, None): не декабрь или админ выключил."""
    m = msk()
    if m.tm_mon != 12 or kv_get("advent", "on") == "off":
        return None, None
    return m.tm_year, m.tm_mday


def adv_reward(d):
    """Звёзды (с курсом банка и общим множителем наград, как у заданий) и ключи за дверцу дня d."""
    return max(1, int(prize_k(300 + 15 * d) * conf("economy.reward_scale", 1.0))), ADV_KEYS.get(d, 0)


def played_today(uid):
    return bool(q1(f"SELECT 1 FROM events WHERE user=? AND kind IN {GAME_KINDS} AND ts>=? LIMIT 1", uid, day_start_ts()))


def adv_state(uid):
    y, d = adv_today()
    if not y:
        return None
    rows = {r["day"]: r for r in q("SELECT day, stars, keys FROM advent WHERE user=? AND year=?", uid, y)}
    doors = []
    for i in range(1, 32):
        st, kk = adv_reward(i)
        r = rows.get(i)
        doors.append({"d": i, "s": "open" if r else "today" if i == d else "missed" if i < d else "locked",
                      "stars": r["stars"] if r else st, "keys": r["keys"] if r else kk})
    missed = [i for i in range(1, d) if i not in rows]
    fid = frame_id(y)
    got = q1("SELECT until FROM cosm WHERE user=? AND item=? AND until>?", uid, fid, now())
    return {"year": y, "day": d, "doors": doors, "opened": len(rows), "today": d in rows, "missed": len(missed),
            "frame": {"id": fid, "title": str(y + 1), "got": bool(got), "possible": not missed},
            "level": LEVEL, "levelOk": _level(uid) >= LEVEL, "played": played_today(uid), "case": ADV_CASE,
            "endsIn": day_start_ts() + 86400 - now()}


@app.get(R + "/advent")
def advent_get(uid=Depends(auth)):
    return {"advent": adv_state(uid)}


@app.post(R + "/advent/open")
def advent_open(uid=Depends(auth)):
    y, d = adv_today()
    if not y:
        err("Адвент-календарь работает с 1 по 31 декабря")
    frame = False
    with tx():
        if _level(uid) < LEVEL:
            err(f"Адвент-календарь открывается с {LEVEL} уровня")
        if q1("SELECT 1 FROM advent WHERE user=? AND year=? AND day=?", uid, y, d):
            err("Сегодняшняя дверца уже открыта — следующая завтра")
        if not played_today(uid):
            err("Сначала сыграй сегодня хотя бы один раунд — потом открывай дверцу")
        stars, keys = adv_reward(d)
        db.execute("INSERT INTO advent(user,year,day,stars,keys,ts) VALUES(?,?,?,?,?,?)", (uid, y, d, stars, keys, now()))
        db.execute("UPDATE users SET stars=stars+? WHERE id=?", (stars, uid))
        event(uid, "advent", stars)
        if keys:
            db.execute("INSERT INTO case_keys(user,cid,n) VALUES(?,?,?) ON CONFLICT(user,cid) DO UPDATE SET n=n+?", (uid, ADV_CASE, keys, keys))
        if d == 31 and q1("SELECT COUNT(*) n FROM advent WHERE user=? AND year=?", uid, y)["n"] >= 31:
            import style
            style.grant(uid, frame_id(y), msk_ts(y + 2, 1, 1))   # «2027» — весь 2027 год
            frame = True
        bal = q1("SELECT stars FROM users WHERE id=?", uid)["stars"]
    return {"day": d, "stars": stars, "keys": keys, "case": ADV_CASE, "frame": frame, "balance": bal, "advent": adv_state(uid)}


# ============================== Тайный Санта ==============================
def santa_times(y):
    return {"open": msk_ts(y, 12, 1), "shuffle": msk_ts(y, 12, 25, 12), "deliver": msk_ts(y, 12, 31, 12), "close": msk_ts(y + 1, 1, 16)}


def santa_year(t=None):
    """Год текущего Санты: в декабре — этот, в январе — прошлый (показываем итог до 15-го)."""
    m = msk(t)
    return m.tm_year if m.tm_mon == 12 else m.tm_year - 1 if m.tm_mon == 1 else None


def santa_phase(y, t=None):
    t = now() if t is None else t
    T = santa_times(y)
    if t < T["open"] or t >= T["close"]:
        return None
    return "join" if t < T["shuffle"] else "packed" if t < T["deliver"] else "sent"


def _esc_owner(r):
    return -(SANTA_OWNER + r["id"])


def _snap(r):
    try:
        return json.loads(r["snap"] or "null")
    except Exception:
        return None


def santa_state(uid):
    y = santa_year()
    ph = santa_phase(y) if y else None
    if not ph:
        return None
    T = santa_times(y)
    out = {"year": y, "phase": ph, "shuffle": T["shuffle"], "deliver": T["deliver"], "level": LEVEL, "ratio": SANTA_RATIO,
           "textMax": TEXT_MAX, "joinOn": ph == "join" and kv_get("santa", "on") != "off",
           "count": q1("SELECT COUNT(*) n FROM santa WHERE year=? AND status IN ('in','packed','sent')", y)["n"]}
    mine = q1("SELECT * FROM santa WHERE year=? AND user=? AND status!='cancelled' ORDER BY id DESC LIMIT 1", y, uid)
    if mine:
        m = {"status": mine["status"], "text": mine["text"], "gift": _snap(mine)}
        if mine["status"] in ("packed", "sent") and mine["grp"]:
            m["group"] = q1("SELECT COUNT(*) n FROM santa WHERE year=? AND grp=?", y, mine["grp"])["n"]
        if mine["status"] == "sent":
            d = q1("SELECT * FROM users WHERE id=?", mine["dst"])
            m["to"] = user_brief(d) if d else None
        out["mine"] = m
    got = q1("SELECT * FROM santa WHERE year=? AND dst=? AND status='sent' ORDER BY id DESC LIMIT 1", y, uid)
    if got:
        out["got"] = {"gift": _snap(got), "text": got["text"], "seen": bool(got["seen"])}
    return out


@app.get(R + "/santa")
def santa_get(uid=Depends(auth)):
    return {"santa": santa_state(uid)}


@app.post(R + "/santa/join")
async def santa_join(req: Request, uid=Depends(auth)):
    try:
        b = await req.json()
    except Exception:
        b = None
    b = b if isinstance(b, dict) else {}
    try:
        gid = int(b.get("gift") or 0)
    except (TypeError, ValueError):
        gid = 0
    if not gid:
        err("Выбери подарок для мешка")
    text = " ".join(str(b.get("text") or "").split())[:TEXT_MAX]
    if NO_LINKS.search(text):
        err("В открытке не должно быть ссылок и @юзернеймов — Санта тайный")
    import loans
    import sanctions
    with tx():
        y = santa_year()
        if not y or santa_phase(y) != "join" or kv_get("santa", "on") == "off":
            err("Запись в Тайного Санту закрыта")
        if sanctions.is_frozen(uid):
            err(sanctions.FROZEN_MSG, 403)
        if _level(uid) < LEVEL:
            err(f"Тайный Санта — с {LEVEL} уровня")
        if q1("SELECT 1 FROM santa WHERE year=? AND user=? AND status IN ('in','packed')", y, uid):
            err("Твой подарок уже в мешке")
        g = own_gift(gid, uid)
        if g["price"] is not None:
            err("Сначала сними подарок с маркета")
        if in_open_trade(gid):
            err("Подарок участвует в обмене")
        if loans.stars_locked(uid):
            err("Пока не закрыт кредит без залога, дарить нельзя")
        cur = db.execute("INSERT INTO santa(year,user,gift,value,snap,text,ts) VALUES(?,?,?,?,?,?,?)",
                         (y, uid, gid, g["value"], json.dumps(gift_out(g), ensure_ascii=False), text, now()))
        db.execute("UPDATE gifts SET owner=? WHERE id=? AND owner=?", (-(SANTA_OWNER + cur.lastrowid), gid, uid))
        unpin(uid, gid)
        cancel_trades_with(gid)
        event(uid, "santa", 0)
    return {"ok": True, "santa": santa_state(uid)}


@app.post(R + "/santa/cancel")
def santa_cancel(uid=Depends(auth)):
    with tx():
        y = santa_year()
        r = q1("SELECT * FROM santa WHERE year=? AND user=? AND status='in'", y, uid) if y else None
        if not r:
            err("В мешке нет твоего подарка")
        if santa_phase(y) != "join":
            err("Подарки уже упакованы — забрать нельзя")
        db.execute("UPDATE gifts SET owner=? WHERE id=? AND owner=?", (uid, r["gift"], _esc_owner(r)))
        db.execute("UPDATE santa SET status='cancelled', done=? WHERE id=?", (now(), r["id"]))
    return {"ok": True, "santa": santa_state(uid)}


@app.post(R + "/santa/seen")
def santa_seen(uid=Depends(auth)):
    y = santa_year()
    if y:
        with tx():
            db.execute("UPDATE santa SET seen=1 WHERE year=? AND dst=? AND status='sent'", (y, uid))
    return {"ok": True}


def santa_groups(rows):
    """Делим мешок: группы подарков похожей цены (по возрастанию) и одиночки, которым не нашлось пары.
    В группе самый дорогой дороже самого дешёвого не больше чем в SANTA_RATIO раза."""
    groups = []
    for r in sorted(rows, key=lambda r: (r["value"], r["id"])):
        g = groups[-1] if groups else None
        if g and len(g) < SANTA_GROUP and r["value"] <= g[0]["value"] * SANTA_RATIO:
            g.append(r)
        else:
            groups.append([r])
    out, alone = [], []
    for i, g in enumerate(groups):
        if len(g) >= 2:
            out.append(g)
            continue
        r = g[0]
        prev = out[-1] if out and out[-1] is groups[i - 1] else None
        nxt = groups[i + 1] if i + 1 < len(groups) and len(groups[i + 1]) >= 2 else None
        if prev and len(prev) <= SANTA_GROUP and r["value"] <= prev[0]["value"] * SANTA_RATIO:
            prev.append(r)
        elif nxt and len(nxt) <= SANTA_GROUP and nxt[-1]["value"] <= r["value"] * SANTA_RATIO:
            nxt.insert(0, r)
        else:
            alone.append(r)
    return out, alone


def _santa_return(r, status="refund"):
    db.execute("UPDATE gifts SET owner=? WHERE id=? AND owner=?", (r["user"], r["gift"], _esc_owner(r)))
    db.execute("UPDATE santa SET status=?, done=? WHERE id=?", (status, now(), r["id"]))


def _gift_ok(r):
    return bool(q1("SELECT 1 FROM gifts WHERE id=? AND owner=?", r["gift"], _esc_owner(r)))


def santa_shuffle(y):
    """25 декабря, 12:00: жеребьёвка. Повторный вызов ничего не делает (берёт только записи 'in'). Сообщения — после транзакции."""
    import sanctions
    msgs = []
    with tx():
        rows = q("SELECT * FROM santa WHERE year=? AND status='in'", y)
        if not rows:
            return msgs
        ok = []
        for r in rows:
            if not _gift_ok(r):   # подарок исчез (вайп и т. п.) — дарить нечего
                db.execute("UPDATE santa SET status='lost', done=? WHERE id=?", (now(), r["id"]))
                continue
            u = q1("SELECT banned FROM users WHERE id=?", r["user"])
            if not u or u["banned"] or sanctions.is_frozen(r["user"]):
                _santa_return(r)
                if u and not u["banned"]:
                    msgs.append((r["user"], "Тайный Санта: пока кошелёк заморожен, участвовать нельзя — подарок вернулся в сумку."))
                continue
            ok.append(r)
        groups, alone = santa_groups(ok)
        base = q1("SELECT COALESCE(MAX(grp),0) m FROM santa WHERE year=?", y)["m"]
        rnd = random.SystemRandom()
        for gi, g in enumerate(groups, base + 1):
            g = list(g)
            rnd.shuffle(g)
            for i, r in enumerate(g):
                db.execute("UPDATE santa SET status='packed', grp=?, dst=? WHERE id=? AND status='in'", (gi, g[(i + 1) % len(g)]["user"], r["id"]))
                msgs.append((r["user"], "Тайный Санта: мешок собран, подарки упакованы. 31 декабря в 12:00 по Москве тебя будет ждать "
                                        "подарок от другого игрока — а твой уйдёт кому-то из твоей группы."))
        for r in alone:
            _santa_return(r)
            msgs.append((r["user"], "Тайный Санта: для твоего подарка не нашлось пары похожей цены — он вернулся в сумку. Спасибо за участие!"))
    return msgs


def santa_deliver(y):
    """31 декабря, 12:00: каждому — чужой подарок с открыткой. Повторный вызов ничего не делает."""
    msgs = []
    with tx():
        for r in q("SELECT * FROM santa WHERE year=? AND status='packed' ORDER BY id", y):
            if not _gift_ok(r):
                db.execute("UPDATE santa SET status='lost', done=? WHERE id=?", (now(), r["id"]))
                continue
            d = q1("SELECT id, name, banned FROM users WHERE id=?", r["dst"])
            if not d or d["banned"]:   # получатель недоступен — подарок возвращается отправителю
                _santa_return(r)
                msgs.append((r["user"], "Тайный Санта: получатель твоего подарка недоступен — подарок вернулся в сумку."))
                continue
            db.execute("UPDATE gifts SET owner=? WHERE id=? AND owner=?", (r["dst"], r["gift"], _esc_owner(r)))
            db.execute("UPDATE santa SET status='sent', done=? WHERE id=?", (now(), r["id"]))
            event(r["dst"], "santa", 0)
            g = _snap(r) or {}
            msgs.append((r["dst"], f"Тайный Санта принёс тебе подарок: <b>{esc(g.get('col', 'подарок'))}</b>"
                                   + (f" «{esc(g['model'])}»" if g.get("model") else "")
                                   + (f"\n\nОткрытка: <i>«{esc(r['text'])}»</i>" if r["text"] else "") + "\n\nС наступающим Новым годом!"))
            msgs.append((r["user"], f"Тайный Санта: твой подарок достался <b>{esc(d['name'])}</b>. С наступающим!"))
    return msgs


def _send(msgs):
    for uid, text in msgs:
        notify(uid, text)
        time.sleep(0.06)   # лимит Telegram ~30 сообщений/с


def _remind_advent():
    """Вечером (19–22 по Москве) — тем, кто открыл вчерашнюю дверцу, а сегодняшнюю ещё нет. Раз в день, только с напоминаниями."""
    y, d = adv_today()
    m = msk()
    if not y or d < 2 or not 19 <= m.tm_hour < 22 or kv_get("adv_rem", "") == f"{y}-{d}":
        return
    with tx():
        db.execute("INSERT INTO kv(k,v) VALUES('adv_rem',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (f"{y}-{d}",))
    rows = q("""SELECT a.user, (SELECT COUNT(*) FROM advent c WHERE c.user=a.user AND c.year=a.year) n FROM advent a JOIN users u ON u.id=a.user
                WHERE a.year=? AND a.day=? AND u.notif=1 AND u.banned=0
                  AND NOT EXISTS (SELECT 1 FROM advent b WHERE b.user=a.user AND b.year=a.year AND b.day=?)""", y, d - 1, d)
    _send([(r["user"], "Адвент-календарь: сегодняшняя дверца ещё закрыта. Сыграй раунд и открой её до полуночи — иначе день сгорит"
                       + (f" и рамка «{y + 1}» станет недоступна." if r["n"] >= d - 1 else "."))
           for r in rows])


def _tick():
    t = now()
    for r in q("SELECT DISTINCT year FROM santa WHERE status IN ('in','packed')"):
        y = r["year"]
        T = santa_times(y)
        if t >= T["shuffle"]:
            _send(santa_shuffle(y))
        if t >= T["deliver"]:
            _send(santa_deliver(y))
    _remind_advent()


async def newyear_loop():
    await asyncio.sleep(20)
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _tick)
        except Exception as e:
            print("newyear:", repr(e), flush=True)
        await asyncio.sleep(60)


@app.on_event("startup")
async def _newyear_start():
    asyncio.create_task(newyear_loop())


# ---------------- коротко для /me: что показать на главной ----------------
def ny_me(uid):
    if not season_on():
        return None
    out = {}
    y, d = adv_today()
    if y:
        r = q1("SELECT COUNT(*) n, COALESCE(MAX(day=?),0) t FROM advent WHERE user=? AND year=?", d, uid, y)
        out["adv"] = {"day": d, "today": bool(r["t"]), "n": r["n"], "year": y, "level": LEVEL}
    sy = santa_year()
    ph = santa_phase(sy) if sy else None
    if ph:
        mine = q1("SELECT status FROM santa WHERE year=? AND user=? AND status IN ('in','packed','sent') LIMIT 1", sy, uid)
        got = q1("SELECT seen FROM santa WHERE year=? AND dst=? AND status='sent' LIMIT 1", sy, uid)
        out["santa"] = {"phase": ph, "in": bool(mine), "joinOn": ph == "join" and kv_get("santa", "on") != "off",
                        "gift": bool(got and not got["seen"])}
    if RECAP_ON:
        rc = RECAP_ON(uid)
        if rc:
            out["recap"] = rc
    return out or None


RECAP_ON = None   # recap.py: итоги года доступны этому игроку → {"year": ...}
A.NY_ME = ny_me
