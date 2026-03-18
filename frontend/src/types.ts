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
  label?: string; // friendly name shown in title bar
}

export interface RDPSession {
  id: string;
  params: ConnectParams;
  // Position / size of the floating panel
  top: number;
  left: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  prevBounds?: { top: number; left: number; width: number; height: number };
  // Which display this window lives on ('primary' | 'secondary')
  display: string;
}

// BroadcastChannel messages for dual-monitor support
export type ChannelMsg =
  | { type: 'announce'; display: string }
  | { type: 'ping';     display: string }
  | { type: 'pong';     display: string }
  | { type: 'disconnect' }
  | { type: 'window-dragging';
      session: RDPSession;
      overlapPx: number; winWidth: number; winHeight: number;
      winTop: number; entryEdge: 'left' | 'right' }
  | { type: 'window-drag-cancel' }
  | { type: 'move-window'; session: RDPSession };
