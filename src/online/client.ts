import type { OnlineResponse, OnlineSession } from './types';
const configured = import.meta.env.VITE_ONLINE_URL?.trim();
export const ONLINE_URL = configured ? configured.replace(/\/$/, '') : '';
const KEY = 'dockers-online-session-v1';
export class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request(action: string, data: unknown, keepalive = false): Promise<OnlineResponse> {
  let response: Response;
  try { response = await fetch(`${ONLINE_URL}/api/online/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive, signal: keepalive ? undefined : AbortSignal.timeout(10_000) }); }
  catch { throw new RequestError('Connexion au service de parties indisponible. Votre temps de tour continue.', 0); }
  let value: OnlineResponse & { error?: string };
  try { value = await response.json(); } catch { throw new RequestError('Le service de parties en ligne est indisponible sur cette adresse.', 503); }
  if (!response.ok) throw new RequestError(value.error ?? 'Action refusée.', response.status);
  return value;
}
export function remembered(): OnlineSession | null {
  try { const value = JSON.parse(localStorage.getItem(KEY) || 'null'); return value && typeof value.room === 'string' && typeof value.token === 'string' && typeof value.member === 'string' ? value : null; } catch { return null; }
}
export function remember(session: OnlineSession | null) { try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch { /* Current page remains usable; recovery code is still visible. */ } }

export function forget(token: string) { if (remembered()?.token === token) remember(null); }
