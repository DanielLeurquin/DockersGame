import { expect, test, type Page } from '@playwright/test';
async function start(page: Page, count = 2) {
  await page.goto('/');
  if (count !== 2) await page.getByRole('button', { name: `${count} joueurs`, exact: true }).click();
  await page.getByLabel('Nom du joueur 1').fill('Camille');
  await page.getByLabel('Nom du joueur 2').fill('Alex');
  if (count > 2) await page.getByLabel('Nom du joueur 3').fill('Lou');
  await page.getByRole('button', { name: 'Commencer la partie' }).click();
  await expect(page.getByText('Ouvrez l’entrepôt : faites chuter une caisse du sommet.')).toBeVisible();
}
async function tools(page: Page) {
  await page.getByRole('button', { name: 'Ouvrir les outils' }).click();
}
async function select(page: Page, port: string) {
  await tools(page);
  await page.getByRole('button', { name: 'Liste des caisses', exact: true }).click();
  await page.locator('.crate-list-grid').getByRole('button', { name: new RegExp(port) }).click();
}
async function overhead(page: Page) {
  await tools(page); await page.getByRole('button', { name: 'Dessus', exact: true }).click();
  await page.getByRole('button', { name: 'Fermer le panneau' }).click();
}
async function opening(page: Page) {
  await select(page, 'Zanzibar'); await overhead(page);
  await page.getByRole('button', { name: 'Chuter sur la case X 1, Y 2, sol', exact: true }).click();
  await expect(page.locator('.essential-progress .done')).toHaveCount(1);
}
async function finishMoves(page: Page) {
  await opening(page);
  await page.getByRole('button', { name: 'Pivoter', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    const pivot = page.getByRole('button', { name: 'Pivoter à droite', exact: true });
    await expect(pivot).toBeEnabled(); await pivot.click();
  }
  await expect(page.getByText('La Douane, à vous de décider.')).toBeVisible();
}
async function savedState(page: Page) {
  return page.evaluate(async () => { const module = await import('/src/storage/save.ts' as string); return module.loadGame(); });
}

test('partie complète dans le navigateur : ouverture, trois coups, Douane, reprise et abandon', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  await expect(page.locator('canvas')).toBeVisible();
  await finishMoves(page);
  await page.getByRole('button', { name: 'Placer la Douane ici' }).click();
  await expect(page.locator('.turn-number')).toContainText('TOUR 02');
  const saved = await savedState(page);
  expect(saved.customsId).toBe(19); expect(saved.movesMade).toBe(0);
  await page.reload();
  await expect(page.locator('.turn-number')).toContainText('TOUR 02');
  expect((await savedState(page)).deadline).toBe(saved.deadline);
  await select(page, 'Zanzibar');
  await page.getByRole('button', { name: 'Inspecter la caisse' }).click();
  await expect(page.locator('.crate-status')).toContainText('Sous Douane');
  await page.getByRole('button', { name: 'Fermer le panneau' }).click();
  await tools(page);
  await page.getByRole('button', { name: 'Abandonner la partie' }).click();
  await page.getByRole('button', { name: 'Confirmer l’abandon' }).click();
  await expect(page.getByText('DÉCOMPTE FINAL')).toBeVisible();
  await expect(page.locator('.results h2')).toContainText('gagne');
  await page.reload();
  await expect(page.getByText('DÉCOMPTE FINAL')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/partie-resultat.png', fullPage: true });
});

test('aide et inspection au clavier sur tablette, aucune pause et orientation stable', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/accueil-tablette.png', fullPage: true });
  await page.getByRole('button', { name: 'Les règles' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await start(page, 3);
  await select(page, 'Zanzibar');
  await page.getByRole('button', { name: 'Inspecter la caisse' }).click();
  await expect(page.locator('.face-chip')).toHaveCount(6);
  const faces = await page.locator('.face-grid').innerText();
  await page.getByRole('button', { name: 'Voir le dessous' }).click();
  expect(await page.locator('.face-grid').innerText()).toBe(faces);
  await expect(page.getByRole('button', { name: /pause/i })).toHaveCount(0);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 820);
  await page.screenshot({ path: 'test-results/plateau-tablette.png', fullPage: true });
});

test('expiration pendant la phase Douane restaure les trois coups avant le tour suivant', async ({ page }) => {
  await start(page, 3); await finishMoves(page);
  await page.evaluate(async () => {
    const storage = await import('/src/storage/save.ts' as string); const g = await storage.loadGame();
    localStorage.removeItem('dockers-secours-v1');
    g.turnStartedAt = Date.now() - 301_000; g.deadline = g.turnStartedAt + 300_000;
    await storage.saveGame(g);
  });
  await page.reload();
  await expect(page.locator('.turn-number')).toContainText('TOUR 02');
  const g = await savedState(page);
  expect(g.players.filter((p: { abandonedAt: number | null }) => p.abandonedAt !== null)).toHaveLength(1);
  expect(g.board.find((c: { id: number }) => c.id === 19)).toMatchObject({ x: 1, y: 1, z: 2, orientation: [0,1,2,3,4,5] });
  expect(g.movesMade).toBe(0); expect(g.customsId).toBeNull(); expect(g.events.filter((e: { reverted?: boolean }) => e.reverted)).toHaveLength(3);
});

test('un deuxième onglet ne peut pas écraser la partie et une sauvegarde corrompue est préservée', async ({ page, context }) => {
  await start(page); const second = await context.newPage(); await second.goto('/');
  await expect(second.getByRole('alert')).toContainText('autre onglet');
  await expect(second.getByRole('button', { name: 'Commencer la partie' })).toBeDisabled();
  await second.close();
  await page.evaluate(async () => { localStorage.removeItem('dockers-secours-v1'); const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('dockers-parties', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); const tx = db.transaction('parties', 'readwrite'); tx.objectStore('parties').put({ version: 99, data: 'préserver' }, 'courante'); await new Promise<void>(resolve => { tx.oncomplete = () => resolve(); }); db.close(); });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('endommagée');
  await page.getByRole('button', { name: 'Commencer la partie' }).click();
  const archived = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const req = indexedDB.open('dockers-parties', 1); req.onsuccess = () => resolve(req.result); }); const tx = db.transaction('parties'); const request = tx.objectStore('parties').getAll(); const values = await new Promise<any[]>(resolve => { request.onsuccess = () => resolve(request.result); }); db.close(); return values; });
  expect(archived.some(v => v.version === 99)).toBe(true);
});

