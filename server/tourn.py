"""Турниры недели: два турнира по разным играм (пары меняются каждую неделю). Счёт — чистый выигрыш в игре за неделю.
Призовой фонд от банка казино, топ-5 делят по долям; итоги подводятся автоматически в начале следующей недели."""
from settings import conf
import asyncio
import json

from fastapi import Depends

from app import R, app, auth, db, esc, event, notify, now, q, q1, tx, user_brief, week_start

ROTATION = [("dogs", "crash"), ("chicken", "avia"), ("slots", "mines"), ("dice", "tower"), ("battle", "scratch")]
NAMES = {"dogs": "Пёсики", "crash": "Краш", "chicken": "Курица", "avia": "Самолётик", "slots": "Слоты", "mines": "Мины",
         "dice": "Кубик", "tower": "Башня", "battle": "Битва кейсов", "scratch": "Скретч-карты"}
POOL = conf("tourn.pool", 100_000)
SHARES = [.40, .25, .15, .12, .08]
WEEK = 7 * 86400

db.executescript("CREATE TABLE IF NOT EXISTS tourn_results(week INTEGER, game TEXT, result TEXT, ts INTEGER, PRIMARY KEY(week, game));")


def games_of(ws):
    return ROTATION[(ws // WEEK) % len(ROTATION)]


def standings(game, ws, limit=10):
    return q("SELECT user, SUM(delta) s FROM events WHERE kind=? AND ts>=? AND ts<? GROUP BY user HAVING s>0 ORDER BY s DESC LIMIT ?",
             game, ws, ws + WEEK, limit)


@app.get(R + "/tournaments")
def tournaments(uid=Depends(auth)):
    ws = week_start()
    items = []
    for g in games_of(ws):
        rows = standings(g, ws)
        top = []
        for i, r in enumerate(rows):
            u = q1("SELECT * FROM users WHERE id=?", r["user"])
            if u:
                top.append({**user_brief(u), "score": r["s"], "prize": int(POOL * SHARES[i]) if i < len(SHARES) else 0})
        me = q1("SELECT COALESCE(SUM(delta),0) s FROM events WHERE kind=? AND user=? AND ts>=?", g, uid, ws)["s"]
        place = next((i + 1 for i, r in enumerate(standings(g, ws, 1000)) if r["user"] == uid), None)
        items.append({"game": g, "title": NAMES[g], "pool": POOL, "top": top, "me": {"score": me, "place": place}})
    last = [dict(r) | {"result": json.loads(r["result"])} for r in q("SELECT * FROM tourn_results ORDER BY week DESC, game LIMIT 2")]
    nxt = games_of(ws + WEEK)
    return {"items": items, "weekEnds": ws + WEEK, "shares": SHARES, "last": last, "next": [NAMES[g] for g in nxt]}


def _settle():
    prev = week_start() - WEEK
    msgs = []
    with tx():
        for g in games_of(prev):
            if q1("SELECT 1 FROM tourn_results WHERE week=? AND game=?", prev, g):
                continue
            res = []
            for i, r in enumerate(standings(g, prev, len(SHARES))):
                prize = int(POOL * SHARES[i])
                db.execute("UPDATE users SET stars=stars+? WHERE id=?", (prize, r["user"]))
                event(r["user"], "tourn", prize)
                u = q1("SELECT name FROM users WHERE id=?", r["user"])
                res.append({"place": i + 1, "user": r["user"], "name": u["name"] if u else "?", "score": r["s"], "prize": prize})
                msgs.append((r["user"], f"🏆 Турнир недели «{esc(NAMES[g])}»: ты на {i + 1} месте! Приз ⭐ {prize:,}".replace(",", " ")))
            db.execute("INSERT INTO tourn_results(week,game,result,ts) VALUES(?,?,?,?)", (prev, g, json.dumps(res, ensure_ascii=False), now()))
    for u, t in msgs:
        notify(u, t)


async def tourn_loop():
    await asyncio.sleep(40)
    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _settle)
        except Exception as e:
            print("tourn:", e, flush=True)
        await asyncio.sleep(900)


@app.on_event("startup")
async def _tourn_start():
    asyncio.create_task(tourn_loop())
