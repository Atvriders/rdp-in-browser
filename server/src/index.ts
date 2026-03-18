import * as http from 'http';
import * as crypto from 'crypto';
import GuacamoleLite from 'guacamole-lite';

const GUACD_HOST  = process.env.GUACD_HOST  ?? 'localhost';
const GUACD_PORT  = parseInt(process.env.GUACD_PORT  ?? '4822', 10);
const PORT        = parseInt(process.env.PORT        ?? '3001', 10);

// 32-byte key for AES-256-CBC token encryption
const KEY = Buffer.from(
  (process.env.ENCRYPTION_KEY ?? 'rdp-in-browser-default-key-32by').slice(0, 32).padEnd(32, '0'),
);

// ── Token generation ──────────────────────────────────────────────────────────

interface ConnectBody {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  domain?: string;
  width?: number;
  height?: number;
  colorDepth?: number;
  security?: string;
  ignoreCert?: boolean;
}

function makeToken(p: ConnectBody): string {
  const payload = {
    connection: {
      type: 'rdp',
      settings: {
        hostname:              p.host,
        port:                  String(p.port ?? 3389),
        username:              p.username ?? '',
        password:              p.password ?? '',
        domain:                p.domain   ?? '',
        width:                 String(p.width      ?? 1920),
        height:                String(p.height     ?? 1080),
        dpi:                   '96',
        'color-depth':         String(p.colorDepth ?? 24),
        security:              p.security  ?? 'any',
        'ignore-cert':         (p.ignoreCert !== false) ? 'true' : 'false',
        'disable-audio':       'true',
        'enable-font-smoothing':      'true',
        'enable-full-window-drag':    'false',
        'enable-desktop-composition': 'false',
        'enable-menu-animations':     'false',
        'disable-bitmap-caching':     'false',
        'disable-offscreen-caching':  'false',
        'disable-glyph-caching':      'false',
        'resize-method':       'reconnect',
      },
    },
  };
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  const enc     = cipher.update(JSON.stringify(payload), 'utf8', 'base64') + cipher.final('base64');
  return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), value: enc })).toString('base64');
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/token') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const params = JSON.parse(body) as ConnectBody;
        if (!params.host) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing host' }));
          return;
        }
        console.log(`[rdp] token request → ${params.username ?? ''}@${params.host}:${params.port ?? 3389}`);
        const token = makeToken(params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, guacd: `${GUACD_HOST}:${GUACD_PORT}` }));
    return;
  }

  res.writeHead(404); res.end();
});

// ── GuacamoleLite WebSocket bridge ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
new (GuacamoleLite as any)(
  { server: httpServer, path: '/ws' },
  { host: GUACD_HOST, port: GUACD_PORT },
  {
    crypt: { cypher: 'AES-256-CBC', key: KEY.toString() },
    log: { level: 'DEBUG' },
  },
);

httpServer.listen(PORT, () => {
  console.log(`RDP proxy  →  :${PORT}`);
  console.log(`guacd      →  ${GUACD_HOST}:${GUACD_PORT}`);
});
