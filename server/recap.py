"""Итоги года (как Spotify Wrapped): с 25 декабря по 15 января — личные карточки за год и сторис с реферальной ссылкой.
Всё считается из журнала events (он не чистится) за календарный год по Москве. Сравнение со всеми игроками —
тяжёлый запрос, его считает фоновый цикл раз в 6 часов отдельным соединением; запросы игроков только читают готовое.
Бот один раз (25 декабря днём) пишет игрокам с напоминаниями, у которых за год от NOTIFY_MIN раундов.
Админы видят свои итоги в любой день — чтобы проверить заранее."""
import asyncio
import bisect
import calendar
import io
import json
import os
import re
import secrets
import time

from fastapi import Depends, Request
from fastapi.responses import Response

import app as A
from app import GAME_KINDS, R, app, auth, db, err, esc, gift_out, kv_get, now, q, q1, qr, tx

TZ = 3 * 3600
MIN_ROUNDS = 5          # меньше — итогов нет: нечего показать
NOTIFY_MIN = 20
DAY_LIMIT = 10          # сторис-карточек в сутки на игрока

db.executescript("""
CREATE TABLE IF NOT EXISTS recap_card(token TEXT PRIMARY KEY, user INTEGER, year INTEGER, data TEXT, lang TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS recap_card_user ON recap_card(user, ts);
""")

STRATEGY = {"mines", "tower", "blackjack", "cards", "chicken", "hilo", "safe", "ladder", "penalty", "darts"}
MULTI = {"crash", "avia", "limbo", "plinko", "slots", "dice", "keno", "pump", "drill", "starfall", "wheel", "roulette"}
PERSONAS = {   # id → (название, описание); выбирается по статистике в persona()
    "high": ("Хайроллер", "Крупные ставки и крупные заносы — ты знаешь, чего хочешь"),
    "collector": ("Коллекционер", "Кейсы — твоя стихия: подарок за подарком"),
    "marathon": ("Марафонец", "Почти каждый день в игре — вот это постоянство"),
    "strategist": ("Стратег", "Мины, башни и карты: каждый ход с расчётом"),
    "hunter": ("Охотник за иксами", "Краш, самолётик, лимбо — ловишь момент"),
    "explorer": ("Исследователь", "Пробуешь всё — ни одна игра не осталась без внимания"),
    "star": ("Звезда сезона", "Свой стиль и свой путь в игре"),
}


def _names():
    from live import NAMES
    return {**NAMES, "case": "Кейсы"}


def msk_ts(y, m, d):
    return calendar.timegm((y, m, d, 0, 0, 0)) - TZ


def recap_year(t=None):
    """Год, итоги которого сейчас показываем: 25–31 декабря — этот, 1–15 января — прошлый, иначе None."""
    if kv_get("recap", "on") == "off":
        return None
    m = time.gmtime((now() if t is None else t) + TZ)
    if m.tm_mon == 12 and m.tm_mday >= 25:
        return m.tm_year
    if m.tm_mon == 1 and m.tm_mday <= 15:
        return m.tm_year - 1
    return None


def year_for(uid):
    y = recap_year()
    if y is None and uid in A.ADMINS:   # админу — в любой день: итоги текущего года на сегодня
        y = time.gmtime(now() + TZ).tm_year
    return y


# ---------------- сравнение со всеми: сколько раундов у каждого игрока за год (фон, раз в 6 часов) ----------------
_PCT = {}   # год → (время расчёта, отсортированные количества раундов)


def _calc_pct(y):
    rows = qr(f"SELECT COUNT(*) n FROM events WHERE kind IN {GAME_KINDS} AND ts>=? AND ts<? GROUP BY user", msk_ts(y, 1, 1), msk_ts(y + 1, 1, 1))
    _PCT[y] = (now(), sorted(r["n"] for r in rows))


