FROM guacamole/guacd:1.5.0

USER root

# Install Xvfb + xrandr so FreeRDP can enumerate virtual monitors
# guacamole/guacd is Alpine-based — use apk
RUN apk add --no-cache xvfb xrandr

COPY start.sh /usr/local/bin/start-guacd.sh
RUN chmod +x /usr/local/bin/start-guacd.sh

ENTRYPOINT ["/usr/local/bin/start-guacd.sh"]
