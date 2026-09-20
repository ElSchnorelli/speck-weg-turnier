#!/bin/bash
# Beendet die Badminton-App, die vorher mit ./start_server.sh gestartet wurde.
#
# Aufruf: ./stop_server.sh

ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DATEI="$ORDNER/server.pid"

if [ ! -f "$PID_DATEI" ]; then
    echo "Keine laufende App gefunden (keine server.pid-Datei)."
    exit 0
fi

PID="$(cat "$PID_DATEI")"

if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    sleep 1
fi

# Falls die Neustart-Schleife oder ein einzelner Python-Prozess noch übrig
# ist, auch diesen sauber beenden.
pkill -f "http.server 8083" 2>/dev/null

rm -f "$PID_DATEI"
echo "App gestoppt."
