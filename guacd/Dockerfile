FROM guacamole/guacd:1.5.0

USER root

# Use xorg-server + dummy driver instead of Xvfb — the dummy driver
# creates a real DUMMY0 output with full RandR 1.5 support, which lets
# xrandr --setmonitor create two proper software monitors that FreeRDP
# enumerates via XRRGetMonitors.
RUN apk add --no-cache \
        xorg-server \
        xf86-video-dummy \
        xrandr

# Find the guacd binary (installed to /opt/guacamole/sbin on Alpine)
# and symlink it so `exec guacd` works from anywhere.
RUN GUACD_REAL=$(find /opt /usr -name guacd -type f 2>/dev/null | head -1) \
    && echo "guacd found at: $GUACD_REAL" \
    && ln -sf "$GUACD_REAL" /usr/local/bin/guacd

COPY xorg.conf /etc/X11/xorg.conf
COPY start.sh  /usr/local/bin/start-guacd.sh
RUN chmod +x /usr/local/bin/start-guacd.sh

ENTRYPOINT ["/usr/local/bin/start-guacd.sh"]