def percentile(y, rounds):
    """Доля игроков (в %), у которых за год раундов меньше. None — ещё не посчитано или игроков мало."""
    p = _PCT.get(y)
    if not p or len(p[1]) < 20:
        return None
    return int(bisect.bisect_left(p[1], rounds) * 100 / len(p[1]))


# ---------------- личная статистика ----------------
_ST = {}   # (uid, год) → (время, итоги): листают карточки и делают сторис — не пересчитываем каждый раз


def _streak(days):
    best = cur = 0
    prev = None
    for d in days:
        cur = cur + 1 if prev is not None and d == prev + 1 else 1
        best = max(best, cur)
        prev = d
    return best


def persona(s):
    if s["best"] and s["best"]["amount"] >= 100_000:
        return "high"
    if s["cases"] >= max(10, s["rounds"] * 0.5):
        return "collector"
    if s["days"] >= 100:
        return "marathon"
    if s["fav"]["kind"] in STRATEGY:
        return "strategist"
    if s["fav"]["kind"] in MULTI:
        return "hunter"
    if s["games"] >= 8:
        return "explorer"
    return "star"


def stats(uid, y):
    key = (uid, y)
    c = _ST.get(key)
    if c and now() - c[0] < 600:
        return c[1]
    y0, y1 = msk_ts(y, 1, 1), msk_ts(y + 1, 1, 1)
    games = q(f"SELECT kind, COUNT(*) n, SUM(delta>0) w FROM events WHERE user=? AND ts>=? AND ts<? AND kind IN {GAME_KINDS} GROUP BY kind", uid, y0, y1)
    rounds = sum(r["n"] for r in games)
    if rounds < MIN_ROUNDS:
        _ST[key] = (now(), None)
        return None
    names = _names()
    games = sorted(games, key=lambda r: -r["n"])
    top = [{"kind": r["kind"], "name": names.get(r["kind"], r["kind"]), "n": r["n"], "pct": round(r["n"] * 100 / rounds)} for r in games[:3]]
    b = q1(f"SELECT kind, delta, ts FROM events WHERE user=? AND ts>=? AND ts<? AND kind IN {GAME_KINDS} AND delta>0 ORDER BY delta DESC LIMIT 1", uid, y0, y1)
    days = [r["d"] for r in q(f"SELECT DISTINCT (ts+{TZ})/86400 d FROM events WHERE user=? AND ts>=? AND ts<? AND kind IN {GAME_KINDS} ORDER BY d", uid, y0, y1)]
    u = q1("SELECT * FROM users WHERE id=?", uid)
    g = q1("SELECT * FROM gifts WHERE owner=? ORDER BY value DESC, id LIMIT 1", uid)
    s = {"year": y, "rounds": rounds, "wins": sum(r["w"] or 0 for r in games), "games": len(games), "fav": top[0], "top": top,
         "best": {"amount": b["delta"], "kind": b["kind"], "name": names.get(b["kind"], b["kind"]), "ts": b["ts"]} if b else None,
         "days": len(days), "streak": _streak(days), "cases": next((r["n"] for r in games if r["kind"] == "case"), 0),
         "gift": gift_out(g) if g else None, "giftsN": q1("SELECT COUNT(*) n FROM gifts WHERE owner=?", uid)["n"],
         "friends": q1("SELECT COUNT(*) n FROM friends WHERE (a=? OR b=?) AND status='ok'", uid, uid)["n"], "refs": u["refs"] or 0,
         "since": u["created"] if u["created"] and u["created"] >= y0 else None, "level": A.level(u["xp"]), "name": A.user_brief(u)["name"]}
    s["pct"] = percentile(y, rounds)
    s["persona"] = persona(s)
    s["pname"], s["pdesc"] = PERSONAS[s["persona"]]
    s["pnameEn"], s["pdescEn"] = _EN_P[s["persona"]]
    _ST[key] = (now(), s)
    if len(_ST) > 5000:
        _ST.clear()
    return s


