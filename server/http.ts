import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { OnlineError, Rooms } from './rooms';
import type { OnlineCommand } from '../src/online/types';
const json = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
export function onlineServer(rooms: Rooms, options: { origins?: string[]; staticDir?: string } = {}) {
  const attempts = new Map<string, { count: number; until: number }>();
  function limited(key: string, max: number, now: number) {
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    const entry = attempts.get(key) ?? { count: 0, until: now + 60_000 }; entry.count++; attempts.set(key, entry);
    if (entry.count > max) throw new OnlineError('Trop de demandes. Réessayez dans une minute.', 429);
  }
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') return json(res, 200, { status: 'ok' });
    if (url.pathname.startsWith('/api/online/')) {
      const origin = req.headers.origin;
      const own = `${('encrypted' in req.socket && req.socket.encrypted) ? 'https' : 'http'}://${req.headers.host}`;
      // Same-origin self-hosting and explicitly configured Pages origins only.
      if (origin && origin !== own && !options.origins?.includes(origin)) return json(res, 403, { error: 'Origine non autorisée.' });
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
      try {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new OnlineError('Requête JSON attendue.', 415);
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8192) throw new OnlineError('Requête trop volumineuse.', 413); }
        const receivedAt = Date.now();
        const data = JSON.parse(body) as Record<string, unknown>; if (!data || typeof data !== 'object' || Array.isArray(data)) throw new OnlineError('Requête invalide.');
        const action = url.pathname.slice('/api/online/'.length);
        const ip = req.socket.remoteAddress ?? 'unknown';
        // Never trust client-supplied forwarded IPs; proxies should enforce their own per-user rate limits.
        limited(`${ip}:all`, 6000, receivedAt);
        if (['create', 'join', 'resume'].includes(action)) limited(`${ip}:entry`, 30, receivedAt);
        if (action === 'resume' && data.recovery) limited(`${ip}:recovery`, 10, receivedAt);
        let result: unknown;
        if (action === 'create') result = rooms.create(data.name, data.count, data.difficulty, receivedAt);
        else if (action === 'join') result = rooms.join(data.room, data.name, data.role, receivedAt);
        else if (action === 'resume') result = rooms.resume(data.room, data.token, data.recovery, receivedAt);
        else if (action === 'poll') result = rooms.poll(data.room, data.token, receivedAt);
        else if (action === 'command') result = rooms.command(data.room, data.token, data.requestId, data.command as OnlineCommand, receivedAt);
        else if (action === 'disconnect') { rooms.disconnect(data.room, data.token, receivedAt); result = { ok: true }; }
        else if (action === 'leave') { rooms.leave(data.room, data.token, receivedAt); result = { ok: true }; }
        else throw new OnlineError('Route inconnue.', 404);
        return json(res, 200, result);
      } catch (e) {
        if (e instanceof OnlineError) return json(res, e.status, { error: e.message });
        if (e instanceof SyntaxError) return json(res, 400, { error: 'Requête JSON invalide.' });
        // Rule validation errors are safe messages; internal filesystem failures are not.
        const error = e as NodeJS.ErrnoException;
        if (error.code) return json(res, 503, { error: 'Le service de parties est temporairement indisponible.' });
        return json(res, 400, { error: error.message || 'Action invalide.' });
      }
    }
    if (options.staticDir && req.method === 'GET') {
      const root = resolve(options.staticDir);
      let path: string; try { path = resolve(root, '.' + decodeURIComponent(url.pathname)); } catch { return json(res, 400, { error: 'Chemin invalide.' }); }
      if (path !== root && !path.startsWith(root + sep)) return json(res, 403, { error: 'Chemin interdit.' });
      if (!existsSync(path) || statSync(path).isDirectory()) path = resolve(root, 'index.html');
      if (existsSync(path)) { res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600' }); return res.end(readFileSync(path)); }
    }
    json(res, 404, { error: 'Service introuvable.' });
  });
}
