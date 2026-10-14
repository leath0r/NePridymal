"""Опросы в боте: сообщение всем игрокам с кнопками «Да»/«Нет» (callback pv:<id>:y|n), голос можно поменять до конца.
Анонимно для игроков: id храним только чтобы один человек = один голос. Через `hours` часов итоги — админам в бота.
Опрос создаётся строкой в таблице poll (sent=0) — цикл сам разошлёт его через бота каждого игрока (franchise.token_for)."""
import asyncio
import json

import app as A
from app import ADMINS, db, esc, notify, now, q, q1, tg_call, tx

db.executescript("""
CREATE TABLE IF NOT EXISTS poll(id INTEGER PRIMARY KEY, text TEXT, yes TEXT, no TEXT, created INTEGER, ends INTEGER,
                                sent INTEGER DEFAULT 0, delivered INTEGER DEFAULT 0, done INTEGER DEFAULT 0, by INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS poll_vote(pid INTEGER, user INTEGER, choice TEXT, ts INTEGER, PRIMARY KEY(pid, user));
""")
ALLOWED = ["message", "pre_checkout_query", "callback_query"]


def _counts(pid):
    r = q1("SELECT COALESCE(SUM(choice='y'),0) y, COALESCE(SUM(choice='n'),0) n FROM poll_vote WHERE pid=?", pid)
    return r["y"], r["n"]


async def _send(p):
    fr = __import__("franchise")
    kb = {"inline_keyboard": [[{"text": p["yes"], "callback_data": f"pv:{p['id']}:y"}, {"text": p["no"], "callback_data": f"pv:{p['id']}:n"}]]}
    ids = [r["id"] for r in q("SELECT id FROM users WHERE banned=0")]
    ok = 0
    for uid in ids:
        try:
            tok = fr.token_for(uid)
            r = await tg_call("sendMessage", _token=tok, chat_id=uid, text=p["text"], parse_mode="HTML", reply_markup=kb)
            if not r.get("ok") and tok != A.TOKEN:   # бот-франшиза не смог — через главного
                r = await tg_call("sendMessage", _token=A.TOKEN, chat_id=uid, text=p["text"], parse_mode="HTML", reply_markup=kb)
            ok += bool(r.get("ok"))
        except Exception as e:
            print("poll send", uid, e, flush=True)
        await asyncio.sleep(0.05)
    with tx():
        db.execute("UPDATE poll SET delivered=? WHERE id=?", (ok, p["id"]))
    print("poll", p["id"], "доставлено", ok, "из", len(ids), flush=True)


def _finish(p):
    y, n = _counts(p["id"])
    tot = y + n
    pct = (lambda x: f"{round(x * 100 / tot)}%") if tot else (lambda x: "—")
    with tx():
        db.execute("UPDATE poll SET done=1 WHERE id=?", (p["id"],))
    text = (f"📊 <b>Итоги опроса</b>\n\n{p['text'].split(chr(10))[0]}\n\n"
            f"{esc(p['yes'])}: <b>{y}</b> ({pct(y)})\n{esc(p['no'])}: <b>{n}</b> ({pct(n)})\n\n"
            f"Проголосовали {tot} из {p['delivered']} получивших.")
    for a in ADMINS:
        notify(a, text)


async def on_callback(cq):
    """Нажатие кнопки под опросом (из главного бота или франшизы — ответ уходит тем же ботом через CUR_TOKEN)."""
    data = cq.get("data") or ""
    if not data.startswith("pv:"):
        return await tg_call("answerCallbackQuery", callback_query_id=cq["id"])
    try:
        _, pid, ch = data.split(":")
        pid = int(pid)
    except ValueError:
        return await tg_call("answerCallbackQuery", callback_query_id=cq["id"])
    p = q1("SELECT * FROM poll WHERE id=?", pid)
    if not p or ch not in ("y", "n"):
        return await tg_call("answerCallbackQuery", callback_query_id=cq["id"], text="Опрос не найден")
    if p["done"] or now() >= p["ends"]:
        return await tg_call("answerCallbackQuery", callback_query_id=cq["id"], text="Опрос уже закончился", show_alert=True)
    uid = cq["from"]["id"]
    with A.LOCK:
        old = q1("SELECT choice FROM poll_vote WHERE pid=? AND user=?", pid, uid)
        db.execute("INSERT INTO poll_vote(pid,user,choice,ts) VALUES(?,?,?,?) ON CONFLICT(pid,user) DO UPDATE SET choice=excluded.choice, ts=excluded.ts",
                   (pid, uid, ch, now()))
    label = p["yes"] if ch == "y" else p["no"]
    await tg_call("answerCallbackQuery", callback_query_id=cq["id"], show_alert=True,
                  text=(f"Голос изменён: {label}" if old and old["choice"] != ch else f"Голос учтён: {label}") + "\nОпрос анонимный. Передумаешь — нажми другую кнопку.")


async def _ensure_webhooks():
    """Один раз: дочерним ботам — получать нажатия кнопок (callback_query)."""
    if A.kv_get("wh_cb"):
        return
    fr = __import__("franchise")
    for b in list(fr.BOTS.values()):
        if b["status"] != "on":
            continue
        r = await tg_call("setWebhook", _token=b["token"], url=f"{A.APP_URL}api/tg/{b['id']}", secret_token=b["secret"], allowed_updates=ALLOWED)
        if not r.get("ok"):
            print("poll webhook", b["id"], r, flush=True)
        await asyncio.sleep(0.2)
    with A.LOCK:
        db.execute("INSERT OR REPLACE INTO kv(k,v) VALUES('wh_cb','1')")


async def poll_loop():
    await asyncio.sleep(25)
    try:
        await _ensure_webhooks()
    except Exception as e:
        print("poll webhooks", e, flush=True)
    while True:
        try:
            for p in q("SELECT * FROM poll WHERE sent=0"):
                with tx():
                    db.execute("UPDATE poll SET sent=1 WHERE id=?", (p["id"],))
                asyncio.create_task(_send(dict(p)))
            for p in q("SELECT * FROM poll WHERE sent=1 AND done=0 AND ends<=?", now()):
                await asyncio.get_running_loop().run_in_executor(None, _finish, dict(p))
        except Exception as e:
            print("poll", e, flush=True)
        await asyncio.sleep(30)


@A.app.on_event("startup")
async def _poll_start():
    asyncio.create_task(poll_loop())
