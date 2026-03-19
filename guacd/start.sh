#!/bin/sh

rm -f /tmp/.X99-lock

MON_W="${MON_W:-1920}"
MON_H="${MON_H:-1080}"

echo "[guacd] Starting Xorg with two dummy monitors at ${MON_W}x${MON_H} each"

# Patch xorg.conf with the configured resolution
sed -i "s/\"1920x1080\"/\"${MON_W}x${MON_H}\"/g" /etc/X11/xorg.conf

Xorg :99 -config /etc/X11/xorg.conf -nolisten tcp -novtswitch &

# Wait up to 5 s for X to be ready
i=0
while [ $i -lt 50 ]; do
  sleep 0.1
  DISPLAY=:99 xrandr >/dev/null 2>&1 && break
  i=$((i + 1))
done

export DISPLAY=:99

echo "[guacd] Xrandr layout:"
xrandr --listmonitors 2>/dev/null || xrandr 2>/dev/null || true

exec guacd -f -l "${GUACD_PORT:-4822}" -b 0.0.0.0
