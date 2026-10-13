"""Переводы звёзд между игроками (экран «Кошелёк» в стиле WeChat): свой QR «Получить», сканер, перевод по QR/поиску.
QR и ссылка ведут на бота: t.me/<бот>?start=pay_<id>[_<сумма>] → кнопка открывает игру с ?pay=<id>&amt=<сумма>.
Получатель получает ровно сумму перевода, комиссия (как в обменах) списывается с отправителя сверху и уходит в банк."""
import asyncio
import hashlib
import hmac
import json
import math
import secrets

from fastapi import Depends, Request

import loans
import app as A
from app import BOT_NAME, R, app, auth, bal, db, err, esc, event, kv_get, notify, now, q, q1, tg_call, tx, user_brief
from settings import conf

# настройки: по умолчанию из settings.toml, владелец меняет на лету в админке (вкладка «Переводы», хранится в kv 'paycfg')
DEFAULTS = {
    "on": True,
    "fee": conf("economy.transfer_fee", conf("economy.trade_fee", 0.05)),
    "min": conf("economy.transfer_min", 10),
    "max": conf("economy.transfer_max", 0),            # один перевод не больше (0 — без ограничения)
    "day": conf("economy.transfer_day_count", 50),     # переводов в сутки с одного аккаунта
}
LIMITS = {"fee": (0, 0.5), "min": (1, 10 ** 7), "max": (0, 10 ** 10), "day": (1, 1000)}
CFG = {}
NOTE_MAX = 60


def _load():
    try:
        v = json.loads(kv_get("paycfg", "{}") or "{}")
        CFG.clear()
        CFG.update({k: x for k, x in v.items() if k in DEFAULTS})
    except Exception as e:
        print("paycfg:", e, flush=True)


def cfg(k):
    return CFG.get(k, DEFAULTS[k])


_load()

db.executescript("""
CREATE TABLE IF NOT EXISTS transfers(id INTEGER PRIMARY KEY, src INTEGER, dst INTEGER, amount INTEGER, fee INTEGER, note TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS transfers_src ON transfers(src, ts);
CREATE INDEX IF NOT EXISTS transfers_dst ON transfers(dst, ts);
CREATE TABLE IF NOT EXISTS pay_pin(user INTEGER PRIMARY KEY, hash TEXT, salt TEXT, ts INTEGER, fails INTEGER DEFAULT 0, lock INTEGER DEFAULT 0,
  code TEXT, code_until INTEGER DEFAULT 0, code_fails INTEGER DEFAULT 0, code_ts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS pay_addr(user INTEGER PRIMARY KEY, addr TEXT UNIQUE NOT NULL, ts INTEGER);
""")

# ---------------- адрес кошелька (как в крипте): NP + 16 случайных символов + 4 символа контрольной суммы ----------------
# Случайный, а не из id: по адресу не узнать Telegram-аккаунт, подобрать чужой нельзя (80 бит). Контрольная сумма ловит опечатки.
ADDR_ABC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"   # base32 Крокфорда: без I, L, O, U — их не спутать


def _addr_sum(body):
    h = hashlib.sha256(("np:" + body).encode()).digest()
    return "".join(ADDR_ABC[b % 32] for b in h[:4])


def addr_norm(s):
    """Приводим ввод к виду NP…: регистр, пробелы/дефисы, O→0, I/L→1. None — если это не похоже на адрес."""
    s = "".join(str(s or "").upper().split()).replace("-", "").translate(str.maketrans("OIL", "011"))
    if not (len(s) == 22 and s.startswith("NP") and all(c in ADDR_ABC for c in s[2:])):
        return None
    return s


def addr_of(uid):
    r = q1("SELECT addr FROM pay_addr WHERE user=?", uid)
    if r:
        return r["addr"]
    while True:
        body = "".join(secrets.choice(ADDR_ABC) for _ in range(16))
        a = "NP" + body + _addr_sum(body)
        with tx():
            r = q1("SELECT addr FROM pay_addr WHERE user=?", uid)
            if r:
                return r["addr"]
            if not q1("SELECT 1 FROM pay_addr WHERE addr=?", a):
                db.execute("INSERT INTO pay_addr(user,addr,ts) VALUES(?,?,?)", (uid, a, now()))
                return a

# ---------------- пароль кошелька (6 цифр, как в WeChat): без него переводы не проходят ----------------
# Храним только PBKDF2-хэш с солью. 5 неверных подряд — блок переводов на 15 минут. Забыл — бот присылает код сброса в личку.
PIN_ITER, PIN_FAILS, PIN_LOCK = 120_000, 5, 15 * 60
CODE_TTL, CODE_FAILS, CODE_EVERY = 10 * 60, 5, 60
WEAK = {"000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999",
        "123456", "654321", "012345", "543210", "123123", "112233"}


