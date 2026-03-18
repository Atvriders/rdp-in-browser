import { create } from 'zustand';
import type { RDPSession, ConnectParams } from '../types';

let idCounter = 0;

interface SessionStore {
  sessions: RDPSession[];
  myDisplay: string;
  pairedDisplay: string | null;
  pairedConnected: boolean;
  phantomSession: RDPSession | null;

  setMyDisplay: (d: string) => void;
  setPairedDisplay: (d: string | null) => void;
  setPairedConnected: (v: boolean) => void;
  setPhantomSession: (s: RDPSession | null) => void;

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
  phantomSession: null,

  setMyDisplay: (d) => set({ myDisplay: d }),
  setPairedDisplay: (d) => set({ pairedDisplay: d }),
  setPairedConnected: (v) => set({ pairedConnected: v }),
  setPhantomSession: (s) => set({ phantomSession: s }),

  openSession: (params) => {
    const id = `session-${++idCounter}`;
    const session: RDPSession = {
      id,
      params,
      top: 60 + (idCounter % 5) * 30,
      left: 60 + (idCounter % 5) * 30,
      width: Math.min(1280, window.innerWidth - 80),
      height: Math.min(800, window.innerHeight - 120),
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
    set((s) => ({
      sessions: [...s.sessions, { ...session, display: s.myDisplay }],
    })),
}));
