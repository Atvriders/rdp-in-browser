import type { ChannelMsg, RDPSession } from '../types';

const CHANNEL_NAME = 'rdp-display';
let _ch: BroadcastChannel | null = null;

export function getChannel(): BroadcastChannel {
  if (!_ch) _ch = new BroadcastChannel(CHANNEL_NAME);
  return _ch;
}

export const send = (msg: ChannelMsg) => getChannel().postMessage(msg);

export const announce   = (display: string) => send({ type: 'announce', display, screenX: window.screenX });
export const ping       = (display: string) => send({ type: 'ping',     display, screenX: window.screenX });
export const pong       = (display: string) => send({ type: 'pong',     display, screenX: window.screenX });
export const disconnect = ()                => send({ type: 'disconnect' });

export const sendDragging = (
  session: RDPSession,
  overlapPx: number,
  winTop: number,
  entryEdge: 'left' | 'right',
) => send({ type: 'window-dragging', session, overlapPx, winTop, entryEdge });

export const updatePhantom = (overlapPx: number, winTop: number, entryEdge: 'left' | 'right') =>
  send({ type: 'update-phantom', overlapPx, winTop, entryEdge });

export const cancelDrag = () => send({ type: 'window-drag-cancel' });
export const moveWindow = (session: RDPSession) => send({ type: 'move-window', session });