test('pivot sur le plateau : sens inverse bloqué et demi-tour en un seul coup', async ({ page }) => {
  await start(page); await opening(page);
  await page.getByRole('button', { name: 'Pivoter', exact: true }).click();
  const right = page.getByRole('button', { name: 'Pivoter à droite', exact: true });
  await expect(right).toBeEnabled(); await right.click();
  await expect(page.locator('.essential-progress .done')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Pivoter à gauche', exact: true })).toBeDisabled();
  await page.getByLabel('Demi-tour', { exact: true }).check();
  const half = page.getByRole('button', { name: 'Pivoter à droite — demi-tour', exact: true });
  await expect(half).toBeEnabled(); await half.click();
  await expect(page.getByText('La Douane, à vous de décider.')).toBeVisible();
  const g = await savedState(page);
  expect(g.movesMade).toBe(3); expect(g.events.at(-1).move.quarterTurns).toBe(2);
  await expect(page.locator('.plateau-pivots')).toHaveCount(0);
});

test('bascule par case : prévisualisation sans coup, double clic et arrivée réelle', async ({ page }) => {
  await start(page); await opening(page);
  await page.getByRole('button', { name: 'Basculer', exact: true }).click();
  const target = page.getByRole('button', { name: 'Basculer sur la case X 2, Y 2, sol', exact: true });
  await expect(target).toBeEnabled(); const before = await savedState(page);
  await target.hover();
  expect((await savedState(page)).events.length).toBe(before.events.length);
  await target.dblclick();
  await expect(page.locator('.essential-progress .done')).toHaveCount(2);
  const after = await savedState(page);
  expect(after.board.find((c: {id: number}) => c.id === 19)).toMatchObject({x:2,y:2,z:0});
  expect(after.events.length).toBe(before.events.length + 1);
  await page.screenshot({ path: 'test-results/bascule-immersive.png', fullPage: true });
});

test('chute avec orientation gratuite, glissement sans coup et inspection indépendante', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await start(page); await select(page, 'Zanzibar'); await overhead(page);
  await page.getByRole('button', { name: 'Tourner l’arrivée à droite' }).click();
  const before = await savedState(page); expect(before.movesMade).toBe(0);
  const target = page.getByRole('button', { name: 'Chuter sur la case X 1, Y 2, sol', exact: true });
  await expect(target).toBeVisible();
  const rect = (await target.boundingBox())!;
  await page.mouse.move(rect.x + rect.width/2, rect.y + rect.height/2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width/2 + 18, rect.y + rect.height/2 + 10, { steps: 4 }); await page.mouse.up();
  expect((await savedState(page)).movesMade).toBe(0);
  await target.focus(); await page.keyboard.press('Enter'); await expect(page.locator('.essential-progress .done')).toHaveCount(1);
  const fallen = await savedState(page); const c = fallen.board.find((c: {id:number}) => c.id === 19);
  expect(c).toMatchObject({x:1,y:2,z:0}); expect(c.orientation[0]).toBe(0);
  expect(c.orientation).not.toEqual([0,1,2,3,4,5]);
  await page.getByRole('button', { name: 'Inspecter la caisse' }).click();
  await expect(page.locator('.inspector-canvas canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Voir le dessous' }).click();
  await page.getByRole('button', { name: 'Tourner l’observation' }).click();
  const inspected = await savedState(page); expect(inspected.board).toEqual(fallen.board); expect(inspected.events).toEqual(fallen.events); expect(inspected.deadline).toBe(fallen.deadline);
});

