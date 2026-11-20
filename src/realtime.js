let wss = null;
const byUser = new Map();

export function attachWebSocket(server, resolveToken) {
  // Lazy import keeps `ws` optional for tests that don't need it.
  return import('ws').then(({ WebSocketServer }) => {
    wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/ws') { socket.destroy(); return; }
      const raw = req.headers.cookie || '';
      const m = raw.match(/(?:^|;\s*)bs_session=([^;]+)/);
      resolveToken(m ? decodeURIComponent(m[1]) : null).then((user) => {
        if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.userId = user.id;
          wss.emit('connection', ws, req);
          if (!byUser.has(user.id)) byUser.set(user.id, new Set());
          byUser.get(user.id).add(ws);
          ws.on('close', () => byUser.get(user.id)?.delete(ws));
          ws.send(JSON.stringify({ type: 'hello', user }));
        });
      });
    });
    return wss;
  });
}

export function broadcast(type, payload) {
  if (!wss) return;
  const msg = JSON.stringify({ type, payload, at: new Date().toISOString() });
  for (const clients of byUser.values()) {
    for (const ws of clients) if (ws.readyState === 1) { try { ws.send(msg); } catch {} }
  }
}
