FROM guacamole/guacd:1.5.0

USER root

# Install Xvfb + xrandr so FreeRDP can enumerate virtual monitors
RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb \
        x11-xserver-utils \
    && rm -rf /var/lib/apt/lists/*

COPY start.sh /usr/local/bin/start-guacd.sh
RUN chmod +x /usr/local/bin/start-guacd.sh

ENTRYPOINT ["/usr/local/bin/start-guacd.sh"]
