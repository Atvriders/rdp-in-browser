import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from './store/useSessionStore';
import {
  getChannel, announce, ping, pong, disconnect as sendDisconnect,
  sendDragging, updatePhantom, cancelDrag, moveWindow, send,
} from './lib/displayChannel';
import ConnectForm from './components/ConnectForm';
import RDPSession from './components/RDPSession';
import ExtendedDisplay from './components/ExtendedDisplay';
import type { ConnectParams, RDPSession as Session, ChannelMsg } from './types';

export default function App() {
  const {
    sessions, myDisplay, pairedConnected, pairedDisplay, pairedScreenX, phantom,
    setMyDisplay, setPairedDisplay, setPairedConnected, setPairedScreenX,
    setPhantom, updatePhantomPos,
    openSession, closeSession, updateSession, adoptSession,
  } = useSessionStore();

  const [focusedId, setFocusedId]   = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(true);
  const [draggingOutId, setDraggingOutId] = useState<string | null>(null);

  // Extended dual-monitor state
  const [extendedMode, setExtendedMode]           = useState(false);
  const [extendedPrimaryWidth, setExtPrimaryWidth] = useState(0);

  const myDisplayRef         = useRef(myDisplay);
  const extendedModeRef      = useRef(extendedMode);
  const extPrimaryWidthRef   = useRef(extendedPrimaryWidth);
  myDisplayRef.current       = myDisplay;
  extendedModeRef.current    = extendedMode;
  extPrimaryWidthRef.current = extendedPrimaryWidth;

  // ── BroadcastChannel + display detection ──────────────────────────────────
  useEffect(() => {
    const detect = () => {
      const d = window.screenX < window.screen.width / 2 ? 'primary' : 'secondary';
      setMyDisplay(d);
      return d;
    };

    const d = detect();
    const ch = getChannel();
    announce(d);

    const positionPoll = setInterval(() => {
      const newD = detect();
      if (newD !== myDisplayRef.current) announce(newD);
    }, 2000);

    const heartbeat = setInterval(() => ping(myDisplayRef.current), 8000);

    const handler = (e: MessageEvent<ChannelMsg>) => {
      const msg = e.data;
      if (msg.type === 'announce') {
        setPairedConnected(true);
        setPairedDisplay(msg.display);
        setPairedScreenX(msg.screenX);
        pong(myDisplayRef.current);
        // If we're already in extended mode (e.g. secondary refreshed),
        // re-send extend-display so the new window doesn't miss it.
        if (extendedModeRef.current && myDisplayRef.current === 'primary') {
          send({ type: 'extend-display', primaryWidth: extPrimaryWidthRef.current, totalHeight: window.innerHeight });
        }
      }
      if (msg.type === 'ping') {
        setPairedConnected(true);
        setPairedDisplay(msg.display);
        setPairedScreenX(msg.screenX);
        pong(myDisplayRef.current);
      }
      if (msg.type === 'pong') {
        setPairedConnected(true);
        setPairedDisplay(msg.display);
        setPairedScreenX(msg.screenX);
      }
      if (msg.type === 'disconnect') {
        setPairedConnected(false);
        setPairedDisplay(null);
        setPairedScreenX(null);
      }
      if (msg.type === 'window-dragging') {
        setPhantom({ session: msg.session, overlapPx: msg.overlapPx, winTop: msg.winTop, entryEdge: msg.entryEdge });
      }
      if (msg.type === 'update-phantom') {
        updatePhantomPos(msg.overlapPx, msg.winTop, msg.entryEdge);
      }
      if (msg.type === 'window-drag-cancel') {
        setPhantom(null);
      }
      if (msg.type === 'move-window') {
        setPhantom(null);
        adoptSession(msg.session);
        setFocusedId(msg.session.id);
      }
      // Secondary window receives extend-display from primary
      if (msg.type === 'extend-display') {
        setExtendedMode(true);
        setExtPrimaryWidth(msg.primaryWidth);
        setShowForm(false);
      }
    };

    ch.addEventListener('message', handler);
    window.addEventListener('beforeunload', () => sendDisconnect());

    return () => {
      ch.removeEventListener('message', handler);
      clearInterval(heartbeat);
      clearInterval(positionPoll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Extended mode lifecycle ────────────────────────────────────────────────
  // When pairing state changes, activate or deactivate extended mode on primary.
  useEffect(() => {
    if (!pairedConnected) {
      // Peer disconnected — exit extended mode
      if (extendedModeRef.current) {
        setExtendedMode(false);
      }
      return;
    }
    // Newly paired — activate extended mode if we are primary and have sessions
    if (myDisplayRef.current === 'primary' && !extendedModeRef.current) {
      const primarySessions = useSessionStore.getState().sessions.filter(s => s.display === 'primary');
      if (primarySessions.length > 0) {
        activateExtended();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairedConnected]);

  const activateExtended = useCallback(() => {
    const pw = window.innerWidth;
    send({ type: 'extend-display', primaryWidth: pw, totalHeight: window.innerHeight });
    setExtendedMode(true);
    setExtPrimaryWidth(pw);
  }, []);

  // ── Drag to other display ─────────────────────────────────────────────────
  const handleDragToOther = useCallback((session: Session, ev: MouseEvent) => {
    if (!pairedConnected) return;

    const goingRight = session.left + session.width > window.innerWidth;
    const peerIsRight = pairedScreenX !== null && pairedScreenX > window.screenX;
    const peerIsLeft  = pairedScreenX !== null && pairedScreenX < window.screenX;
    if (goingRight && !peerIsRight) {
      updateSession(session.id, { left: window.innerWidth - session.width - 20, top: session.top });
      return;
    }
    if (!goingRight && !peerIsLeft) {
      updateSession(session.id, { left: 20, top: session.top });
      return;
    }

    const entryEdge: 'left' | 'right' = goingRight ? 'left' : 'right';
    const calcOverlap = (left: number) =>
      goingRight ? left + session.width - window.innerWidth : -left;

    let overlap = Math.max(1, calcOverlap(session.left));
    let winTop  = session.top;

    setDraggingOutId(session.id);
    sendDragging(session, overlap, winTop, entryEdge);

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - ev.clientX;
      const dy = e.clientY - ev.clientY;
      const newLeft = session.left + dx;
      const newTop  = session.top  + dy;

      overlap = Math.max(1, calcOverlap(newLeft));
      winTop  = newTop;

      const centerBack = goingRight
        ? newLeft + session.width / 2 < window.innerWidth
        : newLeft + session.width / 2 > 0;

      if (centerBack) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup',   onUp);
        cancelDrag();
        setDraggingOutId(null);
        updateSession(session.id, {
          left: goingRight ? window.innerWidth - session.width - 20 : 20,
          top:  newTop,
        });
        return;
      }
      updatePhantom(overlap, winTop, entryEdge);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      setDraggingOutId(null);
      const landingLeft = entryEdge === 'left' ? 20 : window.innerWidth - session.width - 20;
      closeSession(session.id);
      moveWindow({ ...session, left: landingLeft, top: winTop });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    void ev;
  }, [pairedConnected, pairedScreenX, closeSession, updateSession]);

  // ── Phantom position ───────────────────────────────────────────────────────
  const phantomStyle = phantom ? (() => {
    const left = phantom.entryEdge === 'left'
      ? phantom.overlapPx - phantom.session.width
      : window.innerWidth - phantom.overlapPx;
    return {
      left,
      top:    phantom.winTop,
      width:  phantom.session.width,
      height: phantom.session.height,
    };
  })() : null;

  const handleConnect = (params: ConnectParams) => {
    openSession(params);
    setShowForm(false);
    // If already paired as primary and not yet in extended mode, activate now
    if (pairedConnected && myDisplayRef.current === 'primary' && !extendedModeRef.current) {
      activateExtended();
    }
  };

  return (
    <div className="app-root">
      {/* ── Taskbar ── */}
      <div className="taskbar">
        <button className="taskbar-btn new" onClick={() => setShowForm(p => !p)} title="New connection">
          ＋ New RDP
        </button>
        <div className="taskbar-sessions">
          {sessions.map(s => (
            <button
              key={s.id}
              className={`taskbar-session ${focusedId === s.id ? 'focused' : ''}`}
              onClick={() => {
                updateSession(s.id, { isMinimized: false });
                setFocusedId(s.id);
              }}
            >
              🖥️ {s.params.label || s.params.host}
            </button>
          ))}
        </div>
        <div className="taskbar-right">
          {pairedConnected && (
            <span className="taskbar-dual" title={`Dual monitor — paired with ${pairedDisplay}`}>
              🖥️🖥️ {extendedMode ? 'Extended' : 'Dual'}
            </span>
          )}
          <span className="taskbar-display">{myDisplay === 'primary' ? '← Primary' : 'Secondary →'}</span>
        </div>
      </div>

      {/* ── Desktop ── */}
      <div className="desktop">
        {/* Extended display on secondary window */}
        {myDisplay === 'secondary' && extendedMode && (
          <ExtendedDisplay primaryWidth={extendedPrimaryWidth} />
        )}

        {/* Sessions (only rendered on the owning display) */}
        {sessions.filter(s => s.display === myDisplay).map(s => (
          <RDPSession
            key={s.id}
            session={s}
            focused={focusedId === s.id}
            draggingOut={draggingOutId === s.id}
            extendedMode={extendedMode && myDisplay === 'primary'}
            onFocus={() => setFocusedId(s.id)}
            onClose={() => { closeSession(s.id); if (focusedId === s.id) setFocusedId(null); }}
            onUpdate={(patch) => updateSession(s.id, patch)}
            onDragToOtherDisplay={handleDragToOther}
          />
        ))}

        {/* Phantom window */}
        {phantom && phantomStyle && (
          <div className="phantom-window" style={phantomStyle}>
            <div className="phantom-titlebar">
              🖥️ {phantom.session.params.label || phantom.session.params.host}
              <span className="phantom-hint">release to transfer</span>
            </div>
          </div>
        )}

        {/* Connect form modal — hidden on secondary extended display */}
        {showForm && !(myDisplay === 'secondary' && extendedMode) && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <ConnectForm onConnect={handleConnect} />
          </div>
        )}

        {/* Empty state */}
        {sessions.filter(s => s.display === myDisplay).length === 0 && !showForm && myDisplay !== 'secondary' && (
          <div className="empty-state">
            <div className="empty-icon">🖥️</div>
            <div className="empty-title">No active connections</div>
            <div className="empty-sub">Click <strong>＋ New RDP</strong> to connect to a remote desktop</div>
            {pairedConnected && (
              <div className="empty-pair">🖥️🖥️ Second monitor connected — start an RDP session to enable extended display</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
