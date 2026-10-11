"""Подробный журнал действий: каждый POST к API — кто, что нажал, с какими параметрами, ответ (код и текст ошибки),
время обработки и баланс сразу после. Пишется пачками в отдельную базу logs.db (не раздувает game.db и бэкапы),
хранится KEEP_DAYS дней. Читать: GET /admin/actlog?user=…&path=…&limit=… (только админы)."""
import asyncio
import os
import sqlite3
import threading
import time
from collections import deque

from fastapi import Depends, Request
from fastapi.responses import Response

from app import DB_PATH, R, app
from admin import admin

KEEP_DAYS = 10
LOG_DB = os.path.join(os.path.dirname(os.path.abspath(DB_PATH)), "logs.db")
ldb = sqlite3.connect(LOG_DB, check_same_thread=False, isolation_level=None)
ldb.execute("PRAGMA journal_mode=WAL")
ldb.execute("PRAGMA synchronous=NORMAL")
ldb.executescript("""
CREATE TABLE IF NOT EXISTS actlog(id INTEGER PRIMARY KEY, ts REAL, user INTEGER, path TEXT, body TEXT, status INTEGER, ms INTEGER, stars INTEGER, err TEXT);
CREATE INDEX IF NOT EXISTS actlog_user ON actlog(user, ts);
CREATE INDEX IF NOT EXISTS actlog_ts ON actlog(ts);
""")
LLOCK = threading.Lock()
# баланс читаем отдельным соединением только на чтение — не вмешиваемся в транзакции игры
rdb = sqlite3.connect(f"file:{os.path.abspath(DB_PATH)}?mode=ro", uri=True, check_same_thread=False)
RLOCK = threading.Lock()
BUF = deque(maxlen=50_000)


@app.middleware("http")
async def _actlog(request: Request, call_next):
    if request.method != "POST" or not request.url.path.startswith(R):
        return await call_next(request)
    body = (await request.body())[:400].decode("utf-8", "replace")
    t0 = time.time()
    resp = await call_next(request)
    ms = int((time.time() - t0) * 1000)
    uid = getattr(request.state, "uid", None)
    detail = ""
    if resp.status_code >= 400:   # текст ошибки — для разбора жалоб («не даёт ставить» и т. п.)
        raw = b"".join([c async for c in resp.body_iterator])
        detail = raw[:200].decode("utf-8", "replace")
        resp = Response(raw, status_code=resp.status_code, headers=dict(resp.headers), media_type=resp.media_type)
    stars = None
    if uid:
        try:
            with RLOCK:
                r = rdb.execute("SELECT stars FROM users WHERE id=?", (uid,)).fetchone()
            stars = r[0] if r else None
        except Exception:
            pass
    BUF.append((t0, uid, request.url.path[len(R):], body, resp.status_code, ms, stars, detail))
    return resp


def _flush():
    rows = []
    while BUF:
        rows.append(BUF.popleft())
    if rows:
        with LLOCK:
            ldb.execute("BEGIN")
            ldb.executemany("INSERT INTO actlog(ts,user,path,body,status,ms,stars,err) VALUES(?,?,?,?,?,?,?,?)", rows)
            ldb.execute("COMMIT")


def _prune():
    with LLOCK:
        ldb.execute("DELETE FROM actlog WHERE ts<?", (time.time() - KEEP_DAYS * 86400,))


async def _loop():
    n = 0
    while True:
        await asyncio.sleep(3)
        try:
            await asyncio.get_running_loop().run_in_executor(None, _flush)
            n += 1
            if n % 1200 == 1:   # раз в час
                await asyncio.get_running_loop().run_in_executor(None, _prune)
        except Exception as e:
            print("actlog:", e, flush=True)


@app.on_event("startup")
async def _start():
    asyncio.create_task(_loop())


@app.on_event("shutdown")
def _stop():
    _flush()


@app.get(R + "/admin/actlog")
def actlog(user: int = 0, path: str = "", hours: float = 24, limit: int = 300, aid=Depends(admin)):
    _flush()
    sql, args = "SELECT * FROM actlog WHERE ts>?", [time.time() - hours * 3600]
    if user:
        sql += " AND user=?"
        args.append(user)
    if path:
        sql += " AND path LIKE ?"
        args.append("%" + path.strip("/") + "%")
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(max(1, min(limit, 5000)))
    with LLOCK:
        cur = ldb.execute(sql, args)
        cols = [c[0] for c in cur.description]
        return {"rows": [dict(zip(cols, r)) for r in cur.fetchall()]}