@app.get(R + "/recap")
def recap_get(uid=Depends(auth)):
    y = year_for(uid)
    return {"recap": stats(uid, y) if y else None}


def recap_on(uid):
    """Для /me (newyear.py): итоги есть — показать карточку на главной. Дёшево: из кэша или одним запросом."""
    y = recap_year()
    if y is None:
        return None
    c = _ST.get((uid, y))
    if c:
        return {"year": y} if c[1] else None
    n = q1(f"SELECT COUNT(*) n FROM (SELECT 1 FROM events WHERE user=? AND ts>=? AND ts<? AND kind IN {GAME_KINDS} LIMIT {MIN_ROUNDS})",
           uid, msk_ts(y, 1, 1), msk_ts(y + 1, 1, 1))["n"]
    return {"year": y} if n >= MIN_ROUNDS else None


# ---------------- сторис 1080×1920 ----------------
def _fmt(n):
    return f"{int(n):,}".replace(",", " ")


def _plural(n, f):
    n = abs(n) % 100
    if 10 < n < 20:
        return f[2]
    n %= 10
    return f[0] if n == 1 else f[1] if 1 < n < 5 else f[2]


_EN_P = {"high": ("High roller", "Big bets and big wins — you know what you want"), "collector": ("Collector", "Cases are your thing: gift after gift"),
         "marathon": ("Marathoner", "In the game almost every day — what consistency"), "strategist": ("Strategist", "Mines, towers and cards: every move calculated"),
         "hunter": ("Multiplier hunter", "Crash, plane, limbo — you catch the moment"), "explorer": ("Explorer", "You try everything — no game left behind"),
         "star": ("Star of the season", "Your own style and your own way")}
_EN_G = {"hilo": "Hi-Lo", "jroul": "Jackpot", "avia": "Plane", "bankbet": "Bank bet", "case": "Cases", "crash": "Crash", "mines": "Mines", "wheel": "Wheel",
         "dice": "Dice", "limbo": "Limbo", "plinko": "Plinko", "tower": "Tower", "slots": "Slots", "blackjack": "Blackjack", "dogs": "Dogs", "roulette": "Roulette",
         "chicken": "Chicken", "scratch": "Scratch cards", "battle": "Case battle", "starfall": "Starfall", "upgrade": "Upgrade", "cards": "Tables", "craft": "Craft",
         "claw": "Claw", "pump": "Pump", "drill": "Drill", "darts": "Darts", "fish": "Fishing", "keno": "Keno", "penalty": "Penalty", "safe": "Safe", "ladder": "Ladder",
         "carousel": "Carousel", "forecast": "Forecast", "duel": "Duel"}
_CACHE = {}


