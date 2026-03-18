import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GuacdClient } from './guacdClient';
import type { RDPParams } from './types';

const GUACD_HOST = process.env.GUACD_HOST ?? 'localhost';
const GUACD_PORT = parseInt(process.env.GUACD_PORT ?? '4822', 10);
const PORT       = parseInt(process.env.PORT       ?? '3001', 10);

// ── HTTP server (health + CORS) ───────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, guacd: `${GUACD_HOST}:${GUACD_PORT}` }));
    return;
  }
  res.writeHead(404); res.end();
});

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url ?? '', `http://localhost`);
  const q   = url.searchParams;

  const params: RDPParams = {
    host:       q.get('host')       ?? '',
    port:       parseInt(q.get('port') ?? '3389', 10),
    username:   q.get('username')   ?? '',
    password:   q.get('password')   ?? '',
    domain:     q.get('domain')     ?? '',
    width:      parseInt(q.get('width')      ?? '1920', 10),
    height:     parseInt(q.get('height')     ?? '1080', 10),
    colorDepth: parseInt(q.get('colorDepth') ?? '24',   10),
    security:   q.get('security')   ?? 'any',
    ignoreCert: q.get('ignoreCert') !== 'false',
  };

  if (!params.host) {
    console.error('[rdp] rejected: missing host parameter');
    ws.close(1008, 'Missing host parameter');
    return;
  }

  console.log(`[rdp] new WS connection from ${req.socket.remoteAddress}`);
  console.log(`[rdp] connect → ${params.username}@${params.host}:${params.port} (${params.width}×${params.height} ${params.colorDepth}bpp security=${params.security} ignoreCert=${params.ignoreCert})`);

  const guacd = new GuacdClient(GUACD_HOST, GUACD_PORT);

  guacd.handshake(params)
    .then((readyInstr: string) => {
      console.log(`[rdp] session ready for ${params.host}`);

      // Forward the `ready` instruction so Guacamole.Client transitions to CONNECTED
      if (ws.readyState === WebSocket.OPEN) ws.send(readyInstr);

      // guacd → browser
      guacd.on('instruction', (instr: string) => {
        console.log(`[guacd→browser] ${instr.substring(0, 120)}`);
        if (ws.readyState === WebSocket.OPEN) ws.send(instr);
      });

      // browser → guacd
      ws.on('message', (data) => {
        const str = data.toString();
        console.log(`[browser→guacd] ${str.substring(0, 120)}`);
        guacd.send(str);
      });
    })
    .catch((err: Error) => {
      console.error(`[rdp] handshake failed for ${params.host}:`, err.message);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, err.message);
      guacd.destroy();
    });

  // Clean up when either side closes
  guacd.on('close', () => {
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'Session ended');
  });
  guacd.on('error', (err: Error) => {
    console.error('[rdp] guacd error:', err.message);
    if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'Backend error');
  });
  ws.on('close', () => guacd.destroy());
  ws.on('error', (err) => {
    console.error('[rdp] ws error:', err.message);
    guacd.destroy();
  });
});

httpServer.listen(PORT, () => {
  console.log(`RDP proxy  →  :${PORT}`);
  console.log(`guacd      →  ${GUACD_HOST}:${GUACD_PORT}`);
});
