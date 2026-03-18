import Guacamole from 'guacamole-common-js';
import type { ConnectParams } from '../types';

// setState is a protected method in guacamole-common-js but not exposed in the TS types
type TunnelInternal = { setState: (state: Guacamole.Tunnel.State) => void };

/**
 * Custom Guacamole tunnel backed by a plain WebSocket.
 *
 * NOTE: guacamole-common-js sets connect/sendMessage/disconnect as INSTANCE
 * properties in the Tunnel() constructor (this.connect = function(){}), which
 * shadows any prototype overrides. We must re-assign them after super() to
 * ensure our implementations are used.
 */
export class RDPTunnel extends Guacamole.Tunnel {
  private ws: WebSocket | null = null;
  private buffer = '';

  constructor(
    private readonly wsBase: string,
    private readonly params: ConnectParams,
  ) {
    super();

    // Re-assign as instance properties to shadow the base class instance properties.
    (this as unknown as { connect: (d: string) => void }).connect      = this._connect.bind(this);
    (this as unknown as { sendMessage: (...e: unknown[]) => void }).sendMessage = this._sendMessage.bind(this);
    (this as unknown as { disconnect: () => void }).disconnect = this._disconnect.bind(this);
  }

  private setTunnelState(state: Guacamole.Tunnel.State) {
    (this as unknown as TunnelInternal).setState(state);
  }

  private _connect(_data: string) {
    console.log('[RDPTunnel] _connect() called, host:', this.params.host);
    const url = new URL(this.wsBase, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.port = '3001';
    url.pathname = '/ws';
    url.searchParams.set('host',       this.params.host);
    url.searchParams.set('port',       String(this.params.port));
    url.searchParams.set('username',   this.params.username);
    url.searchParams.set('password',   this.params.password);
    url.searchParams.set('domain',     this.params.domain);
    url.searchParams.set('width',      String(this.params.width));
    url.searchParams.set('height',     String(this.params.height));
    url.searchParams.set('colorDepth', String(this.params.colorDepth));
    url.searchParams.set('security',   this.params.security);
    url.searchParams.set('ignoreCert', String(this.params.ignoreCert));

    console.log('[RDPTunnel] WebSocket URL:', url.toString());
    this.ws = new WebSocket(url.toString());

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
        this.onerror(new Guacamole.Status(
          Guacamole.Status.Code.SERVER_ERROR, 'WebSocket error',
        ));
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

  // Keep override stubs so TypeScript doesn't complain about abstract methods
  override connect(_data: string) { this._connect(_data); }
  override sendMessage(...elements: unknown[]) { this._sendMessage(...elements); }
  override disconnect() { this._disconnect(); }
}
