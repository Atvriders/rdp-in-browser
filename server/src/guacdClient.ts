import * as net from 'net';
import { EventEmitter } from 'events';
import type { RDPParams } from './types';

// ── Guacamole protocol helpers ────────────────────────────────────────────────

function encode(opcode: string, args: string[]): string {
  const all = [opcode, ...args];
  return all.map(s => `${s.length}.${s}`).join(',') + ';';
}

function parseInstruction(raw: string): string[] {
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
  return parts;
}

// Map guacd arg names → RDP param values
function paramValue(arg: string, p: RDPParams): string {
  const m: Record<string, string> = {
    hostname:                     p.host,
    port:                         String(p.port),
    username:                     p.username,
    password:                     p.password,
    domain:                       p.domain,
    width:                        String(p.width),
    height:                       String(p.height),
    dpi:                          '96',
    'color-depth':                String(p.colorDepth),
    security:                     p.security,
    'ignore-cert':                p.ignoreCert ? 'true' : 'false',
    'enable-drive':               'false',
    'create-drive-path':          'false',
    'enable-audio':               'true',
    'enable-font-smoothing':      'true',
    'enable-full-window-drag':    'false',
    'enable-desktop-composition': 'false',
    'enable-menu-animations':     'false',
    'disable-bitmap-caching':     'false',
    'disable-offscreen-caching':  'false',
    'disable-glyph-caching':      'false',
  };
  return m[arg] ?? '';
}

// ── GuacdClient ───────────────────────────────────────────────────────────────

export class GuacdClient extends EventEmitter {
  private socket: net.Socket;
  private buffer = '';

  constructor(host: string, port: number) {
    super();
    this.socket = new net.Socket();
    this.socket.setEncoding('utf8');
    this.socket.connect(port, host);

    this.socket.on('data', (data: string) => {
      this.buffer += data;
      let end: number;
      while ((end = this.buffer.indexOf(';')) !== -1) {
        const instr = this.buffer.substring(0, end + 1);
        this.buffer = this.buffer.substring(end + 1);
        this.emit('instruction', instr);
      }
    });

    this.socket.on('close', () => this.emit('close'));
    this.socket.on('error', (err) => this.emit('error', err));
  }

  /** Perform SELECT → ARGS → CONNECT → READY handshake */
  handshake(params: RDPParams): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('guacd handshake timeout')), 15_000);

      // Step 1: SELECT rdp
      this.socket.write(encode('select', ['rdp']));

      // Step 2: Wait for ARGS
      const onArgs = (raw: string) => {
        const parts = parseInstruction(raw);
        if (parts[0] !== 'args') return;
        this.removeListener('instruction', onArgs);

        // Step 3: CONNECT with param values in the order guacd requested
        const argNames = parts.slice(1);
        const values = argNames.map(a => paramValue(a, params));
        this.socket.write(encode('connect', values));

        // Step 4: Wait for READY (or ERROR)
        const onReady = (raw2: string) => {
          const p2 = parseInstruction(raw2);
          if (p2[0] === 'ready') {
            this.removeListener('instruction', onReady);
            clearTimeout(timeout);
            // Re-emit future instructions normally
            this.socket.on('data', () => {}); // already hooked above
            resolve();
          } else if (p2[0] === 'error') {
            this.removeListener('instruction', onReady);
            clearTimeout(timeout);
            reject(new Error(p2[1] ?? 'guacd error'));
          }
        };
        this.on('instruction', onReady);
      };
      this.on('instruction', onArgs);
    });
  }

  send(data: string) {
    if (!this.socket.destroyed) this.socket.write(data);
  }

  destroy() {
    this.socket.destroy();
  }
}
