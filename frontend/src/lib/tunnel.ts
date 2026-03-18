import Guacamole from 'guacamole-common-js';
import type { ConnectParams } from '../types';

// setState is a protected method in guacamole-common-js but not exposed in the TS types
type TunnelInternal = { setState: (state: Guacamole.Tunnel.State) => void };

/**
 * Custom Guacamole tunnel backed by a plain WebSocket.
 * Connection params are passed as query-string to the /ws endpoint.
 */
export class RDPTunnel extends Guacamole.Tunnel {
  private ws: WebSocket | null = null;
  private buffer = '';

  constructor(
    private readonly wsBase: string,
    private readonly params: ConnectParams,
  ) {
    super();
  }

  private setTunnelState(state: Guacamole.Tunnel.State) {
    (this as unknown as TunnelInternal).setState(state);
  }

  override connect(_data: string) {
    console.log('[RDPTunnel] connect() called, host:', this.params.host);
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
      this.setTunnelState(Guacamole.Tunnel.State.OPEN);
    };

    this.ws.onclose = (e) => {
      this.setTunnelState(Guacamole.Tunnel.State.CLOSED);
      if (!e.wasClean && this.onerror) {
        this.onerror(new Guacamole.Status(
          Guacamole.Status.Code.UPSTREAM_NOT_FOUND, e.reason || 'Connection closed',
        ));
      }
    };

    this.ws.onerror = () => {
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

  override sendMessage(...elements: unknown[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const encoded = elements
        .map((s) => { const str = String(s); return `${str.length}.${str}`; })
        .join(',') + ';';
      this.ws.send(encoded);
    }
  }

  override disconnect() {
    this.ws?.close();
    this.setTunnelState(Guacamole.Tunnel.State.CLOSED);
  }
}
