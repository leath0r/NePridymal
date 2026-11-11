"""День рождения: игрок один раз указывает день и месяц (менять нельзя — только через админа), в этот день по Москве получает
подарок (ключ от кейса [birthday] case и рамку «Именинник» на сутки), а друзьям бот утром пишет «поздравь».
Защита от тех, кто ставит дату «на завтра»: подарок положен, только если дата указана не позже чем за notice_days до дня рождения,
с уровня level и не чаще раза в календарный год. 29 февраля в невисокосный год празднуется 28-го."""
from settings import conf
import asyncio
import calendar
import time

from fastapi import Depends, Request

import app as A
import economy as E
from app import R, app, auth, db, err, esc, kv_get, notify, now, q, q1, tx

TZ = 3 * 3600
NOTICE = conf("birthday.notice_days", 30) * 86400
LEVEL = conf("birthday.level", 3)
CASE = conf("birthday.case", "lux")
NOTIFY_HOUR = 10          # по Москве
FRAME = "bday"
MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")

for _c in ("bday INTEGER DEFAULT 0", "bday_set INTEGER DEFAULT 0", "bday_year INTEGER DEFAULT 0"):
    try:
        db.execute("ALTER TABLE users ADD COLUMN " + _c)
    except Exception:
        pass
db.executescript("""
CREATE TABLE IF NOT EXISTS bday_wish(src INTEGER, dst INTEGER, year INTEGER, ts INTEGER, PRIMARY KEY(src, dst, year));
CREATE INDEX IF NOT EXISTS bday_wish_dst ON bday_wish(dst, year);
CREATE INDEX IF NOT EXISTS users_bday ON users(bday);
""")


def msk(t=None):
    return time.gmtime((now() if t is None else t) + TZ)


def today_code(g=None):
    """Код сегодняшнего дня ММДД по Москве; 28 февраля в невисокосный год засчитывается и за 29-е."""
    g = g or msk()
    return g.tm_mon * 100 + g.tm_mday


def is_today(code, g=None):
    g = g or msk()
    t = today_code(g)
    return code == t or (code == 229 and t == 228 and not calendar.isleap(g.tm_year))


def bday_start(code, year):
    """Начало дня рождения (по Москве) в указанном году, epoch."""
    m, d = divmod(code, 100)
    if code == 229 and not calendar.isleap(year):
        d = 28
    return calendar.timegm((year, m, d, 0, 0, 0)) - TZ


def fmt_code(code):
    m, d = divmod(code, 100)
    return f"{d} {MONTHS[m - 1]}"


def can_claim(u, g=None):
    """Положен ли подарок сегодня: день рождения, дата указана заранее, уровень, ещё не брал в этом году."""
    g = g or msk()
    if not u["bday"] or not is_today(u["bday"], g):
        return False, "not_today"
    if u["bday_year"] >= g.tm_year:
        return False, "claimed"
    if A.level(u["xp"]) < LEVEL:
        return False, "level"
    if u["bday_set"] + NOTICE > bday_start(u["bday"], g.tm_year):
        return False, "late"
    return True, ""


