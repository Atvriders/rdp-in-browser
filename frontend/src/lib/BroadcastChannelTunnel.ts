import Guacamole from 'guacamole-common-js';

type TunnelInternal = { setState: (state: Guacamole.Tunnel.State) => void };

/**
 * A Guacamole tunnel backed by BroadcastChannel instead of a WebSocket.
 * Used by the secondary (extended) display window: receives forwarded
 * Guacamole instructions from the primary window and renders the display.
 * sendMessage is a no-op — input is handled separately via BroadcastChannel.
 */
export class BroadcastChannelTunnel extends Guacamole.Tunnel {
  constructor() {
    super();
    (this as unknown as { connect: (d: string) => void }).connect           = this._connect.bind(this);
    (this as unknown as { sendMessage: (...e: unknown[]) => void }).sendMessage = this._sendMessage.bind(this);
    (this as unknown as { disconnect: () => void }).disconnect              = this._disconnect.bind(this);
  }

  private setTunnelState(state: Guacamole.Tunnel.State) {
    (this as unknown as TunnelInternal).setState(state);
  }

  private _connect(_data: string) {
    this.setTunnelState(Guacamole.Tunnel.State.OPEN);
  }

  // Secondary doesn't send anything to guacd — input is forwarded via BroadcastChannel
  private _sendMessage(..._elements: unknown[]) {}

  private _disconnect() {
    this.setTunnelState(Guacamole.Tunnel.State.CLOSED);
  }

  /** Feed a raw Guacamole instruction string (e.g. "4.draw,…;") to the client. */
  receiveData(raw: string) {
    const parts: string[] = [];
    let i = 0;
    while (i < raw.length && raw[i] !== ';') {
      const dot = raw.indexOf('.', i);
      if (dot === -1) break;
      const len = parseInt(raw.substring(i, dot), 10);
      if (isNaN(len)) break;
      parts.push(raw.substring(dot + 1, dot + 1 + len));
      i = dot + 1 + len;
      if (raw[i] === ',') i++;
    }
    if (parts.length > 0 && this.oninstruction) {
      this.oninstruction(parts[0], parts.slice(1));
    }
  }

  override connect(_data: string) { this._connect(_data); }
  override sendMessage(...elements: unknown[]) { this._sendMessage(...elements); }
  override disconnect() { this._disconnect(); }
}
