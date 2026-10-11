#!/usr/bin/env bash
# NePridymal — запуск на Linux / macOS: ./start.sh
set -e
cd "$(dirname "$0")"
PY=""
for c in python3.13 python3.12 python3.11 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "Нужен Python 3.11+. Ubuntu/Debian: sudo apt install -y python3 python3-venv   macOS: brew install python"
  exit 1
fi
if [ ! -x venv/bin/python ]; then
  echo "Создаю окружение Python (один раз)…"
  "$PY" -m venv venv || { echo "Не хватает venv. Ubuntu/Debian: sudo apt install -y python3-venv"; exit 1; }
fi
venv/bin/python -m pip install -q --disable-pip-version-check -r requirements.txt
exec venv/bin/python run.py
