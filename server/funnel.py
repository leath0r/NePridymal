"""Воронка новичков (админка → «Воронка»): игроки, пришедшие за 7/30/90 дней, — откуда пришли (рефералка, подарок по ссылке,
франшиза, сами), сыграли ли, открыли ли кейс, вернулись ли на следующий день и через неделю, дошли ли до 5 уровня и первой
покупки, и после какой игры ушли. Всё — по журналу events и таблицам игроков одним снимком базы без общего лока (qr_snap);
результат держим 5 минут, чтобы вкладка не нагружала базу при каждом открытии."""
from fastapi import Depends

import app as A
from admin import admin
from app import GAME_KINDS, R, app, db, now, qr_snap

DAY = 86400
PERIODS = (7, 30, 90)
SOURCES = ("ref", "gift", "franchise", "organic")
CHURN = 3 * DAY      # не играл трое суток — считаем, что ушёл
CACHE_S = 300
_CACHE = {}

db.execute("CREATE INDEX IF NOT EXISTS users_created ON users(created)")


def _names():
    from live import NAMES
    return {**NAMES, "case": "Кейсы"}


def _blank():
    return {"n": 0, "play": 0, "case": 0, "d1": 0, "d1of": 0, "d7": 0, "d7of": 0, "lv5": 0, "pay": 0, "xtr": 0}


def build(days):
    t = now()
    t0 = t - days * DAY
    G = GAME_KINDS
    cohort = "SELECT id FROM users WHERE created>=? AND created<? AND COALESCE(banned,0)=0"
    users, ev, last, pay, links = qr_snap(
        ("SELECT id, created, ref_by, COALESCE(came_bot,0) came_bot, COALESCE(xp,0) xp FROM users "
         "WHERE created>=? AND created<? AND COALESCE(banned,0)=0", (t0, t)),
        # раунды новичка: сколько, были ли кейсы, играл ли в сутки №2 и №8 после регистрации, когда играл в последний раз
        (f"""SELECT e.user, COUNT(*) g, SUM(e.kind='case') cs,
                    MAX(e.ts>=u.created+{DAY} AND e.ts<u.created+{2 * DAY}) d1,
                    MAX(e.ts>=u.created+{7 * DAY} AND e.ts<u.created+{8 * DAY}) d7,
                    MAX(e.ts) lt
             FROM users u JOIN events e ON e.user=u.id AND e.ts>=u.created
             WHERE u.created>=? AND u.created<? AND COALESCE(u.banned,0)=0 AND e.kind IN {G} GROUP BY e.user""", (t0, t)),
        # последняя игра: с одним MAX() SQLite берёт kind из той же строки (bare column)
        (f"""SELECT e.user, e.kind, MAX(e.ts) mt FROM users u JOIN events e ON e.user=u.id AND e.ts>=u.created
             WHERE u.created>=? AND u.created<? AND COALESCE(u.banned,0)=0 AND e.kind IN {G} GROUP BY e.user""", (t0, t)),
        (f"SELECT user, COUNT(*) n, COALESCE(SUM(xtr),0) xtr FROM payments WHERE user IN ({cohort}) GROUP BY user", (t0, t)),
        (f"SELECT taker, sender FROM gift_links WHERE taker IN ({cohort})", (t0, t)),
    )
    ev = {r["user"]: r for r in ev}
    last = {r["user"]: r["kind"] for r in last}
    pay = {r["user"]: r for r in pay}
    gift_pairs = {(r["taker"], r["sender"]) for r in links}
    src = {s: _blank() for s in SOURCES}
    tot = _blank()
    churn, none, kinds = 0, 0, {}
    for u in users:
        if u["ref_by"]:   # пришёл по ссылке-подарку: при /start gift_… отправитель записывается пригласившим
            s = "gift" if (u["id"], u["ref_by"]) in gift_pairs else "ref"
        else:
            s = "franchise" if u["came_bot"] else "organic"
        e, p = ev.get(u["id"]), pay.get(u["id"])
        lv5 = A.level(u["xp"]) >= 5
        for a in (src[s], tot):
            a["n"] += 1
            if e:
                a["play"] += 1
                a["case"] += 1 if e["cs"] else 0
            if u["created"] <= t - 2 * DAY:   # сутки №2 уже прошли целиком — новичок входит в знаменатель
                a["d1of"] += 1
                a["d1"] += 1 if e and e["d1"] else 0
            if u["created"] <= t - 8 * DAY:
                a["d7of"] += 1
                a["d7"] += 1 if e and e["d7"] else 0
            a["lv5"] += 1 if lv5 else 0
            if p:
                a["pay"] += 1
                a["xtr"] += p["xtr"]
        if u["created"] <= t - CHURN and (not e or e["lt"] < t - CHURN):
            churn += 1
            k = last.get(u["id"])
            if k:
                kinds[k] = kinds.get(k, 0) + 1
            else:
                none += 1
    names = _names()
    top = sorted(kinds.items(), key=lambda x: (-x[1], x[0]))
    drop = [{"kind": k, "name": names.get(k, k), "n": n} for k, n in top[:8]]
    rest = sum(n for _, n in top[8:])
    if rest:
        drop.append({"kind": "other", "name": "Другие игры", "n": rest})
    return {"days": days, "ts": t, "total": tot, "sources": [{"id": s, **src[s]} for s in SOURCES],
            "churn": {"n": churn, "none": none, "games": drop, "after": CHURN // DAY}}


@app.get(R + "/admin/funnel")
def funnel(days: int = 30, aid=Depends(admin)):
    days = days if days in PERIODS else 30
    c = _CACHE.get(days)
    if c and 0 <= now() - c[0] < CACHE_S:
        return c[1]
    r = build(days)
    _CACHE[days] = (now(), r)
    return r
