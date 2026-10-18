"""Админ включает, закрывает и скрывает игры.
on — работает; closed — карточка видна с плашкой «Закрыто», новые ставки не принимаются; hidden — карточки нет вовсе.
Блокируем только СТАРТ раунда: начатые игры (мины, башня, курица, блэкджек, краш…) можно доиграть и забрать."""
import json
import re
import time

from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from app import R, app, db, kv_get

STARTS = {   # id карточки в «Играх» → какие POST начинают раунд
    "crash": [r"/crash/bet"], "duels": [r"/duels", r"/duels/\d+/accept", r"/cduel/\d+/accept"], "upgrade": [r"/upgrade"],
    "mines": [r"/mines/start"], "wheel": [r"/wheel"], "swap": [r"/swap"], "dogs": [r"/dogs", r"/dogs/buy"], "scratch": [r"/scratch"],
    "battle": [r"/battles", r"/battles/\d+/join", r"/battles/\d+/bot"], "avia": [r"/avia"], "chicken": [r"/chicken/start"],
    "jroul": [r"/jroul/bet"], "rlt": [r"/rlt"], "tower": [r"/tower/start"], "slots": [r"/slots"], "dice": [r"/dice"], "limbo": [r"/limbo"],
    "101": [r"/rooms", r"/rooms/\d+/join"], "blackjack": [r"/bj/start"], "starfall": [r"/starfall/bet"], "hilo": [r"/hilo/start"],
    "craft": [r"/craft"], "stack": [r"/stack/start"], "claw": [r"/claw/play"],
}
_RX = [(gid, re.compile("^" + re.escape(R) + p + "$")) for gid, ps in STARTS.items() for p in ps]
_C = {"t": 0, "v": {}}


def states():
    if time.time() - _C["t"] > 3:
        try:
            _C["v"] = json.loads(kv_get("games", "{}") or "{}")
        except Exception:
            _C["v"] = {}
        _C["t"] = time.time()
    return _C["v"]


@app.middleware("http")
async def _game_gate(request: Request, call_next):
    if request.method == "POST":
        st = states()
        if st:
            path = request.url.path
            for gid, rx in _RX:
                if st.get(gid, "on") != "on" and rx.match(path):
                    return JSONResponse({"detail": "Игра временно закрыта — загляни позже"}, status_code=403)
    return await call_next(request)


@app.get(R + "/games/state")
def games_state():
    return {k: v for k, v in states().items() if v != "on"}


def _admin_routes():
    from admin import admin, log
    from app import tx

    @app.get(R + "/admin/games")
    def adm_games(aid=Depends(admin)):
        return {"states": states(), "ids": list(STARTS)}

    @app.post(R + "/admin/games")
    async def adm_games_set(req: Request, aid=Depends(admin)):
        b = await req.json()
        gid, st = str(b.get("id", "")), str(b.get("state", "on"))
        if gid not in STARTS or st not in ("on", "closed", "hidden"):
            from app import err
            err("неверные параметры")
        cur = dict(states())
        if st == "on":
            cur.pop(gid, None)
        else:
            cur[gid] = st
        with tx():
            db.execute("INSERT INTO kv(k,v) VALUES('games',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (json.dumps(cur),))
            log(aid, "game", None, f"{gid}={st}")
        _C["t"] = 0
        return {"states": states()}


_admin_routes()
