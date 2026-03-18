#!/bin/sh
# Alpine uses /bin/sh (busybox ash), not bash

MON_W="${MON_W:-1920}"
MON_H="${MON_H:-1080}"
TOTAL_W="$((MON_W * 2))"

echo "[guacd] Starting Xvfb at ${TOTAL_W}x${MON_H} for dual-monitor RDP"

# Start virtual X display with combined width
Xvfb :99 -screen 0 "${TOTAL_W}x${MON_H}x24" -ac &

# Wait up to 3 s for Xvfb to be ready (use xrandr as the probe)
i=0
while [ $i -lt 30 ]; do
  sleep 0.1
  DISPLAY=:99 xrandr >/dev/null 2>&1 && break
  i=$((i + 1))
done

export DISPLAY=:99

# Physical size in mm at 96 DPI
MON_W_MM="$(( MON_W * 265 / 1000 ))"
MON_H_MM="$(( MON_H * 265 / 1000 ))"

# Create two RandR 1.5 software monitors side by side.
# Non-fatal: if Xvfb's RandR version doesn't support --setmonitor,
# guacd still starts (just without the dual-monitor hint to FreeRDP).
xrandr --setmonitor LeftMonitor  "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+0+0"        default 2>/dev/null || true
xrandr --setmonitor RightMonitor "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+${MON_W}+0" none    2>/dev/null || true

echo "[guacd] RandR monitor layout:"
xrandr --listmonitors 2>/dev/null || true

exec /usr/sbin/guacd -f -l "${GUACD_PORT:-4822}" -b 0.0.0.0