def render_story(c):
    import notifimg as N
    import share as SH
    from PIL import Image, ImageDraw
    if c["token"] in _CACHE:
        return _CACHE[c["token"]]
    s, en = c["data"], c["lang"] == "en"
    W, H = 1080, 1920
    gold, lilac, soft, white = (255, 214, 102), (203, 186, 255), (236, 226, 255), (255, 255, 255)
    im = SH._space(W, H, c["token"])
    y = s["year"]
    SH._center(im, "GIFT CASES", 120, N._font("DelaGothicOne-Regular.ttf", 50), gold)
    title = f"MY {y}" if en else f"МОЙ {y}"
    ft = N._fit(title, "DelaGothicOne-Regular.ttf", 150, W - 160, 80)
    tw = ImageDraw.Draw(im).textlength(title, font=ft)
    im, _, _ = SH._gold(im, int((W - tw) / 2), 200, title, ft)
    pname, pdesc = _EN_P[s["persona"]] if en else (s["pname"], s["pdesc"])
    # герой: самый ценный подарок (или звезда), под ним — характер игрока
    cy = 640
    im = SH._halo(im, (W // 2, cy), 300)
    art = SH._gift_art(s["gift"]["col"], s["gift"]["model"]) if s.get("gift") else None
    if art:
        im = SH._paste_art(im, art, (W // 2, cy), 520)
    else:
        SH._star(im, W // 2 - 170, cy - 170, 340)
    im = SH._sparkles(im, [(170, 420, 40), (910, 470, 30), (150, 820, 24), (930, 860, 38)])
    fp = N._fit(pname.upper(), "DelaGothicOne-Regular.ttf", 76, W - 140, 44)
    SH._center(im, pname.upper(), 930, fp, white)
    SH._center(im, pdesc, 1030, N._fit(pdesc, "Manrope.ttf", 40, W - 140, 28, "SemiBold"), lilac)
    # цифры года: 2×2 плитки
    games = _EN_G.get(s["fav"]["kind"], s["fav"]["kind"]) if en else s["fav"]["name"]
    tiles = [(_fmt(s["rounds"]), "rounds played" if en else _plural(s["rounds"], ["раунд сыгран", "раунда сыграно", "раундов сыграно"])),
             (games, "favourite game" if en else "любимая игра"),
             ((("+" + _fmt(s["best"]["amount"])) if s.get("best") else "—"), "biggest win" if en else "самый крупный выигрыш"),
             (_fmt(s["days"]), "days in the game" if en else _plural(s["days"], ["день в игре", "дня в игре", "дней в игре"]))]
    tw_, th_, gx, gy0 = 440, 210, 70, 1130
    pos = [(80 + (i % 2) * (tw_ + gx - 30), gy0 + (i // 2) * (th_ + 30)) for i in range(len(tiles))]
    # полупрозрачные плитки — отдельным слоем: рисование с альфой прямо по RGBA-картинке не смешивает цвета, а записывает
    # альфу в пиксели, и после convert("RGB") плитки становились сплошь белыми, а светлые подписи на них — не видны
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    dl = ImageDraw.Draw(layer)
    for x0, y0 in pos:
        dl.rounded_rectangle((x0, y0, x0 + tw_, y0 + th_), radius=36, fill=(255, 255, 255, 22), outline=(255, 255, 255, 40), width=2)
    im = Image.alpha_composite(im, layer)
    d = ImageDraw.Draw(im)
    for (val, cap), (x0, y0) in zip(tiles, pos):
        fv = N._fit(val, "DelaGothicOne-Regular.ttf", 76, tw_ - 60, 36)
        vw = d.textlength(val, font=fv)
        d.text((x0 + (tw_ - vw) / 2, y0 + 34), val, font=fv, fill=gold)
        fc = N._fit(cap, "Manrope.ttf", 30, tw_ - 40, 22, "Bold")
        cw = d.textlength(cap, font=fc)
        d.text((x0 + (tw_ - cw) / 2, y0 + 140), cap, font=fc, fill=soft)
    if s.get("pct") and s["pct"] >= 50:
        line = (f"Played more than {s['pct']}% of players" if en else f"Сыграно больше, чем у {s['pct']}% игроков")
        im, _ = SH._pill(im, int((W - d.textlength(line, font=N._font("Manrope.ttf", 34, "Bold")) - 36) / 2), 1620, line, N._font("Manrope.ttf", 34, "Bold"))
    SH._center(im, "@" + c["bot"], 1712, N._font("Manrope.ttf", 46, "ExtraBold"), gold)
    SH._center(im, "In-game stars and gifts · not real" if en else "Игровые звёзды и подарки · не настоящие", 1790, N._font("Manrope.ttf", 28, "SemiBold"), lilac)
    SH._frame(im)
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=90, optimize=True)
    data = buf.getvalue()
    _CACHE[c["token"]] = data
    if len(_CACHE) > 30:
        _CACHE.pop(next(iter(_CACHE)))
    return data


@app.post(R + "/recap/share")
async def recap_share(req: Request, uid=Depends(auth)):
    try:
        import notifimg as N
        from PIL import Image  # noqa: F401
        ok_img = bool(N.BASE)
    except Exception:
        ok_img = False
    if not ok_img:
        err("Карточки сейчас недоступны")
    try:
        body = await req.json()
    except Exception:
        body = None
    lang = "en" if isinstance(body, dict) and body.get("lang") == "en" else "ru"
    y = year_for(uid)
    s = stats(uid, y) if y else None
    if not s:
        err("Итогов пока нет — сыграй ещё немного")
    t = now()
    with tx():
        if q1("SELECT COUNT(*) n FROM recap_card WHERE user=? AND ts>=?", uid, t - 86400)["n"] >= DAY_LIMIT:
            err("На сегодня карточек хватит, загляни завтра")
        token = secrets.token_urlsafe(12)
        db.execute("INSERT INTO recap_card(token,user,year,data,lang,ts) VALUES(?,?,?,?,?,?)", (token, uid, y, json.dumps(s, ensure_ascii=False), lang, t))
        db.execute("DELETE FROM recap_card WHERE ts<?", (t - 60 * 86400,))
    base = A.APP_URL.rstrip("/") + "/api/recap/img/" + token
    link = f"https://t.me/{A.bot_name()}?start=ref_{uid}"
    text = (f"My {y} in Gift Cases: {_fmt(s['rounds'])} rounds, favourite game — {_EN_G.get(s['fav']['kind'], s['fav']['kind'])}. What's yours?" if lang == "en"
            else f"Мой {y} в Gift Cases: {_fmt(s['rounds'])} {_plural(s['rounds'], ['раунд', 'раунда', 'раундов'])}, любимая игра — {s['fav']['name']}. А какой был твой?")
    return {"story": base + ".jpg", "link": link, "text": text}


@app.get(R + "/recap/img/{name}")
def recap_img(name: str):
    m = re.fullmatch(r"([A-Za-z0-9_\-]{16})\.jpg", name)
    r = q1("SELECT * FROM recap_card WHERE token=?", m.group(1)) if m else None
    if not r:
        return Response(status_code=404)
    try:
        data = render_story({"token": r["token"], "data": json.loads(r["data"]), "lang": r["lang"], "bot": A.bot_name()})
    except Exception as e:
        print("recap render:", repr(e), flush=True)
        return Response(status_code=500)
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


# ---------------- фон: сравнение со всеми и одно сообщение от бота ----------------
def _notify_all(y):
    """Один раз за год: игрокам с напоминаниями и от NOTIFY_MIN раундов. Днём, не ночью."""
    hr = time.gmtime(now() + TZ).tm_hour
    if not 12 <= hr < 21 or kv_get("recap_sent", "") == str(y):
        return
    with tx():
        db.execute("INSERT INTO kv(k,v) VALUES('recap_sent',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (str(y),))
    rows = qr(f"""SELECT e.user FROM events e JOIN users u ON u.id=e.user WHERE e.kind IN {GAME_KINDS} AND e.ts>=? AND e.ts<?
                  AND u.notif=1 AND u.banned=0 GROUP BY e.user HAVING COUNT(*)>=?""", msk_ts(y, 1, 1), msk_ts(y + 1, 1, 1), NOTIFY_MIN)
    text = (f"Твои итоги {y} года готовы: сколько раундов сыграно, любимая игра, самый крупный выигрыш и твой характер игрока. "
            "Загляни в игру и поделись карточкой в сторис!")
    for r in rows:
        A.notify(r["user"], text)
        time.sleep(0.06)


def _tick():
    y = recap_year()
    if y is None:
        return
    p = _PCT.get(y)
    if not p or now() - p[0] > 6 * 3600:
        _calc_pct(y)
    _notify_all(y)


async def recap_loop():
    await asyncio.sleep(45)
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _tick)
        except Exception as e:
            print("recap:", repr(e), flush=True)
        await asyncio.sleep(300)


@app.on_event("startup")
async def _recap_start():
    asyncio.create_task(recap_loop())


import newyear  # noqa: E402

newyear.RECAP_ON = recap_on