def me(uid):
    u = q1("SELECT bday, bday_set, bday_year, xp FROM users WHERE id=?", uid)
    if not u or not u["bday"]:
        return {"set": 0, "noticeDays": NOTICE // 86400, "level": LEVEL}
    g = msk()
    ok, why = can_claim(u, g)
    today = is_today(u["bday"], g)
    out = {"set": u["bday"], "date": fmt_code(u["bday"]), "today": today, "canClaim": ok, "why": why, "noticeDays": NOTICE // 86400, "level": LEVEL,
           "case": E.CASES[CASE]["title"] if CASE in E.CASES else ""}
    if today:
        out["wishes"] = q1("SELECT COUNT(*) n FROM bday_wish WHERE dst=? AND year=?", uid, g.tm_year)["n"]
    return out


A.BDAY_ME = me


def profile_extra(uid, tid):
    """В чужом профиле: сегодня ли день рождения и поздравлял ли уже."""
    u = q1("SELECT bday FROM users WHERE id=?", tid)
    if not u or not u["bday"] or not is_today(u["bday"]):
        return {}
    g = msk()
    return {"bdayToday": True, "bdayWished": uid == tid or bool(q1("SELECT 1 FROM bday_wish WHERE src=? AND dst=? AND year=?", uid, tid, g.tm_year))}


A.BDAY_PROFILE = profile_extra


@app.post(R + "/bday")
async def set_bday(req: Request, uid=Depends(auth)):
    b = await req.json()
    try:
        m, d = int(b.get("m", 0)), int(b.get("d", 0))
    except Exception:
        err("Неверная дата")
    if not (1 <= m <= 12 and 1 <= d <= (29 if m == 2 else calendar.monthrange(2024, m)[1])):
        err("Неверная дата")
    with tx():
        u = q1("SELECT bday FROM users WHERE id=?", uid)
        if u["bday"]:
            err("Дата уже указана — изменить её можно только через поддержку")
        db.execute("UPDATE users SET bday=?, bday_set=? WHERE id=?", (m * 100 + d, now(), uid))
    return {"ok": True, "bday": me(uid)}


@app.post(R + "/bday/claim")
def claim(uid=Depends(auth)):
    with tx():
        u = q1("SELECT * FROM users WHERE id=?", uid)
        ok, why = can_claim(u)
        if not ok:
            err({"not_today": "Сегодня не день рождения", "claimed": "Подарок за этот год уже получен",
                 "level": f"Подарок положен с {LEVEL} уровня", "late": f"Дата указана меньше чем за {NOTICE // 86400} дней до дня рождения — подарок будет в следующем году"}[why])
        g = msk()
        t = now()
        db.execute("UPDATE users SET bday_year=? WHERE id=?", (g.tm_year, uid))
        db.execute("INSERT INTO case_keys(user,cid,n) VALUES(?,?,1) ON CONFLICT(user,cid) DO UPDATE SET n=n+1", (uid, CASE))
        import style
        style.grant(uid, FRAME, bday_start(u["bday"], g.tm_year) + 86400)
    return {"ok": True, "key": E.CASES[CASE]["title"], "bday": me(uid)}


@app.post(R + "/bday/wish/{tid}")
def wish(tid: int, uid=Depends(auth)):
    """Поздравить именинника: одно сообщение в год, только друзьям (чтобы чужие аккаунты не спамили)."""
    if tid == uid:
        err("Себя поздравлять не нужно — просто забери подарок")
    u = q1("SELECT id, bday, name, nick FROM users WHERE id=?", tid) or err("нет такого игрока", 404)
    if not u["bday"] or not is_today(u["bday"]):
        err("Сегодня не день рождения")
    if not q1("SELECT 1 FROM friends WHERE ((a=? AND b=?) OR (a=? AND b=?)) AND status='ok'", uid, tid, tid, uid):
        err("Поздравить можно только друга")
    g = msk()
    with tx():
        if q1("SELECT 1 FROM bday_wish WHERE src=? AND dst=? AND year=?", uid, tid, g.tm_year):
            err("Ты уже поздравлял(а) сегодня")
        db.execute("INSERT INTO bday_wish(src,dst,year,ts) VALUES(?,?,?,?)", (uid, tid, g.tm_year, now()))
        me_ = q1("SELECT * FROM users WHERE id=?", uid)
    notify(tid, f"🎂 <b>{esc(A.user_brief(me_)['name'])}</b> поздравляет тебя с днём рождения!")
    return {"ok": True}


# ---------------- админ: сброс даты (игрок указал не ту) ----------------
def _adm(uid=Depends(auth)):
    import admin
    if uid not in admin.ADMINS:
        err("Not Found", 404)
    return uid


@app.post(R + "/admin/user/{tid}/bday/reset")
def admin_reset(tid: int, aid=Depends(_adm)):
    import admin
    with tx():
        u = q1("SELECT bday FROM users WHERE id=?", tid) or err("нет такого игрока", 404)
        db.execute("UPDATE users SET bday=0, bday_set=0 WHERE id=?", (tid,))
        admin.log(aid, "bday_reset", tid, f"сброшена дата рождения ({fmt_code(u['bday']) if u['bday'] else 'не была указана'})")
    return {"ok": True}


# ---------------- утром — именинникам и их друзьям ----------------
def _tick():
    g = msk()
    if g.tm_hour < NOTIFY_HOUR:
        return
    key = f"{g.tm_year}-{g.tm_yday}"
    if kv_get("bday_day", "") == key:
        return
    with tx():
        db.execute("INSERT INTO kv(k,v) VALUES('bday_day',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (key,))
    codes = [today_code(g)] + ([229] if today_code(g) == 228 and not calendar.isleap(g.tm_year) else [])
    msgs = []
    for u in q(f"SELECT * FROM users WHERE bday IN ({','.join('?' * len(codes))}) AND banned=0", *codes):
        if A.level(u["xp"]) < LEVEL:   # твинкам друзей не беспокоим
            continue
        ok, why = can_claim(u, g)
        if u["notif"] if "notif" in u.keys() else True:
            msgs.append((u["id"], "🎂 С днём рождения! " + ("Подарок ждёт в игре — забери его сегодня." if ok else
                         f"Подарок будет в следующем году: дату нужно указать за {NOTICE // 86400} дней." if why == "late" else "Хорошего дня!")))
        name = esc(A.user_brief(u)["name"])
        for f in q("SELECT u.id FROM friends fr JOIN users u ON u.id = CASE WHEN fr.a=? THEN fr.b ELSE fr.a END "
                   "WHERE (fr.a=? OR fr.b=?) AND fr.status='ok' AND u.banned=0 AND COALESCE(u.notif,1)=1", u["id"], u["id"], u["id"]):
            msgs.append((f["id"], f"🎂 У <b>{name}</b> сегодня день рождения — зайди и поздравь!", u["id"]))
    _send(msgs)


def _send(msgs):
    for m in msgs:
        try:
            notify(m[0], m[1], (A.APP_URL + ("&" if "?" in A.APP_URL else "?") + f"bday={m[2]}") if len(m) > 2 else None)
        except Exception as e:
            print("bday notify", e, flush=True)


async def bday_loop():
    await asyncio.sleep(30)
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _tick)
        except Exception as e:
            print("bday:", repr(e), flush=True)
        await asyncio.sleep(300)


@app.on_event("startup")
async def _bday_start():
    asyncio.create_task(bday_loop())
