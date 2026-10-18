"""«Живая» игра: лента крупных выигрышей по всем играм, онлайн, «играют сейчас» по играм, реакции на чужие выигрыши.
Крупный выигрыш пишет app.event() (BIGWIN_MIN), здесь — чтение и реакции."""

from fastapi import Depends, Request

from app import R, app, auth, db, err, esc, notify, now, q, q1, tx, user_brief

REACTS = ["🔥", "👏", "😱", "💰"]
NOTIFY_AT = 3          # столько реакций — бот сообщает хозяину выигрыша
NAMES = {"crash": "Краш", "mines": "Мины", "wheel": "Колесо", "duel": "Дуэль", "dice": "Кубик", "limbo": "Лимбо", "plinko": "Плинко",
         "tower": "Башня", "slots": "Слоты", "blackjack": "Блэкджек", "dogs": "Пёсики", "roulette": "Рулетка", "hilo": "Больше/меньше",
         "chicken": "Курица", "avia": "Самолётик", "scratch": "Скретч-карты", "battle": "Битва кейсов", "starfall": "Звездопад",
         "upgrade": "Апгрейд", "jroul": "Джекпот", "cards": "Столы", "craft": "Крафт",
         "claw": "Кран", "pump": "Насос", "drill": "Бур", "darts": "Дартс", "fish": "Рыбалка"}

db.executescript("""
CREATE TABLE IF NOT EXISTS bigwin_reacts(win INTEGER, user INTEGER, emoji TEXT, ts INTEGER, PRIMARY KEY(win, user));
""")


def _wins(uid, limit):
    out = []
    for w in q("SELECT * FROM bigwins ORDER BY id DESC LIMIT ?", limit):
        u = q1("SELECT * FROM users WHERE id=?", w["user"])
        if not u:
            continue
        rs = {r["emoji"]: r["n"] for r in q("SELECT emoji, COUNT(*) n FROM bigwin_reacts WHERE win=? GROUP BY emoji", w["id"])}
        mine = q1("SELECT emoji FROM bigwin_reacts WHERE win=? AND user=?", w["id"], uid)
        out.append({"id": w["id"], "user": user_brief(u), "kind": w["kind"], "game": NAMES.get(w["kind"], w["kind"]), "amount": w["amount"],
                    "ts": w["ts"], "reacts": rs, "mine": mine["emoji"] if mine else None})
    return out


@app.get(R + "/live")
def live(full: int = 0, uid=Depends(auth)):
    t = now()
    online = q1("SELECT COUNT(*) n FROM users WHERE seen>=?", t - 300)["n"]
    playing = {r["kind"]: r["n"] for r in q("SELECT kind, COUNT(DISTINCT user) n FROM events WHERE ts>=? GROUP BY kind", t - 300)}
    return {"online": max(1, online), "playing": playing, "wins": _wins(uid, 30 if full else 12), "reactsList": REACTS}


@app.post(R + "/live/{wid}/react")
async def react(wid: int, req: Request, uid=Depends(auth)):
    emoji = str((await req.json()).get("emoji", ""))
    if emoji not in REACTS:
        err("Действие устарело — обнови экран")
    note = None
    with tx():
        w = q1("SELECT * FROM bigwins WHERE id=?", wid) or err("выигрыш не найден")
        if w["user"] == uid:
            err("на свой выигрыш реагировать нельзя")
        db.execute("INSERT INTO bigwin_reacts(win,user,emoji,ts) VALUES(?,?,?,?) ON CONFLICT(win,user) DO UPDATE SET emoji=excluded.emoji",
                   (wid, uid, emoji, now()))
        n = q1("SELECT COUNT(*) n FROM bigwin_reacts WHERE win=?", wid)["n"]
        if n == NOTIFY_AT:
            note = (w["user"], f"🔥 Твой выигрыш ⭐ {w['amount']:,} в игре «{esc(NAMES.get(w['kind'], w['kind']))}» оценили уже {n} игрока!".replace(",", " "))
    if note:
        notify(*note)
    return {"ok": True}


def _backfill():
    """Первый запуск: заполняем ленту крупными выигрышами за последние 2 дня из журнала событий."""
    from app import BIG_KINDS, BIGWIN_MIN
    if q1("SELECT 1 FROM bigwins LIMIT 1"):
        return
    ks = "(" + ",".join("'%s'" % k for k in BIG_KINDS) + ")"
    with tx():
        for r in reversed(q(f"SELECT user, kind, delta, ts FROM events WHERE kind IN {ks} AND delta>=? AND ts>=? ORDER BY ts DESC LIMIT 100",
                            BIGWIN_MIN, now() - 2 * 86400)):
            db.execute("INSERT INTO bigwins(user,kind,amount,ts) VALUES(?,?,?,?)", (r["user"], r["kind"], r["delta"], r["ts"]))


_backfill()
