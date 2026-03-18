import Guacamole from 'guacamole-common-js';
import type { ConnectParams } from '../types';

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

  override connect(_data: string) {
    const url = new URL(this.wsBase, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
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

    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      this.setState(Guacamole.Tunnel.State.OPEN);
    };

    this.ws.onclose = (e) => {
      this.setState(Guacamole.Tunnel.State.CLOSED);
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

  override sendMessage(...elements: object[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const strs = elements as string[];
      const encoded = strs.map((s) => `${s.length}.${s}`).join(',') + ';';
      this.ws.send(encoded);
    }
  }

  override disconnect() {
    this.ws?.close();
    this.setState(Guacamole.Tunnel.State.CLOSED);
  }
}
