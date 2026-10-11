"""Админка → «Шансы»: возврат игроку по каждой игре, меняется на лету без перезапуска.
Правки хранятся в базе (kv 'odds') и важнее settings.toml; «Сбросить» — вернуть значение из файла.
Менять может только владелец (ADMIN_IDS из .env), остальные админы только смотрят."""
import json
import time

from fastapi import Depends, Request

import settings
from app import R, app, db, edge, err, kv_get, promo, q, tx

# ключ → (название, какие события в журнале, значение по умолчанию из settings.toml)
GAMES = [
    ("games.slots_rtp", "Слоты", ("slots",), lambda: settings.conf("games.slots_rtp", 0.94)),
    ("games.dogs_rtp", "Пёсики", ("dogs",), lambda: round(settings.conf("games.dogs_scale", 0.405) * 2.43, 3)),
    ("games.edge", "Кубик, лимбо, башня", ("dice", "limbo", "tower"), lambda: settings.conf("games.edge", 0.96)),
    ("games.crash_edge", "Краш", ("crash",), lambda: settings.conf("games.crash_edge", 0.97)),
    ("games.mines_edge", "Мины", ("mines",), lambda: settings.conf("games.mines_edge", 0.96)),
    ("games.chicken_edge", "Курица", ("chicken",), lambda: settings.conf("games.chicken_edge", 0.96)),
    ("games.hilo_edge", "Больше/меньше", ("hilo",), lambda: settings.conf("games.hilo_edge", 0.96)),
    ("games.avia_rtp", "Самолётик", ("avia",), lambda: settings.conf("games.avia_rtp", 0.96)),
    ("games.wheel_rtp", "Колесо", ("wheel",), lambda: settings.conf("games.wheel_rtp", 0.935)),
    ("games.scratch_rtp", "Скретч-карты", ("scratch",), lambda: settings.conf("games.scratch_rtp", 0.94)),
    ("games.upgrade_edge", "Апгрейд", ("upgrade",), lambda: settings.conf("games.upgrade_edge", 0.92)),
]
KEYS = {g[0]: g for g in GAMES}
# в акцию «Щедрые выходные» эти игры отдают не меньше указанного (см. edge() в коде игр)
PROMO_FLOOR = {"games.edge": 0.98, "games.crash_edge": 0.98, "games.mines_edge": 0.98, "games.chicken_edge": 0.98,
               "games.hilo_edge": 0.98, "games.avia_rtp": 0.98, "games.upgrade_edge": 0.93, "games.scratch_rtp": 0.96}
LO, HI = 0.80, 0.99   # выше 99% — казино почти ничего не зарабатывает, ниже 80% — игроки разбегутся


def _load():
    try:
        v = json.loads(kv_get("odds", "{}") or "{}")
        settings._LIVE.clear()
        settings._LIVE.update({k: float(x) for k, x in v.items() if k in KEYS})
    except Exception as e:
        print("odds:", e, flush=True)


_load()


def _routes():
    from admin import OWNERS, admin, log

    @app.get(R + "/admin/odds")
    def odds_get(aid=Depends(admin)):
        since = int(time.time()) - 7 * 86400
        house = {r["kind"]: (-r["s"], r["n"]) for r in q("SELECT kind, SUM(delta) s, COUNT(*) n FROM events WHERE ts>=? GROUP BY kind", since)}
        out = []
        for key, title, kinds, dflt in GAMES:
            d = dflt()
            v = settings._LIVE.get(key, d)
            eff = edge(v, PROMO_FLOOR[key]) if key in PROMO_FLOOR else v
            out.append({"key": key, "title": title, "value": v, "default": d, "changed": key in settings._LIVE, "effective": eff,
                        "house7": sum(house.get(k, (0, 0))[0] for k in kinds), "rounds7": sum(house.get(k, (0, 0))[1] for k in kinds)})
        return {"list": out, "canEdit": aid in OWNERS, "lo": LO, "hi": HI, "promo": bool(promo())}

    @app.post(R + "/admin/odds")
    async def odds_set(req: Request, aid=Depends(admin)):
        if aid not in OWNERS:
            err("Менять шансы может только владелец")
        b = await req.json()
        key = str(b.get("key", ""))
        if key not in KEYS:
            err("нет такой игры")
        val = b.get("value")
        cur = dict(settings._LIVE)
        if val is None:
            cur.pop(key, None)
            detail = f"{KEYS[key][1]}: сброс на {KEYS[key][3]() * 100:g}%"
        else:
            try:
                val = round(float(val), 4)
            except (TypeError, ValueError):
                err("введи число")
            if not LO <= val <= HI:
                err(f"от {LO * 100:g}% до {HI * 100:g}%")
            cur[key] = val
            detail = f"{KEYS[key][1]}: {val * 100:g}%"
        with tx():
            db.execute("INSERT INTO kv(k,v) VALUES('odds',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (json.dumps(cur),))
            log(aid, "odds", None, detail)
        settings._LIVE.clear()
        settings._LIVE.update(cur)
        return {"ok": True}


_routes()
