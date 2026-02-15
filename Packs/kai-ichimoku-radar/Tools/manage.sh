#!/bin/bash
# IchimokuRadar Management Script

SKILL_DIR="${PAI_DIR:-$HOME/.claude}/skills/IchimokuRadar"
PID_FILE="$SKILL_DIR/.server.pid"
LOG_FILE="$SKILL_DIR/.server.log"
PORT=5181

start() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "IchimokuRadar is already running (PID: $PID)"
            echo "Dashboard: http://localhost:$PORT"
            return 0
        fi
    fi

    echo "Starting IchimokuRadar..."
    cd "$SKILL_DIR"
    nohup bun run src/server.ts > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    sleep 3

    if ps -p $(cat "$PID_FILE") > /dev/null 2>&1; then
        echo "IchimokuRadar started successfully"
        echo ""
        echo "  Dashboard: http://localhost:$PORT"
        echo ""
    else
        echo "Failed to start IchimokuRadar"
        echo "Check logs: $LOG_FILE"
        return 1
    fi
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "IchimokuRadar is not running"
        return 0
    fi

    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Stopping IchimokuRadar (PID: $PID)..."
        kill "$PID"
        rm -f "$PID_FILE"
        echo "IchimokuRadar stopped"
    else
        echo "IchimokuRadar is not running (stale PID file)"
        rm -f "$PID_FILE"
    fi
}

status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "IchimokuRadar is running (PID: $PID)"
            echo "Dashboard: http://localhost:$PORT"
            return 0
        fi
    fi
    echo "IchimokuRadar is not running"
    return 1
}

restart() {
    stop
    sleep 1
    start
}

logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

case "$1" in
    start) start ;;
    stop) stop ;;
    status) status ;;
    restart) restart ;;
    logs) logs ;;
    *)
        echo "IchimokuRadar - Ichimoku Signal Dashboard"
        echo ""
        echo "Usage: $0 {start|stop|status|restart|logs}"
        ;;
esac
