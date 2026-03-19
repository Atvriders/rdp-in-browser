FROM guacamole/guacd:1.5.0

USER root

RUN apk add --no-cache \
        xorg-server \
        xf86-video-dummy \
        xrandr \
        xinerama-dev

# Find the guacd binary and symlink it to a known location
RUN GUACD_REAL=$(find /opt /usr -name guacd -type f 2>/dev/null | head -1) \
    && echo "guacd found at: $GUACD_REAL" \
    && ln -sf "$GUACD_REAL" /usr/local/bin/guacd

COPY xorg.conf /etc/X11/xorg.conf
COPY start.sh  /usr/local/bin/start-guacd.sh
RUN chmod +x /usr/local/bin/start-guacd.sh

ENTRYPOINT ["/usr/local/bin/start-guacd.sh"]
