import { useEffect, useRef } from 'react';
import Guacamole from 'guacamole-common-js';
import { BroadcastChannelTunnel } from '../lib/BroadcastChannelTunnel';
import { getChannel, send } from '../lib/displayChannel';
import type { ChannelMsg } from '../types';

interface Props {
  /** Number of pixels (display-space) that belong to the primary window. */
  primaryWidth: number;
}

/**
 * Full-screen extended display rendered on the secondary browser window.
 * Receives forwarded Guacamole instructions from the primary via BroadcastChannel
 * and shows the right half of the combined RDP desktop.
 * Mouse / keyboard events are forwarded back to the primary.
 */
export default function ExtendedDisplay({ primaryWidth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tunnel = new BroadcastChannelTunnel();
    const client = new Guacamole.Client(tunnel);

    const display = client.getDisplay();
    const el = display.getElement();
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.transformOrigin = '0 0';
    container.appendChild(el);

    // Scale to fit container height; offset left so the RIGHT half is visible.
    const scaleDisplay = () => {
      const dw = display.getWidth();
      const dh = display.getHeight();
      if (!dw || !dh) return;
      const scale = container.clientHeight / dh;
      display.scale(scale);
      // Shift left so the secondary (right) half aligns with the viewport left edge.
      el.style.left = `-${primaryWidth * scale}px`;
      el.style.top  = '0';
    };
    display.onresize = scaleDisplay;
    const ro = new ResizeObserver(scaleDisplay);
    ro.observe(container);

    // Mouse — forward to primary with coordinates in full display-space.
    // Guacamole.Mouse reports x relative to el's left edge (which is off-screen
    // at -primaryWidth*scale). Dividing by scale gives full display-space x,
    // which already includes the primaryWidth offset automatically.
    const mouse = new Guacamole.Mouse(el);
    const sendMouse = (state: Guacamole.Mouse.State) => {
      const dh = display.getHeight();
      const s = dh ? container.clientHeight / dh : 1;
      send({
        type: 'secondary-mouse',
        x: Math.round(state.x / s),
        y: Math.round(state.y / s),
        left:   state.left,
        middle: state.middle,
        right:  state.right,
        up:     state.up,
        down:   state.down,
      });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mouse as any).onmousedown =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mouse as any).onmousemove =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mouse as any).onmouseup = sendMouse;

    // Keyboard — forward to primary.
    const keyboard = new Guacamole.Keyboard(document);
    keyboard.onkeydown = (keysym: number) =>
      send({ type: 'secondary-key', keysym, pressed: true });
    keyboard.onkeyup = (keysym: number) =>
      send({ type: 'secondary-key', keysym, pressed: false });

    // Connect the tunnel (sets state OPEN synchronously).
    client.connect('');

    // Listen for forwarded Guacamole data from primary.
    const ch = getChannel();
    const handler = (e: MessageEvent<ChannelMsg>) => {
      if (e.data.type === 'guac-data') {
        tunnel.receiveData(e.data.data);
      }
    };
    ch.addEventListener('message', handler);

    return () => {
      keyboard.onkeydown = null;
      keyboard.onkeyup   = null;
      ro.disconnect();
      client.disconnect();
      ch.removeEventListener('message', handler);
      if (container && el.parentNode === container) {
        container.removeChild(el);
      }
    };
  }, [primaryWidth]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
      }}
    />
  );
}
