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

    // Mouse — raw DOM events with e.buttons so physical drag state is preserved
    // when the cursor enters this window mid-drag from the primary window.
    // el is offset left by -primaryWidth*scale, so (clientX - rect.left)/scale
    // automatically gives the correct full display-space x (>= primaryWidth).
    const sendMouseFromEvent = (e: MouseEvent) => {
      e.preventDefault();
      const dh = display.getHeight();
      const s = dh ? container.clientHeight / dh : 1;
      const rect = el.getBoundingClientRect();
      send({
        type: 'secondary-mouse',
        x:      Math.round((e.clientX - rect.left) / s),
        y:      Math.round((e.clientY - rect.top)  / s),
        left:   (e.buttons & 1) !== 0,
        middle: (e.buttons & 4) !== 0,
        right:  (e.buttons & 2) !== 0,
        up: false, down: false,
      });
    };
    const sendWheelFromEvent = (e: WheelEvent) => {
      e.preventDefault();
      const dh = display.getHeight();
      const s = dh ? container.clientHeight / dh : 1;
      const rect = el.getBoundingClientRect();
      send({
        type: 'secondary-mouse',
        x:      Math.round((e.clientX - rect.left) / s),
        y:      Math.round((e.clientY - rect.top)  / s),
        left: false, middle: false, right: false,
        up: e.deltaY < 0, down: e.deltaY > 0,
      });
    };
    el.addEventListener('mousemove',   sendMouseFromEvent);
    el.addEventListener('mousedown',   sendMouseFromEvent);
    el.addEventListener('mouseup',     sendMouseFromEvent);
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    el.addEventListener('wheel',       sendWheelFromEvent, { passive: false });

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
