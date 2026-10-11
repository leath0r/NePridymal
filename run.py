"""Запуск NePridymal одной командой (Windows / Linux / macOS).

Первый запуск спросит токен бота (и, по желанию, твой Telegram ID для админки) и сохранит их в .env.
Дальше: поднимает бесплатный HTTPS-туннель Cloudflare (Telegram открывает игру только по https),
собирает фронтенд, ставит боту кнопку «Играть» и запускает сервер. Остановить — Ctrl+C.

Свой домен с HTTPS? Впиши в .env PUBLIC_URL=https://твой-домен (сервер слушает 127.0.0.1:PORT) — туннель не нужен.
"""
import atexit
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(ROOT, ".env")
DATA = os.path.join(ROOT, "data")
BIN = os.path.join(ROOT, "bin")


def say(msg):
    print(msg, flush=True)


def load_env():
    env = {}
    if os.path.exists(ENV):
        for line in open(ENV, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def save_env(env):
    with open(ENV, "w", encoding="utf-8") as f:
        f.write("# Настройки запуска NePridymal (не выкладывай этот файл — тут токен бота)\n")
        for k, v in env.items():
            f.write(f"{k}={v}\n")
    try:
        os.chmod(ENV, 0o600)
    except OSError:
        pass


def tg(token, method, **params):
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=json.dumps(params).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def setup(env):
    """Спрашиваем токен (пока не подойдёт) и ID админа."""
    while True:
        token = env.get("BOT_TOKEN") or input("\nВставь токен бота от @BotFather и нажми Enter:\n> ").strip()
        try:
            me = tg(token, "getMe")["result"]
            env["BOT_TOKEN"], env["BOT_USERNAME"] = token, me["username"]
            say(f"Бот найден: @{me['username']}")
            break
        except Exception:
            say("Токен не подошёл (или нет интернета). Проверь и вставь ещё раз.")
            env.pop("BOT_TOKEN", None)
    if "ADMIN_IDS" not in env:
        a = input("\nТвой Telegram ID для админ-панели (узнать у @userinfobot). Enter — пропустить:\n> ").strip()
        env["ADMIN_IDS"] = ",".join(x for x in re.split(r"[ ,;]+", a) if x.isdigit())
    env.setdefault("PORT", "8795")
    env.setdefault("PUBLIC_URL", "")
    save_env(env)
    return env


# ---------------- туннель Cloudflare ----------------
def cloudflared_path():
    sysname, arch = platform.system().lower(), platform.machine().lower()
    arch = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(arch, "arm" if arch.startswith("arm") else "386")
    exe = os.path.join(BIN, "cloudflared.exe" if sysname == "windows" else "cloudflared")
    if os.path.exists(exe):
        return exe
    found = shutil.which("cloudflared")
    if found:
        return found
    os.makedirs(BIN, exist_ok=True)
    base = "https://github.com/cloudflare/cloudflared/releases/latest/download/"
    name = {"windows": f"cloudflared-windows-{arch}.exe", "linux": f"cloudflared-linux-{arch}", "darwin": f"cloudflared-darwin-{arch}.tgz"}.get(sysname)
    if not name:
        sys.exit(f"Не знаю, где взять cloudflared для {sysname}. Поставь его сам: https://github.com/cloudflare/cloudflared")
    say(f"Скачиваю cloudflared ({name}) — один раз…")
    tmp = exe + ".part"
    urllib.request.urlretrieve(base + name, tmp)
    if name.endswith(".tgz"):
        with tarfile.open(tmp) as t:
            t.extract("cloudflared", BIN)
        os.remove(tmp)
    else:
        os.replace(tmp, exe)
    os.chmod(exe, os.stat(exe).st_mode | stat.S_IEXEC)
    return exe


def start_tunnel(port):
    exe = cloudflared_path()
    say("Поднимаю HTTPS-туннель…")
    p = subprocess.Popen([exe, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    atexit.register(p.terminate)
    url, deadline = None, time.time() + 90
    while time.time() < deadline:
        line = p.stdout.readline()
        if not line:
            if p.poll() is not None:
                break
            continue
        m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
        if m:
            url = m.group(0)
            break
    if not url:
        sys.exit("Не удалось поднять туннель Cloudflare. Проверь интернет и запусти снова.")
    threading.Thread(target=lambda: [None for _ in p.stdout], daemon=True).start()   # читаем лог, чтобы туннель не встал
    return url


def main():
    if sys.version_info < (3, 11):
        sys.exit("Нужен Python 3.11 или новее.")
    env = setup(load_env())
    port = int(env.get("PORT") or 8795)
    public = env.get("PUBLIC_URL", "").rstrip("/") or start_tunnel(port)
    app_url = public + "/np/"

    say("Собираю фронтенд…")
    subprocess.check_call([sys.executable, os.path.join(ROOT, "build.py")])

    os.makedirs(DATA, exist_ok=True)
    os.environ.update({
        "BOT_TOKEN": env["BOT_TOKEN"], "BOT_USERNAME": env["BOT_USERNAME"], "ADMIN_IDS": env.get("ADMIN_IDS", ""),
        "APP_URL": app_url, "SERVE_WEB": "1", "WEB_DIR": os.path.join(ROOT, "web"),
        "DB_PATH": os.environ.get("DB_PATH") or os.path.join(DATA, "game.db"),
        "SETTINGS": os.path.join(ROOT, "settings.toml"),
    })
    server = os.path.join(ROOT, "server")
    os.chdir(server)
    sys.path.insert(0, server)
    say(f"\nИгра запущена: {app_url}\nОткрой бота @{env['BOT_USERNAME']} в Telegram → кнопка «Играть».\n"
        "Окно не закрывай — пока оно открыто, игра работает. Остановить — Ctrl+C.\n")
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=port, workers=1, log_level="warning")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        say("\nОстановлено.")