def _hash(pin, salt):
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), PIN_ITER).hex()


def _pin_ok(pin):
    return isinstance(pin, str) and len(pin) == 6 and pin.isdigit()


def has_pin(uid):
    r = q1("SELECT hash FROM pay_pin WHERE user=?", uid)
    return bool(r and r["hash"])


async def _set_pin(uid, pin):
    if not _pin_ok(pin):
        err("пароль — 6 цифр")
    if pin in WEAK:
        err("слишком простой пароль — придумай другой")
    salt = secrets.token_hex(16)
    h = await asyncio.to_thread(_hash, pin, salt)   # PBKDF2 ~0,1 с — не держим цикл событий
    with tx():
        db.execute("INSERT INTO pay_pin(user,hash,salt,ts,fails,lock,code,code_until,code_fails) VALUES(?,?,?,?,0,0,NULL,0,0) "
                   "ON CONFLICT(user) DO UPDATE SET hash=excluded.hash, salt=excluded.salt, ts=excluded.ts, fails=0, lock=0, code=NULL, code_until=0, code_fails=0",
                   (uid, h, salt, now()))


async def check_pin(uid, pin):
    """Неверный пароль считает попытку и бросает err() — уже ПОСЛЕ записи счётчика (иначе tx откатил бы его)."""
    r = q1("SELECT * FROM pay_pin WHERE user=?", uid)
    if not r or not r["hash"]:
        err("сначала задай пароль кошелька")
    t = now()
    if r["lock"] > t:
        err(f"слишком много неверных попыток — переводы снова через {(r['lock'] - t + 59) // 60} мин")
    ok = _pin_ok(pin) and hmac.compare_digest(await asyncio.to_thread(_hash, pin, r["salt"]), r["hash"])
    with tx():
        if ok:
            db.execute("UPDATE pay_pin SET fails=0 WHERE user=?", (uid,))
        else:
            fails = (q1("SELECT fails FROM pay_pin WHERE user=?", uid)["fails"] or 0) + 1
            if fails >= PIN_FAILS:
                db.execute("UPDATE pay_pin SET fails=0, lock=? WHERE user=?", (t + PIN_LOCK, uid))
            else:
                db.execute("UPDATE pay_pin SET fails=? WHERE user=?", (fails, uid))
    if not ok:
        if fails >= PIN_FAILS:
            err(f"неверный пароль — переводы заблокированы на {PIN_LOCK // 60} минут")
        err(f"неверный пароль, осталось попыток: {PIN_FAILS - fails}")


def _fee(amount):
    return math.ceil(amount * cfg("fee"))


def _brief(uid):
    u = q1("SELECT * FROM users WHERE id=?", uid)
    return user_brief(u) if u else None


@app.get(R + "/pay")
def pay_home(uid=Depends(auth)):
    rows = q("SELECT * FROM transfers WHERE src=? OR dst=? ORDER BY id DESC LIMIT 30", uid, uid)
    peers = {}
    out = []
    for r in rows:
        other = r["dst"] if r["src"] == uid else r["src"]
        if other not in peers:
            peers[other] = _brief(other)
        if peers[other]:
            out.append({"in": r["dst"] == uid, "amount": r["amount"], "fee": r["fee"], "note": r["note"], "ts": r["ts"], "user": peers[other]})
    wk = now() - 7 * 86400
    week = {"in": q1("SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE dst=? AND ts>=?", uid, wk)["s"],
            "out": q1("SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE src=? AND ts>=?", uid, wk)["s"]}
    return {"stars": bal(uid), "week": week, "fee": cfg("fee"), "min": cfg("min"), "max": cfg("max"), "on": cfg("on"), "link": f"https://t.me/{BOT_NAME}?start=pay_{uid}", "history": out, "pin": has_pin(uid), "addr": addr_of(uid)}


@app.get(R + "/pay/peer/{tid}")
def pay_peer(tid: int, uid=Depends(auth)):
    if tid == uid:
        err("это твой QR-код — дай его отсканировать другу")
    u = q1("SELECT * FROM users WHERE id=?", tid)
    if not u or u["banned"]:
        err("игрок не найден")
    return user_brief(u)


@app.get(R + "/pay/addr/{a}")
def pay_addr(a: str, uid=Depends(auth)):
    n = addr_norm(a)
    if not n:
        err("это не адрес кошелька: он начинается с NP и состоит из 22 символов")
    if _addr_sum(n[2:18]) != n[18:]:
        err("в адресе опечатка — проверь символы")
    r = q1("SELECT user FROM pay_addr WHERE addr=?", n)
    if not r:
        err("кошелёк с таким адресом не найден")
    if r["user"] == uid:
        err("это твой адрес — дай его другу")
    u = q1("SELECT * FROM users WHERE id=?", r["user"])
    if not u or u["banned"]:
        err("кошелёк с таким адресом не найден")
    return user_brief(u)


