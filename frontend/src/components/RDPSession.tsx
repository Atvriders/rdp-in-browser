import { useEffect, useRef, useCallback, useState } from 'react';
import Guacamole from 'guacamole-common-js';
import { RDPTunnel } from '../lib/tunnel';
import { getChannel, send } from '../lib/displayChannel';
import type { RDPSession as Session, ChannelMsg } from '../types';
import './RDPSession.css';

interface Props {
  session: Session;
  focused: boolean;
  draggingOut?: boolean;
  extendedMode?: boolean;
  onFocus: () => void;
  onClose: () => void;
  onUpdate: (patch: Partial<Session>) => void;
  onDragToOtherDisplay: (session: Session, e: MouseEvent) => void;
}

export default function RDPSession({
  session, focused, draggingOut, extendedMode, onFocus, onClose, onUpdate, onDragToOtherDisplay,
}: Props) {
  const displayRef  = useRef<HTMLDivElement>(null);
  const clientRef   = useRef<Guacamole.Client | null>(null);
  const rdpReadyRef = useRef(false);
  const focusedRef  = useRef(focused);
  const scaleRef    = useRef(1);
  const extendedModeRef = useRef(extendedMode ?? false);
  const [status, setStatus]   = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [errMsg, setErrMsg]   = useState('');

  // Keep refs in sync so closures always see current values
  useEffect(() => { focusedRef.current = focused; }, [focused]);
  extendedModeRef.current = extendedMode ?? false;

  // ── Guacamole connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!displayRef.current) return;
    setStatus('connecting');
    setErrMsg('');

    // In extended mode use the actual container pixel dimensions so the
    // Guacamole display matches the viewport exactly (scale = 1.0, no blur).
    // Width is doubled to span both monitors; height matches the display area.
    // multiMonitor: true enables FreeRDP's /multimon flag so Windows sees two
    // separate monitors instead of one ultra-wide display.
    const containerW = displayRef.current.clientWidth;
    const containerH = displayRef.current.clientHeight;
    const tunnelParams = extendedModeRef.current
      ? { ...session.params, width: containerW * 2, height: containerH, multiMonitor: true }
      : session.params;

    const tunnel = new RDPTunnel(window.location.href, tunnelParams);
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    const display = client.getDisplay();
    const el = display.getElement();
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    displayRef.current.appendChild(el);

    // Scale the display to fit the container.
    // Extended mode: fit height only (right half overflows and is clipped).
    // Normal mode: fit both dimensions, centered.
    const scaleDisplay = () => {
      const container = displayRef.current;
      if (!container) return;
      const dw = display.getWidth();
      const dh = display.getHeight();
      if (!dw || !dh) return;
      const isExtended = extendedModeRef.current;
      const scale = isExtended
        ? container.clientHeight / dh
        : Math.min(container.clientWidth / dw, container.clientHeight / dh);
      scaleRef.current = scale;
      display.scale(scale);
      if (isExtended) {
        el.style.left = '0';
        el.style.top  = '0';
      } else {
        el.style.left = Math.max(0, (container.clientWidth  - dw * scale) / 2) + 'px';
        el.style.top  = Math.max(0, (container.clientHeight - dh * scale) / 2) + 'px';
      }
    };
    display.onresize = scaleDisplay;
    const ro = new ResizeObserver(scaleDisplay);
    ro.observe(displayRef.current);

    // Mouse — scale coordinates back to display space
    const mouse = new Guacamole.Mouse(el);
    const sendMouse = (state: Guacamole.Mouse.State) => {
      if (!rdpReadyRef.current) return;
      const s = scaleRef.current || 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scaled = new (Guacamole.Mouse.State as any)(
        Math.round(state.x / s), Math.round(state.y / s),
        state.left, state.middle, state.right, state.up, state.down,
      );
      client.sendMouseState(scaled);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mouse as any).onmousedown =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mouse as any).onmousemove =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mouse as any).onmouseup = sendMouse;

    // Keyboard (only when this session is focused)
    const keyboard = new Guacamole.Keyboard(document);
    keyboard.onkeydown = (keysym: number) => {
      if (focusedRef.current) client.sendKeyEvent(1, keysym);
    };
    keyboard.onkeyup = (keysym: number) => {
      if (focusedRef.current) client.sendKeyEvent(0, keysym);
    };

    // Extended mode: forward all Guacamole data to secondary window,
    // and accept mouse/keyboard inputs forwarded from secondary.
    let cleanupExtended: (() => void) | undefined;
    if (extendedModeRef.current) {
      tunnel.onrawdata = (raw) => {
        send({ type: 'guac-data', data: raw });
      };

      const ch = getChannel();
      const handleSecondaryInput = (e: MessageEvent<ChannelMsg>) => {
        const msg = e.data;
        if (msg.type === 'secondary-mouse') {
          if (!rdpReadyRef.current) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const state = new (Guacamole.Mouse.State as any)(
            msg.x, msg.y, msg.left, msg.middle, msg.right, msg.up, msg.down,
          );
          client.sendMouseState(state);
        }
        if (msg.type === 'secondary-key') {
          client.sendKeyEvent(msg.pressed ? 1 : 0, msg.keysym);
        }
      };
      ch.addEventListener('message', handleSecondaryInput);
      cleanupExtended = () => ch.removeEventListener('message', handleSecondaryInput);
    }

    // Intercept tunnel state changes
    const guacTunnelStateChange = tunnel.onstatechange;
    tunnel.onstatechange = (state: Guacamole.Tunnel.State) => {
      guacTunnelStateChange?.call(tunnel, state);
      if (state === Guacamole.Tunnel.State.OPEN) {
        setStatus('connected');
        rdpReadyRef.current = true;
      }
      if (state === Guacamole.Tunnel.State.CLOSED) {
        rdpReadyRef.current = false;
        setStatus('disconnected');
      }
    };

    client.onstatechange = (state: number) => {
      if (state === 3) rdpReadyRef.current = true;
      if (state === 5) { rdpReadyRef.current = false; setStatus('disconnected'); }
    };
    client.onerror = (s: Guacamole.Status) => {
      setStatus('error');
      setErrMsg(s.message ?? 'Connection failed');
    };

    client.connect('');

    return () => {
      cleanupExtended?.();
      rdpReadyRef.current = false;
      keyboard.onkeydown = null;
      keyboard.onkeyup   = null;
      ro.disconnect();
      client.disconnect();
      if (displayRef.current && el.parentNode === displayRef.current) {
        displayRef.current.removeChild(el);
      }
    };
  // Reconnect when session ID changes OR when extended mode toggles
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, extendedMode]);

  // ── Title-bar drag ─────────────────────────────────────────────────────────
  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || session.isMaximized) return;
    e.preventDefault();
    onFocus();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startLeft: session.left, startTop: session.top };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const newLeft = dragRef.current.startLeft + dx;
      const newTop  = dragRef.current.startTop  + dy;

      if (newLeft < -session.width * 0.4 || newLeft > window.innerWidth - session.width * 0.6) {
        dragRef.current.active = false;
        onDragToOtherDisplay({ ...session, left: newLeft, top: newTop }, ev);
        return;
      }
      onUpdate({ left: newLeft, top: newTop });
    };
    const onUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [session, onFocus, onUpdate, onDragToOtherDisplay]);

  // Drag state
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  // Resize state
  const resizeRef = useRef({ active: false, edge: '', startX: 0, startY: 0, startW: 0, startH: 0, startL: 0, startT: 0 });

  // ── Resize handles ─────────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((edge: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      active: true, edge,
      startX: e.clientX, startY: e.clientY,
      startW: session.width, startH: session.height,
      startL: session.left,  startT: session.top,
    };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current.active) return;
      const { startX, startY, startW, startH, startL, startT, edge: eg } = resizeRef.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const patch: Partial<Session> = {};
      if (eg.includes('e')) patch.width  = Math.max(400, startW + dx);
      if (eg.includes('s')) patch.height = Math.max(300, startH + dy);
      if (eg.includes('w')) { patch.width = Math.max(400, startW - dx); patch.left = startL + dx; }
      if (eg.includes('n')) { patch.height = Math.max(300, startH - dy); patch.top  = startT + dy; }
      onUpdate(patch);
    };
    const onUp = () => {
      resizeRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [session, onUpdate]);

  const style = session.isMaximized
    ? { top: 0, left: 0, width: '100%', height: '100%', zIndex: focused ? 9999 : 100 }
    : { top: session.top, left: session.left, width: session.width, height: session.height, zIndex: focused ? 200 : 100 };

  if (session.isMinimized) return null;

  return (
    <div className={`rdp-session ${focused ? 'focused' : ''} ${draggingOut ? 'dragging-out' : ''}`} style={style} onMouseDown={onFocus}>
      {/* Title bar */}
      <div className="rdp-titlebar" onMouseDown={onTitleMouseDown}>
        <span className="rdp-titlebar-icon">🖥️</span>
        <span className="rdp-titlebar-title">
          {session.params.label || session.params.host}
          {status === 'connecting' && <span className="rdp-status connecting"> — Connecting…</span>}
          {status === 'error'      && <span className="rdp-status error"> — {errMsg}</span>}
          {status === 'disconnected' && <span className="rdp-status disconnected"> — Disconnected</span>}
        </span>
        <div className="rdp-titlebar-btns">
          <button className="rdp-btn close" title="Close" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Display area */}
      <div className="rdp-display" ref={displayRef}>
        {status === 'connecting' && (
          <div className="rdp-overlay">
            <div className="rdp-spinner" />
            <div>Connecting to {session.params.host}…</div>
          </div>
        )}
        {(status === 'error' || status === 'disconnected') && (
          <div className="rdp-overlay error">
            <div className="rdp-overlay-icon">⚠️</div>
            <div>{status === 'error' ? errMsg : 'Session disconnected'}</div>
            <button className="rdp-reconnect" onClick={() => {
              clientRef.current?.disconnect();
              setStatus('connecting');
            }}>Reconnect</button>
          </div>
        )}
      </div>

      {/* Resize handles */}
      {!session.isMaximized && (<>
        <div className="rdp-resize n"  onMouseDown={onResizeMouseDown('n')} />
        <div className="rdp-resize s"  onMouseDown={onResizeMouseDown('s')} />
        <div className="rdp-resize e"  onMouseDown={onResizeMouseDown('e')} />
        <div className="rdp-resize w"  onMouseDown={onResizeMouseDown('w')} />
        <div className="rdp-resize nw" onMouseDown={onResizeMouseDown('nw')} />
        <div className="rdp-resize ne" onMouseDown={onResizeMouseDown('ne')} />
        <div className="rdp-resize sw" onMouseDown={onResizeMouseDown('sw')} />
        <div className="rdp-resize se" onMouseDown={onResizeMouseDown('se')} />
      </>)}
    </div>
  );
}
