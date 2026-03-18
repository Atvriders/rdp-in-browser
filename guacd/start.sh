#!/bin/sh
# Alpine uses /bin/sh (busybox ash)

MON_W="${MON_W:-1920}"
MON_H="${MON_H:-1080}"
TOTAL_W="$((MON_W * 2))"

echo "[guacd] Starting Xvfb at ${TOTAL_W}x${MON_H} for dual-monitor RDP"

Xvfb :99 -screen 0 "${TOTAL_W}x${MON_H}x24" -ac &

# Wait up to 3 s for Xvfb to be ready
i=0
while [ $i -lt 30 ]; do
  sleep 0.1
  DISPLAY=:99 xrandr >/dev/null 2>&1 && break
  i=$((i + 1))
done

export DISPLAY=:99

# Detect the actual output name (Xvfb typically uses "screen", not "default")
OUTPUT=$(xrandr 2>/dev/null | awk '!/^Screen/ && /^[A-Za-z]/ { print $1; exit }')
echo "[guacd] X11 output detected: '${OUTPUT}'"

MON_W_MM="$(( MON_W * 265 / 1000 ))"
MON_H_MM="$(( MON_H * 265 / 1000 ))"

# Create two RandR 1.5 software monitors side by side.
# Non-fatal: guacd still starts if monitor setup fails.
if [ -n "$OUTPUT" ]; then
  xrandr --setmonitor LeftMonitor  "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+0+0"        "$OUTPUT" 2>&1 || true
  xrandr --setmonitor RightMonitor "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+${MON_W}+0" none      2>&1 || true
fi

echo "[guacd] RandR monitor layout:"
xrandr --listmonitors 2>/dev/null || true

# guacamole-server on Alpine installs guacd to /usr/local/sbin
export PATH="/usr/local/sbin:/usr/sbin:$PATH"
exec guacd -f -l "${GUACD_PORT:-4822}" -b 0.0.0.0
