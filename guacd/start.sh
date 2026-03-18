#!/bin/sh

MON_W="${MON_W:-1920}"
MON_H="${MON_H:-1080}"
TOTAL_W="$((MON_W * 2))"

# Clean up any stale lock from a previous crash
rm -f /tmp/.X99-lock

echo "[guacd] Starting Xorg (dummy driver) at ${TOTAL_W}x${MON_H} for dual-monitor RDP"
Xorg :99 -config /etc/X11/xorg.conf -nolisten tcp -novtswitch -nolisten local &

# Wait up to 5 s for the X server to be ready
i=0
while [ $i -lt 50 ]; do
  sleep 0.1
  DISPLAY=:99 xrandr >/dev/null 2>&1 && break
  i=$((i + 1))
done

export DISPLAY=:99

# Detect the output name created by the dummy driver (typically DUMMY0)
OUTPUT=$(xrandr 2>/dev/null | awk '!/^Screen/ && /^[A-Za-z]/ { print $1; exit }')
echo "[guacd] X11 output: '${OUTPUT}'"

# Switch the output to the combined resolution.
# The modeline must be listed in xorg.conf; add a fallback --fb resize.
MODE="${TOTAL_W}x${MON_H}"
xrandr --output "$OUTPUT" --mode "$MODE" 2>/dev/null \
  || xrandr --output "$OUTPUT" --fb "$MODE" 2>/dev/null \
  || true

MON_W_MM="$(( MON_W * 265 / 1000 ))"
MON_H_MM="$(( MON_H * 265 / 1000 ))"

# Remove the auto-created single monitor so we can replace it with two.
xrandr --delmonitor "$OUTPUT" 2>/dev/null || true

# Create two explicit half-width monitors:
#   LeftMonitor  — backed by DUMMY0 (left half)
#   RightMonitor — software-only monitor (right half, 'none' output)
xrandr --setmonitor LeftMonitor  "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+0+0"        "$OUTPUT" 2>&1 || true
xrandr --setmonitor RightMonitor "${MON_W}/${MON_W_MM}x${MON_H}/${MON_H_MM}+${MON_W}+0" none      2>&1 || true

echo "[guacd] RandR monitor layout:"
xrandr --listmonitors

exec guacd -f -l "${GUACD_PORT:-4822}" -b 0.0.0.0
