import Guacamole from 'guacamole-common-js';
import type { ConnectParams } from '../types';

// setState is a protected method in guacamole-common-js but not exposed in the TS types
type TunnelInternal = { setState: (state: Guacamole.Tunnel.State) => void };

/**
 * Custom Guacamole tunnel backed by a plain WebSocket connected to guacamole-lite.
 *
 * Flow:
 *   1. POST /api/token with connection params → receive encrypted token
 *   2. Open WebSocket to /ws?token=TOKEN
 *   3. guacamole-lite handles the guacd handshake transparently
 *
 * NOTE: guacamole-common-js sets connect/sendMessage/disconnect as INSTANCE
 * properties in the Tunnel() constructor, shadowing prototype overrides.
 * We re-assign them after super() so our implementations are used.
 */
export class RDPTunnel extends Guacamole.Tunnel {
  private ws: WebSocket | null = null;
  private buffer = '';

  /** Called with each complete raw Guacamole instruction string (including `;`). */
  onrawdata?: (raw: string) => void;

  constructor(
    private readonly wsBase: string,
    private readonly params: ConnectParams,
  ) {
    super();
    (this as unknown as { connect: (d: string) => void }).connect           = this._connect.bind(this);
    (this as unknown as { sendMessage: (...e: unknown[]) => void }).sendMessage = this._sendMessage.bind(this);
    (this as unknown as { disconnect: () => void }).disconnect              = this._disconnect.bind(this);
  }

  private setTunnelState(state: Guacamole.Tunnel.State) {
    (this as unknown as TunnelInternal).setState(state);
  }

  private _connect(_data: string) {
    console.log('[RDPTunnel] _connect() called, host:', this.params.host);

    // Derive the server base URL (http/https, hostname, port 3001)
    const base = new URL(this.wsBase, window.location.href);
    const apiBase = `${base.protocol}//${base.hostname}:3001`;

    // Step 1: fetch an encrypted token from the server
    fetch(`${apiBase}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.params),
    })
      .then(r => r.json() as Promise<{ token: string; error?: string }>)
      .then(({ token, error }) => {
        if (error || !token) throw new Error(error ?? 'No token returned');

        // Step 2: open WebSocket with token
        const wsUrl = new URL('/ws', `ws://${base.hostname}:3001`);
        if (base.protocol === 'https:') wsUrl.protocol = 'wss:';
        wsUrl.searchParams.set('token', token);
        console.log('[RDPTunnel] connecting to guacamole-lite:', wsUrl.toString());

        this.ws = new WebSocket(wsUrl.toString());

        this.ws.onopen = () => {
          console.log('[RDPTunnel] WebSocket opened');
          this.setTunnelState(Guacamole.Tunnel.State.OPEN);
        };

        this.ws.onclose = (e) => {
          console.log('[RDPTunnel] WebSocket closed', e.code, e.reason);
          this.setTunnelState(Guacamole.Tunnel.State.CLOSED);
          if (!e.wasClean && this.onerror) {
            this.onerror(new Guacamole.Status(
              Guacamole.Status.Code.UPSTREAM_NOT_FOUND, e.reason || 'Connection closed',
            ));
          }
        };

        this.ws.onerror = () => {
          console.log('[RDPTunnel] WebSocket error');
          if (this.onerror) {
            this.onerror(new Guacamole.Status(Guacamole.Status.Code.SERVER_ERROR, 'WebSocket error'));
          }
        };

        this.ws.onmessage = (e: MessageEvent<string>) => {
          this.buffer += e.data;
          let end: number;
          while ((end = this.buffer.indexOf(';')) !== -1) {
            const raw = this.buffer.substring(0, end + 1);
            this.buffer = this.buffer.substring(end + 1);
            this.dispatch(raw);
          }
        };
      })
      .catch((err: Error) => {
        console.error('[RDPTunnel] token fetch failed:', err.message);
        if (this.onerror) {
          this.onerror(new Guacamole.Status(Guacamole.Status.Code.SERVER_ERROR, err.message));
        }
      });
  }

  private dispatch(raw: string) {
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
    this.onrawdata?.(raw);
    if (parts.length > 0 && this.oninstruction) {
      this.oninstruction(parts[0], parts.slice(1));
    }
  }

  private _sendMessage(...elements: unknown[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const encoded = elements
        .map((s) => { const str = String(s); return `${str.length}.${str}`; })
        .join(',') + ';';
      this.ws.send(encoded);
    }
  }

  private _disconnect() {
    this.ws?.close();
    this.setTunnelState(Guacamole.Tunnel.State.CLOSED);
  }

  override connect(_data: string) { this._connect(_data); }
  override sendMessage(...elements: unknown[]) { this._sendMessage(...elements); }
  override disconnect() { this._disconnect(); }
}