@app.post(R + "/pay/send")
async def pay_send(req: Request, uid=Depends(auth)):
    b = await req.json()
    try:
        to, amount = int(b.get("to", 0)), int(b.get("amount", 0))
    except (TypeError, ValueError):
        err("введи сумму")
    note = " ".join(str(b.get("note", "")).split())[:NOTE_MAX]
    if to == uid:
        err("себе перевести нельзя")
    if not cfg("on"):
        err("Переводы временно отключены")
    if amount < cfg("min"):
        err(f"минимум {cfg('min')} ⭐")
    if cfg("max") and amount > cfg("max"):
        err(f"за один раз не больше {cfg('max'):,} ⭐".replace(",", " "))
    await check_pin(uid, str(b.get("pin", "")))
    fee = _fee(amount)
    with tx():
        dst = q1("SELECT id, banned FROM users WHERE id=?", to)
        if not dst or dst["banned"]:
            err("игрок не найден")
        if loans.stars_locked(uid):
            err("пока не закрыт кредит без залога или баланс в минусе, переводить звёзды нельзя")
        if q1("SELECT COUNT(*) n FROM transfers WHERE src=? AND ts>?", uid, now() - 86400)["n"] >= cfg("day"):
            err(f"не больше {cfg('day')} переводов в сутки")
        if bal(uid) < amount + fee:
            err(f"Не хватает звёзд: нужно {amount + fee} ⭐ с комиссией")
        db.execute("UPDATE users SET stars=stars-? WHERE id=?", (amount + fee, uid))
        db.execute("UPDATE users SET stars=stars+? WHERE id=?", (amount, to))
        event(uid, "transfer", -amount)
        if fee:
            event(uid, "fee", -fee)
        event(to, "transfer", amount)
        db.execute("INSERT INTO transfers(src,dst,amount,fee,note,ts) VALUES(?,?,?,?,?,?)", (uid, to, amount, fee, note, now()))
        name = q1("SELECT name FROM users WHERE id=?", uid)["name"]
        left = bal(uid)
    notify(to, f"💸 Перевод от <b>{esc(name)}</b>: <b>{amount:,} ⭐</b>".replace(",", " ") + (f"\n\n<i>«{esc(note)}»</i>" if note else ""))
    return {"ok": True, "stars": left, "amount": amount, "fee": fee}


@app.post(R + "/pay/pin")
async def pin_set(req: Request, uid=Depends(auth)):
    """Задать пароль (первый раз) или сменить (нужен старый)."""
    b = await req.json()
    if has_pin(uid):
        await check_pin(uid, str(b.get("old", "")))
    await _set_pin(uid, str(b.get("pin", "")))
    return {"ok": True}


@app.post(R + "/pay/pin/forgot")
async def pin_forgot(uid=Depends(auth)):
    """Код сброса — ботом в личку (аккаунт Telegram = личность игрока)."""
    t = now()
    r = q1("SELECT code_ts FROM pay_pin WHERE user=?", uid)
    if r and t - (r["code_ts"] or 0) < CODE_EVERY:
        err("код уже отправлен — проверь сообщения от бота (повторно — через минуту)")
    code = f"{secrets.randbelow(10 ** 6):06d}"
    res = await tg_call("sendMessage", chat_id=uid, parse_mode="HTML",
                        text=f"🔐 Код для сброса пароля кошелька: <b>{code}</b>\n\nДействует 10 минут. Никому его не сообщай — администрация никогда его не спрашивает.")
    if not res.get("ok"):
        err("бот не смог написать — открой чат с ботом, нажми «Старт» и попробуй снова")
    with tx():
        db.execute("INSERT INTO pay_pin(user,code,code_until,code_fails,code_ts) VALUES(?,?,?,0,?) "
                   "ON CONFLICT(user) DO UPDATE SET code=excluded.code, code_until=excluded.code_until, code_fails=0, code_ts=excluded.code_ts",
                   (uid, hashlib.sha256(code.encode()).hexdigest(), t + CODE_TTL, t))
    return {"ok": True}


@app.post(R + "/pay/pin/reset")
async def pin_reset(req: Request, uid=Depends(auth)):
    b = await req.json()
    code, t = str(b.get("code", "")), now()
    r = q1("SELECT code, code_until, code_fails FROM pay_pin WHERE user=?", uid)
    if not r or not r["code"] or r["code_until"] < t:
        err("код устарел — запроси новый")
    if r["code_fails"] >= CODE_FAILS:
        err("слишком много неверных кодов — запроси новый")
    if not hmac.compare_digest(hashlib.sha256(code.encode()).hexdigest(), r["code"]):
        with tx():
            db.execute("UPDATE pay_pin SET code_fails=code_fails+1 WHERE user=?", (uid,))
        err("неверный код")
    await _set_pin(uid, str(b.get("pin", "")))   # заодно стирает код и снимает блокировку
    return {"ok": True}


