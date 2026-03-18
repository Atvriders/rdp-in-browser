FROM guacamole/guacd:1.5.0

USER root

# Install Xvfb + xrandr for virtual dual-monitor X11 display
RUN apk add --no-cache xvfb xrandr

# Find the guacd binary (Alpine builds install to /opt/guacamole/sbin)
# and symlink it to a standard PATH location so start.sh can exec it.
RUN GUACD_REAL=$(find /opt /usr -name guacd -type f 2>/dev/null | head -1) \
    && echo "guacd found at: $GUACD_REAL" \
    && ln -sf "$GUACD_REAL" /usr/local/bin/guacd

COPY start.sh /usr/local/bin/start-guacd.sh
RUN chmod +x /usr/local/bin/start-guacd.sh

ENTRYPOINT ["/usr/local/bin/start-guacd.sh"]
