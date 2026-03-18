import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from './store/useSessionStore';
import {
  getChannel, announce, ping, pong, disconnect as sendDisconnect,
  sendDragging, cancelDrag, moveWindow,
} from './lib/displayChannel';
import ConnectForm from './components/ConnectForm';
import RDPSession from './components/RDPSession';
import type { ConnectParams, RDPSession as Session, ChannelMsg } from './types';

// Determine which display this window is — left/right based on screen coords
function detectDisplay(): string {
  return window.screenX < window.screen.width / 2 ? 'primary' : 'secondary';
}

export default function App() {
  const {
    sessions, myDisplay, pairedConnected, pairedDisplay, phantomSession,
    setMyDisplay, setPairedDisplay, setPairedConnected, setPhantomSession,
    openSession, closeSession, updateSession, adoptSession,
  } = useSessionStore();

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(true);
  const [minimized, setMinimized] = useState<string[]>([]);

  // ── Display detection + BroadcastChannel ──────────────────────────────────
  useEffect(() => {
    const d = detectDisplay();
    setMyDisplay(d);

    const ch = getChannel();
    announce(d);

    const heartbeat = setInterval(() => ping(d), 8000);

    const handler = (e: MessageEvent<ChannelMsg>) => {
      const msg = e.data;
      if (msg.type === 'announce') { setPairedConnected(true); setPairedDisplay(msg.display); pong(d); }
      if (msg.type === 'ping')     { setPairedConnected(true); setPairedDisplay(msg.display); pong(d); }
      if (msg.type === 'pong')     { setPairedConnected(true); setPairedDisplay(msg.display); }
      if (msg.type === 'disconnect') { setPairedConnected(false); setPairedDisplay(null); }
      if (msg.type === 'window-dragging') {
        setPhantomSession(msg.session);
      }
      if (msg.type === 'window-drag-cancel') {
        setPhantomSession(null);
      }
      if (msg.type === 'move-window') {
        setPhantomSession(null);
        adoptSession(msg.session);
        setFocusedId(msg.session.id);
      }
    };

    ch.addEventListener('message', handler);
    window.addEventListener('beforeunload', () => sendDisconnect());

    return () => {
      ch.removeEventListener('message', handler);
      clearInterval(heartbeat);
    };
  }, [setMyDisplay, setPairedDisplay, setPairedConnected, setPhantomSession, adoptSession]);

  // ── Drag to other display ─────────────────────────────────────────────────
  const handleDragToOther = useCallback((session: Session, ev: MouseEvent) => {
    if (!pairedConnected) return;
    // Calculate how far the window has crossed the edge
    const overlapPx  = session.left < 0 ? -session.left : session.left + session.width - window.innerWidth;
    const entryEdge  = session.left < 0 ? 'right' : 'left';
    sendDragging(session, overlapPx, session.width, session.height, session.top, entryEdge);

    // Track mouse to see if user drops it over there or brings it back
    const onMove = (e2: MouseEvent) => {
      const back = entryEdge === 'right'
        ? e2.clientX > overlapPx
        : e2.clientX < window.innerWidth - overlapPx;
      if (back) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        cancelDrag();
        adoptSession(session); // keep here
      }
      void e2;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Drop it on the other display
      closeSession(session.id);
      moveWindow({ ...session, left: overlapPx > 0 ? 20 : window.innerWidth - session.width - 20 });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    void ev;
  }, [pairedConnected, closeSession, adoptSession]);

  const handleConnect = (params: ConnectParams) => {
    openSession(params);
    setShowForm(false);
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
              className={`taskbar-session ${focusedId === s.id ? 'focused' : ''} ${minimized.includes(s.id) ? 'minimized' : ''}`}
              onClick={() => {
                if (minimized.includes(s.id)) {
                  setMinimized(p => p.filter(x => x !== s.id));
                  updateSession(s.id, { isMinimized: false });
                }
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
              🖥️🖥️ Dual
            </span>
          )}
          <span className="taskbar-display">{myDisplay === 'primary' ? '← Primary' : 'Secondary →'}</span>
        </div>
      </div>

      {/* ── Desktop ── */}
      <div className="desktop">
        {/* Sessions */}
        {sessions.filter(s => s.display === myDisplay).map(s => (
          <RDPSession
            key={s.id}
            session={s}
            focused={focusedId === s.id}
            onFocus={() => setFocusedId(s.id)}
            onClose={() => { closeSession(s.id); if (focusedId === s.id) setFocusedId(null); }}
            onUpdate={(patch) => {
              updateSession(s.id, patch);
              if (patch.isMinimized) setMinimized(p => [...p, s.id]);
            }}
            onDragToOtherDisplay={handleDragToOther}
          />
        ))}

        {/* Phantom window (hovering in from other display) */}
        {phantomSession && (
          <div className="phantom-window" style={{
            width: phantomSession.width,
            height: phantomSession.height,
            top: phantomSession.top,
          }}>
            <div className="phantom-titlebar">🖥️ {phantomSession.params.label || phantomSession.params.host}</div>
          </div>
        )}

        {/* Connect form modal */}
        {showForm && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <ConnectForm onConnect={handleConnect} />
          </div>
        )}

        {/* Empty state */}
        {sessions.filter(s => s.display === myDisplay).length === 0 && !showForm && (
          <div className="empty-state">
            <div className="empty-icon">🖥️</div>
            <div className="empty-title">No active connections</div>
            <div className="empty-sub">Click <strong>＋ New RDP</strong> to connect to a remote desktop</div>
            {pairedConnected && (
              <div className="empty-pair">🖥️🖥️ Second monitor connected — drag sessions between windows</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
