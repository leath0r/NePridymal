"""Скретч-карты: 3×3 скрытых подарка, три одинаковых — выигрыш по таблице. Исход решается сервером при покупке,
стирание на клиенте — только анимация. Возврат ≈ 95%, выигрыш примерно в каждой третьей карте."""
import random

from settings import tuned

from fastapi import Depends, Request

from app import R, add_xp, app, auth, bal, db, edge, err, event, tx

TIERS = {"bronze": 100, "gold": 1000, "diamond": 10000}
# (множитель, вероятность, символ-подарок)
PRIZES = [(1, .16, "Lol Pop"), (2, .09, "Jelly Bunny"), (3, .05, "Toy Bear"), (5, .03, "Signet Ring"),
          (10, .015, "Swiss Watch"), (25, .004, "Durov's Cap"), (100, .0006, "Plush Pepe")]   # Σ p·x ≈ 0,95
SYMS = [p[2] for p in PRIZES]


def _grid(win_sym):
    """9 клеток: если есть выигрыш — ровно три win_sym, остальные символы максимум по два (без второй тройки)."""
    cells = [win_sym] * 3 if win_sym else []
    pool = [s for s in SYMS if s != win_sym]
    random.shuffle(pool)
    counts = {}
    while len(cells) < 9:
        s = random.choice(pool)
        if counts.get(s, 0) < 2:
            counts[s] = counts.get(s, 0) + 1
            cells.append(s)
    random.shuffle(cells)
    return cells


LOW_MAX = 5   # призы меньше x5 — «мелочь» (вернули ставку), x5 и выше — крутые комбинации
_EV_LOW = sum(x * p for x, p, _ in PRIZES if x < LOW_MAX)    # ожидаемый возврат от мелких призов ≈ 0,49
_EV_HIGH = sum(x * p for x, p, _ in PRIZES if x >= LOW_MAX)  # ... от крутых ≈ 0,46


def _roll():
    """Возврат игроку = настройка scratch_rtp. Мелкие призы (x1–x3) частые и фиксированные,
    а весь прирост возврата сверх базы идёт в КРУТЫЕ комбинации (x5+): поднял шанс в админке —
    чаще выпадают именно редкие призы, а не «вернули ставку». В акцию edge() поднимает возврат (ещё щедрее)."""
    rtp = edge(tuned("games.scratch_rtp", 0.94), 0.96)
    m = max(0.0, (rtp - _EV_LOW) / _EV_HIGH) if _EV_HIGH else 0.0   # множитель шанса крутых призов под нужный возврат
    r = random.random()
    for x, p, sym in PRIZES:
        pr = p if x < LOW_MAX else p * m
        if r < pr:
            return x, sym
        r -= pr
    return 0, None


@app.post(R + "/scratch")
async def scratch(req: Request, uid=Depends(auth)):
    tier = str((await req.json()).get("tier", "bronze"))
    price = TIERS.get(tier) or err("нет такой карты")
    x, sym = _roll()
    cells = _grid(sym)
    pay = price * x
    with tx():
        if bal(uid) < price:
            err("Не хватает звёзд")
        db.execute("UPDATE users SET stars=stars-?+? WHERE id=?", (price, pay, uid))
        event(uid, "scratch", pay - price)
        lvl = add_xp(uid, max(1, price // 20))
    return {"cells": cells, "mult": x, "sym": sym, "win": [i for i, c in enumerate(cells) if c == sym] if sym else [],
            "pay": pay, "price": price, "stars": bal(uid), "levelup": lvl}


@app.get(R + "/scratch")
def scratch_info(uid=Depends(auth)):
    return {"tiers": TIERS, "prizes": [{"mult": x, "sym": s} for x, _, s in PRIZES]}