test('écran épuré et commandes accessibles sans cibles WebGL', async ({ page }) => {
  await start(page);
  await expect(page.locator('.app-header')).toHaveCount(0); await expect(page.locator('.app-footer')).toHaveCount(0);
  await expect(page.locator('.floating-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Basculer', exact: true })).toBeVisible();
  await select(page, 'Zanzibar'); await page.getByRole('button', { name: 'Inspecter la caisse' }).click();
  await page.getByText('Commandes accessibles du mouvement', { exact: true }).click();
  const target = page.locator('.accessible-moves').getByRole('button', { name: 'Chuter sur la case X 1, Y 2, sol', exact: true });
  await target.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.essential-progress .done')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(page.locator('.floating-panel')).toHaveCount(0);
  await expect(page.getByRole('timer')).toBeVisible();
});

test('sélection réelle sur le cube 3D et chute directe sur sa case', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await start(page); await overhead(page);
  const canvas = page.locator('.immersive-scene canvas'); await expect(canvas).toBeVisible();
  const r = (await canvas.boundingBox())!; const zoom = Math.min(95, r.width / 11, r.height / 10);
  await canvas.click({ position: { x: r.width / 2 + zoom, y: r.height / 2 - zoom } });
  await expect(page.locator('.selection-strip strong')).toHaveText('Zanzibar');
  await page.getByRole('button', { name: 'Chuter sur la case X 1, Y 2, sol', exact: true }).click();
  await expect(page.locator('.essential-progress .done')).toHaveCount(1);
});

test('sans WebGL, les six faces et le mouvement accessible restent utilisables', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (...args: any[]) => any).apply(this, [type, ...args]);
    } as typeof original;
  });
  await start(page); await expect(page.locator('.immersive-scene .canvas-fallback')).toBeVisible();
  await select(page, 'Zanzibar'); await page.getByRole('button', { name: 'Inspecter la caisse' }).click();
  await expect(page.locator('.face-chip')).toHaveCount(6);
  await page.getByText('Commandes accessibles du mouvement', { exact: true }).click();
  await page.locator('.accessible-moves').getByRole('button', { name: 'Chuter sur la case X 1, Y 2, sol', exact: true }).click();
  await expect(page.locator('.essential-progress .done')).toHaveCount(1);
});
