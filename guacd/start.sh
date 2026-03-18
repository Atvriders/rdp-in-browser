#!/bin/bash
set -e

# Per-monitor dimensions (override in docker-compose with MON_W / MON_H)
MON_W="${MON_W:-1920}"
MON_H="${MON_H:-1080}"
TOTAL_W="$((MON_W * 2))"

echo "[guacd] Starting virtual dual-monitor display ${TOTAL_W}x${MON_H} (2 × ${MON_W}x${MON_H})"

# Start Xvfb with the combined resolution
Xvfb :99 -screen 0 "${TOTAL_W}x${MON_H}x24" -ac &

# Wait until X is ready
for i in $(seq 1 30); do
  DISPLAY=:99 xdpyinfo >/dev/null 2>&1 && break
  sleep 0.1
done

export DISPLAY=:99

# Physical size in mm at 96 DPI (1 px = 0.2646 mm)
MON_W_MM="$(( MON_W * 265 / 1000 ))"
MON_H_MM="$(( MON_H * 265 / 1000 ))"

# Create two RandR 1.5 software monitors side by side.
# The first is pinned to the "default" output; the second is free-standing.
xrandr --setmonitor LeftMonitor  "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+0+0"        default
xrandr --setmonitor RightMonitor "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+${MON_W}+0" none

echo "[guacd] RandR monitor layout:"
xrandr --listmonitors

# Hand off to guacd (foreground, inherits DISPLAY so FreeRDP picks up monitors)
exec /usr/sbin/guacd -f -l "${GUACD_PORT:-4822}" -b 0.0.0.0
