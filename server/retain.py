"""Удержание игроков.
1) Кэшбэк недели: в понедельник каждому, кто за прошлую неделю ушёл в минус в играх, возвращаем 5% чистого проигрыша
   (от ⭐ 2000 минуса, не больше ⭐ 250K). В среднем это ~0,2% оборота — преимущество казино сохраняется.
2) «Возвращайся»: игроку, который не заходил 2+ дня (но не дольше 14), бот пишет раз в 7 дней
   и кладёт ключ от «Ширпотреба». Только тем, кто реально играл (от 30 раундов), и с включёнными уведомлениями."""
from settings import conf
import asyncio
import time

from app import GAME_KINDS, app, db, esc, event, notify, now, q, q1, tx, week_start

CB_RATE = conf("cashback.rate", 0.05)
CB_MIN_LOSS = conf("cashback.min_loss", 2_000)
CB_MAX = conf("cashback.max", 250_000)
BACK_AFTER = 2 * 86400      # не заходил столько — зовём
BACK_UNTIL = 14 * 86400     # дольше — уже не дёргаем
BACK_EVERY = 7 * 86400      # одному игроку — не чаще
BACK_ROUNDS = 30            # твинкам без игры ключ не положен
BACK_CASE = conf("comeback.case", "starter")
BACK_HOURS = range(6, 19)   # 9:00–21:00 по Москве

db.executescript("""
CREATE TABLE IF NOT EXISTS cashback(week INTEGER, user INTEGER, loss INTEGER, amount INTEGER, ts INTEGER, PRIMARY KEY(week, user));
CREATE TABLE IF NOT EXISTS comeback(user INTEGER PRIMARY KEY, ts INTEGER);
""")


def week_net(uid, since=None):
    """Чистый итог игрока в играх с начала недели (минус — проигрыш)."""
    return q1(f"SELECT COALESCE(SUM(delta),0) s FROM events WHERE user=? AND kind IN {GAME_KINDS} AND ts>=?", uid, since or week_start())["s"]


def cashback_preview(uid):
    """Сколько вернётся в понедельник, если неделя закончится сейчас (для /me)."""
    net = week_net(uid)
    return min(CB_MAX, int(-net * CB_RATE)) if -net >= CB_MIN_LOSS else 0


def _cashback():
    week = week_start() - 7 * 86400
    if q1("SELECT 1 FROM cashback WHERE week=? AND user=0", week):
        return
    msgs = []
    with tx():
        if q1("SELECT 1 FROM cashback WHERE week=? AND user=0", week):
            return
        for r in q(f"SELECT user, SUM(delta) s FROM events WHERE kind IN {GAME_KINDS} AND ts>=? AND ts<? GROUP BY user HAVING s<=?",
                   week, week + 7 * 86400, -CB_MIN_LOSS):
            amt = min(CB_MAX, int(-r["s"] * CB_RATE))
            if amt <= 0 or not q1("SELECT 1 FROM users WHERE id=?", r["user"]):
                continue
            db.execute("INSERT INTO cashback VALUES(?,?,?,?,?)", (week, r["user"], -r["s"], amt, now()))
            db.execute("UPDATE users SET stars=stars+? WHERE id=?", (amt, r["user"]))
            event(r["user"], "cashback", amt)
            msgs.append((r["user"], f"💸 <b>Кэшбэк недели</b>: прошлая неделя не задалась — возвращаем 5% проигрыша, "
                                    f"+{amt:,} ⭐ уже на балансе. Удачи на этой неделе!".replace(",", " ")))
        db.execute("INSERT INTO cashback VALUES(?,0,0,0,?)", (week, now()))   # отметка «неделя выплачена»
    for u, t in msgs:
        notify(u, t)
    print(f"cashback: week {week}, paid {len(msgs)}", flush=True)


def _comeback():
    if time.gmtime().tm_hour not in BACK_HOURS:
        return
    t = now()
    import economy as E
    title = E.CASES[BACK_CASE]["title"]
    msgs = []
    with tx():
        for u in q("SELECT * FROM users WHERE seen<? AND seen>? LIMIT 200", t - BACK_AFTER, t - BACK_UNTIL):
            if "notif" in u.keys() and not u["notif"]:
                continue
            last = q1("SELECT ts FROM comeback WHERE user=?", u["id"])
            if last and t - last["ts"] < BACK_EVERY:
                continue
            if q1(f"SELECT COUNT(*) n FROM (SELECT 1 FROM events WHERE user=? AND kind IN {GAME_KINDS} LIMIT ?)", u["id"], BACK_ROUNDS)["n"] < BACK_ROUNDS:
                continue
            db.execute("INSERT INTO comeback(user,ts) VALUES(?,?) ON CONFLICT(user) DO UPDATE SET ts=excluded.ts", (u["id"], t))
            db.execute("INSERT INTO case_keys(user,cid,n) VALUES(?,?,1) ON CONFLICT(user,cid) DO UPDATE SET n=n+1", (u["id"], BACK_CASE))
            msgs.append((u["id"], f"👋 {esc(u['name'])}, давно не виделись! Положили тебе ключ от кейса «{esc(title)}» — "
                                  f"открой бесплатно. Бонус дня тоже ждёт 🎁"))
            if len(msgs) >= 40:   # не больше 40 писем за проход — без всплесков к Telegram API
                break
    for u, text in msgs:
        notify(u, text)


async def _loop():
    await asyncio.sleep(40)
    while True:
        for f in (_cashback, _comeback):
            try:
                await asyncio.get_running_loop().run_in_executor(None, f)
            except Exception as e:
                print("retain:", f.__name__, e, flush=True)
        await asyncio.sleep(900)


@app.on_event("startup")
async def _start():
    asyncio.create_task(_loop())
