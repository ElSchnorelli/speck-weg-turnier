#!/bin/bash
# Startet die Badminton-App (Speck-weg-Turnier) dauerhaft im Hintergrund.
#
# Danach ist sie im Browser erreichbar unter: http://<servername>:8083
# Läuft weiter, auch wenn du das Terminal schließt. Stürzt die App mal ab,
# startet dieses Skript sie automatisch nach 2 Sekunden neu.
#
# Aufruf: ./start_server.sh

ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ORDNER" || exit 1

PID_DATEI="$ORDNER/server.pid"
LOG_DATEI="$ORDNER/server.log"

if [ -f "$PID_DATEI" ] && kill -0 "$(cat "$PID_DATEI")" 2>/dev/null; then
    echo "Die App läuft schon (Prozess-ID $(cat "$PID_DATEI"))."
    echo "Falls du sie neu starten willst, erst ./stop_server.sh ausführen."
    exit 0
fi

# Neustart-Schleife: läuft im Hintergrund weiter (nohup), startet die App
# bei einem Absturz automatisch neu. Badminton ist eine reine
# HTML/CSS/JS-App, deshalb reicht Python's eingebauter Webserver.
nohup bash -c '
    while true; do
        python3 -m http.server 8083 --bind 0.0.0.0
        echo "--- App beendet, starte in 2 Sekunden neu ---"
        sleep 2
    done
' >> "$LOG_DATEI" 2>&1 &

echo $! > "$PID_DATEI"
sleep 2

if kill -0 "$(cat "$PID_DATEI")" 2>/dev/null; then
    echo "App gestartet (Prozess-ID $(cat "$PID_DATEI"))."
    echo "Erreichbar im Browser unter: http://<servername>:8083"
    echo "Log-Datei: $LOG_DATEI"
else
    echo "Start ist fehlgeschlagen. Schau in $LOG_DATEI nach der Fehlermeldung."
    exit 1
fi
