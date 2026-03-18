export interface ConnectParams {
  host: string;
  port: number;
  username: string;
  password: string;
  domain: string;
  width: number;
  height: number;
  colorDepth: number;
  security: string;
  ignoreCert: boolean;
  label?: string;
}

export interface RDPSession {
  id: string;
  params: ConnectParams;
  top: number;
  left: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  prevBounds?: { top: number; left: number; width: number; height: number };
  display: string;
}

export interface PhantomInfo {
  session: RDPSession;
  overlapPx: number;
  winTop: number;
  entryEdge: 'left' | 'right';
}

// BroadcastChannel messages for dual-monitor support
export type ChannelMsg =
  | { type: 'announce'; display: string; screenX: number }
  | { type: 'ping';     display: string; screenX: number }
  | { type: 'pong';     display: string; screenX: number }
  | { type: 'disconnect' }
  | { type: 'window-dragging';
      session: RDPSession;
      overlapPx: number;
      winTop: number;
      entryEdge: 'left' | 'right' }
  | { type: 'update-phantom';
      overlapPx: number;
      winTop: number;
      entryEdge: 'left' | 'right' }
  | { type: 'window-drag-cancel' }
  | { type: 'move-window'; session: RDPSession };