@app.post(R + "/pay/qr/send")
async def qr_send(req: Request, uid=Depends(auth)):
    """Постоянный QR для печати: картинку рисует телефон (PNG), бот присылает её игроку в чат — оттуда печатать/сохранять."""
    data = await req.body()
    if not 1000 < len(data) < 3 * 1024 * 1024 or not data.startswith(b"\x89PNG"):
        err("не получилось сделать картинку")
    r = await A.http.post(f"https://api.telegram.org/bot{A.TOKEN}/sendDocument", timeout=60,
                          data={"chat_id": str(uid), "caption": "🧾 Твой постоянный QR для приёма звёзд — его можно распечатать. Он не меняется."},
                          files={"document": ("qr-oplata.png", data, "image/png")})
    if not r.json().get("ok"):
        err("бот не смог написать — открой чат с ботом и нажми «Старт»")
    return {"ok": True}


# ---------------- админка: переводы игрока (в карточке игрока) ----------------
def _admin_routes():
    from admin import OWNERS, admin, log

    @app.get(R + "/admin/pay")
    def admin_pay(aid=Depends(admin)):
        since = now() - 7 * 86400
        st = q1("SELECT COUNT(*) n, COALESCE(SUM(amount),0) s, COALESCE(SUM(fee),0) f, COUNT(DISTINCT src) u FROM transfers WHERE ts>=?", since)
        top = q("SELECT src, dst, SUM(amount) s, COUNT(*) n FROM transfers WHERE ts>=? GROUP BY src, dst ORDER BY s DESC LIMIT 10", since)
        recent = q("SELECT * FROM transfers ORDER BY id DESC LIMIT 40")
        peers = {}
        b = lambda i: peers.setdefault(i, _brief(i))
        return {"cfg": {k: cfg(k) for k in DEFAULTS}, "defaults": DEFAULTS, "changed": list(CFG), "canEdit": aid in OWNERS,
                "week": {"n": st["n"], "sum": st["s"], "fee": st["f"], "users": st["u"]},
                "top": [{"a": b(r["src"]), "b": b(r["dst"]), "sum": r["s"], "n": r["n"]} for r in top if b(r["src"]) and b(r["dst"])],
                "recent": [{"a": b(r["src"]), "b": b(r["dst"]), "amount": r["amount"], "note": r["note"], "ts": r["ts"]}
                           for r in recent if b(r["src"]) and b(r["dst"])]}

    @app.post(R + "/admin/pay")
    async def admin_pay_set(req: Request, aid=Depends(admin)):
        if aid not in OWNERS:
            err("Менять настройки переводов может только владелец")
        body = await req.json()
        if not isinstance(body, dict):
            err("неверные данные")
        cur = dict(CFG)
        for k, v in body.items():
            if k not in DEFAULTS:
                continue
            if v is None:
                cur.pop(k, None)
            elif k == "on":
                cur[k] = v in (True, 1, "1", "true")
            else:
                try:
                    v = round(float(v), 4) if k == "fee" else int(v)
                except (TypeError, ValueError):
                    err("введи число")
                lo, hi = LIMITS[k]
                if not lo <= v <= hi:
                    err("недопустимое значение")
                cur[k] = v
        with tx():
            db.execute("INSERT INTO kv(k,v) VALUES('paycfg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (json.dumps(cur),))
            log(aid, "paycfg", None, ", ".join(f"{k}={cur.get(k, DEFAULTS[k])}" for k in DEFAULTS))
        CFG.clear()
        CFG.update(cur)
        return {"ok": True}

    @app.get(R + "/admin/user/{tid}/transfers")
    def admin_transfers(tid: int, aid=Depends(admin)):
        rows = q("SELECT * FROM transfers WHERE src=? OR dst=? ORDER BY id DESC LIMIT 50", tid, tid)
        sent = q1("SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE src=?", tid)["s"]
        got = q1("SELECT COALESCE(SUM(amount),0) s FROM transfers WHERE dst=?", tid)["s"]
        peers, out = {}, []
        for r in rows:
            other = r["dst"] if r["src"] == tid else r["src"]
            if other not in peers:
                peers[other] = _brief(other)
            if peers[other]:
                out.append({"in": r["dst"] == tid, "amount": r["amount"], "note": r["note"], "ts": r["ts"], "user": peers[other]})
        return {"sent": sent, "got": got, "list": out}


_admin_routes()
