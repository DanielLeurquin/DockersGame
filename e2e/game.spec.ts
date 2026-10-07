import { expect, test, type Page } from '@playwright/test';
async function start(page: Page, count = 2) {
  await page.goto('/');
  if (count !== 2) await page.getByRole('button', { name: `${count} joueurs`, exact: true }).click();
  await page.getByLabel('Nom du joueur 1').fill('Camille');
  await page.getByLabel('Nom du joueur 2').fill('Alex');
  if (count > 2) await page.getByLabel('Nom du joueur 3').fill('Lou');
  await page.getByRole('button', { name: 'Commencer la partie' }).click();
  await expect(page.getByText('Ouvrez l’entrepôt.')).toBeVisible();
}
async function select(page: Page, port: string) {
  const details = page.locator('.crate-list');
  if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) await details.locator('summary').click();
  await details.getByRole('button', { name: new RegExp(port) }).click();
}
async function opening(page: Page) {
  await select(page, 'Zanzibar');
  await page.locator('.move-options').getByRole('button', { name: 'Nord', exact: true }).click();
  await page.getByRole('button', { name: 'Effectuer la chute' }).click();
  await expect(page.getByText('2 mouvements à effectuer.')).toBeVisible();
}
async function finishMoves(page: Page) {
  await opening(page);
  await page.getByRole('button', { name: 'Pivoter', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.locator('.move-options').getByRole('button', { name: '90°', exact: true }).click();
    await page.getByRole('button', { name: 'Effectuer le pivot' }).click();
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
  await expect(page.locator('.game-sidebar > .eyebrow')).toContainText('TOUR 02');
  const saved = await savedState(page);
  expect(saved.customsId).toBe(19); expect(saved.movesMade).toBe(0);
  await page.reload();
  await expect(page.locator('.game-sidebar > .eyebrow')).toContainText('TOUR 02');
  expect((await savedState(page)).deadline).toBe(saved.deadline);
  await select(page, 'Zanzibar');
  await expect(page.locator('.crate-status')).toContainText('Sous Douane');
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
  await expect(page.locator('.face-chip')).toHaveCount(6);
  const faces = await page.locator('.face-grid').innerText();
  await page.locator('.view-bar').getByRole('button', { name: 'Dessus', exact: true }).click();
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
  await expect(page.locator('.game-sidebar > .eyebrow')).toContainText('TOUR 02');
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
