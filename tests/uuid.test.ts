import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { uuid } from '../src/uuid';
import { createGame } from '../src/engine/game';

afterEach(() => vi.unstubAllGlobals());

it('supports command IDs and local games when HTTP exposes no randomUUID', () => {
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  const ids = Array.from({ length: 100 }, () => uuid());
  ids.forEach(id => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  expect(new Set(ids).size).toBe(ids.length);
  expect(createGame(['Camille', 'Daniel']).id).toMatch(/^[0-9a-f-]{36}$/);
});
