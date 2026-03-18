import { create } from 'zustand';
import type { RDPSession, ConnectParams, PhantomInfo } from '../types';

let idCounter = 0;

interface SessionStore {
  sessions: RDPSession[];
  myDisplay: string;
  pairedDisplay: string | null;
  pairedConnected: boolean;
  pairedScreenX: number | null;
  phantom: PhantomInfo | null;

  setMyDisplay: (d: string) => void;
  setPairedDisplay: (d: string | null) => void;
  setPairedConnected: (v: boolean) => void;
  setPairedScreenX: (x: number | null) => void;
  setPhantom: (p: PhantomInfo | null) => void;
  updatePhantomPos: (overlapPx: number, winTop: number, entryEdge: 'left' | 'right') => void;

  openSession: (params: ConnectParams) => void;
  closeSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<RDPSession>) => void;
  adoptSession: (session: RDPSession) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  myDisplay: 'primary',
  pairedDisplay: null,
  pairedConnected: false,
  pairedScreenX: null,
  phantom: null,

  setMyDisplay: (d) => set({ myDisplay: d }),
  setPairedDisplay: (d) => set({ pairedDisplay: d }),
  setPairedConnected: (v) => set({ pairedConnected: v }),
  setPairedScreenX: (x) => set({ pairedScreenX: x }),
  setPhantom: (p) => set({ phantom: p }),
  updatePhantomPos: (overlapPx, winTop, entryEdge) =>
    set((s) => s.phantom ? { phantom: { ...s.phantom, overlapPx, winTop, entryEdge } } : {}),

  openSession: (params) => {
    const id = `session-${++idCounter}`;
    const session: RDPSession = {
      id,
      params,
      top:  60 + (idCounter % 5) * 30,
      left: 60 + (idCounter % 5) * 30,
      width:  Math.min(1280, window.innerWidth  - 80),
      height: Math.min(800,  window.innerHeight - 120),
      isMinimized: false,
      isMaximized: false,
      display: useSessionStore.getState().myDisplay,
    };
    set((s) => ({ sessions: [...s.sessions, session] }));
  },

  closeSession: (id) =>
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),

  updateSession: (id, patch) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    })),

  adoptSession: (session) =>
    set((s) => {
      // Don't duplicate if already present
      if (s.sessions.find((x) => x.id === session.id)) return {};
      return { sessions: [...s.sessions, { ...session, display: s.myDisplay }] };
    }),
}));
