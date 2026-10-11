import { test, expect, type Page } from '@playwright/test';
test.setTimeout(90_000);
test.use({ actionTimeout: 15_000 });
async function online(page: Page) { await page.goto('/'); await page.getByRole('button',{name:'Jouer en ligne'}).click(); await expect(page.getByRole('heading',{name:'Retrouvez vos dockers.'})).toBeVisible(); }
async function create(page: Page, name = 'Camille') {
  await online(page); await page.getByLabel('Pseudo en ligne').fill(name); await page.getByRole('button',{name:'Créer la partie privée'}).click();
  await expect(page.getByRole('heading',{name:'Votre code personnel'})).toBeVisible(); const recovery=(await page.locator('.personal-code').textContent())!;
  await page.getByRole('button',{name:'Fermer',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tout le monde à bord ?'})).toBeVisible();
  const code=(await page.locator('.invite-code strong').textContent())!; return {code,recovery};
}
async function join(page: Page, code: string, name: string, spectator=false, accepted=true) {
  await online(page); await page.getByRole('button',{name:'Rejoindre',exact:true}).click(); await page.getByLabel('Pseudo en ligne').fill(name); await page.getByLabel('Code de la partie',{exact:true}).fill(code);
  if(spectator) await page.getByRole('radio',{name:'Spectateur'}).check();
  await page.getByRole('button',{name:'Rejoindre la partie'}).click();
  if(!spectator && accepted) { await expect(page.getByRole('heading',{name:'Votre code personnel'})).toBeVisible(); await page.getByRole('button',{name:'Fermer',exact:true}).click(); }
}
test('salon privé, coups synchronisés, observation et refus d’une arrivée tardive',async({browser,page})=>{
  const guestContext=await browser.newContext(), spectatorContext=await browser.newContext(), lateContext=await browser.newContext();
  // One rendered 3D board is enough: other clients exercise the accessible fallback.
  for (const context of [guestContext,spectatorContext,lateContext]) await context.addInitScript(() => {
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this: HTMLCanvasElement, kind: string, ...args: unknown[]) { return kind.startsWith('webgl') ? null : getContext.call(this,kind as '2d',...args); } as typeof getContext;
  });
  try {
    const guest=await guestContext.newPage(), spectator=await spectatorContext.newPage(), late=await lateContext.newPage();
    const {code}=await create(page); await join(guest,code,'Daniel');
    await expect(page.locator('.online-members')).toContainText('Daniel');
    await page.getByRole('button',{name:'Je suis prêt',exact:true}).click(); await guest.getByRole('button',{name:'Je suis prêt',exact:true}).click();
    await expect(page.getByRole('button',{name:'Lancer la partie'})).toBeEnabled(); await page.getByRole('button',{name:'Lancer la partie'}).click();
    await expect(page.getByLabel('Écran de jeu')).toBeVisible(); await expect(guest.getByLabel('Écran de jeu')).toBeVisible();
    await join(spectator,code,'Visiteur',true); await expect(spectator.getByLabel('Écran de jeu')).toBeVisible();
    await expect(spectator.locator('.floating-actions')).toHaveCount(0);
    await join(late,code,'Nouveau',false,false); await expect(late.getByRole('alert')).toContainText('commencé');
    const activeName=await page.locator('.turn-badge strong').textContent(); const active=activeName==='Camille'?page:guest;
    await active.getByRole('button',{name:'Ouvrir les outils'}).click(); await active.getByRole('button',{name:'Liste des caisses',exact:true}).click();
    await active.locator('.crate-list-grid').getByRole('button',{name:/Zanzibar/}).click();
    await active.getByRole('button',{name:'Ouvrir les outils'}).click(); await active.getByRole('button',{name:'Commandes accessibles',exact:true}).click();
    await active.getByText('Commandes accessibles du mouvement',{exact:true}).click(); await active.getByRole('button',{name:/^Chuter sur la case/}).first().click();
    await expect(page.locator('.essential-progress .done')).toHaveCount(1); await expect(guest.locator('.essential-progress .done')).toHaveCount(1); await expect(spectator.locator('.essential-progress .done')).toHaveCount(1);
    await spectator.getByRole('button',{name:'Ouvrir les outils'}).click(); await expect(spectator.getByRole('button',{name:'Abandonner la partie',exact:true})).toHaveCount(0);
  } finally { await guestContext.close(); await spectatorContext.close(); await lateContext.close(); }
});
test('reprise sur un autre appareil avec remplacement de l’ancienne connexion',async({browser,page})=>{
  const context=await browser.newContext();
  try {
    const {code,recovery}=await create(page,'Marina'); const second=await context.newPage(); await online(second);
    await second.getByRole('button',{name:'Reprendre ma place',exact:true}).click(); await second.getByLabel('Code de la partie',{exact:true}).fill(code); await second.getByLabel('Code personnel de récupération').fill(recovery);
    await second.getByRole('button',{name:'Reprendre ma place',exact:true}).last().click(); await expect(second.getByRole('heading',{name:'Votre code personnel'})).toBeVisible(); await second.getByRole('button',{name:'Fermer',exact:true}).click();
    await expect(second.locator('.online-members')).toContainText('Marina'); await expect(second.locator('.online-members li')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText('remplacée'); await expect(page.getByRole('button',{name:'Je suis prêt',exact:true})).toBeDisabled();
    await second.reload(); await expect(second.getByRole('heading',{name:'Tout le monde à bord ?'})).toBeVisible(); await expect(second.locator('.online-members li')).toHaveCount(1);
    const sibling=await context.newPage(); await sibling.goto('/'); await expect(sibling.getByRole('heading',{name:'Tout le monde à bord ?'})).toBeVisible();
    await expect(second.getByRole('alert')).toContainText('remplacée'); await sibling.reload(); await expect(sibling.getByRole('heading',{name:'Tout le monde à bord ?'})).toBeVisible();
  } finally { await context.close(); }
});
test('refus des pseudos doublons et copie manuelle si le navigateur bloque le presse-papiers',async({browser,page})=>{
  await page.addInitScript(()=>{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('blocked');}},configurable:true}); });
  const otherContext=await browser.newContext();
  try {
    await online(page); await page.getByLabel('Pseudo en ligne').fill('Camille'); await page.getByRole('button',{name:'Créer la partie privée'}).click();
    await expect(page.getByRole('status')).toContainText('Copie automatique indisponible'); await expect(page.getByRole('button',{name:'Copier le code personnel',exact:true})).toBeVisible(); await expect(page.locator('.personal-code')).toHaveText(/^[A-HJ-NP-Z2-9]{8}$/);
    await page.getByRole('button',{name:'Fermer',exact:true}).click(); const code=(await page.locator('.invite-code strong').textContent())!;
    const other=await otherContext.newPage(); await online(other); await other.getByRole('button',{name:'Rejoindre',exact:true}).click(); await other.getByLabel('Pseudo en ligne').fill('camille'); await other.getByLabel('Code de la partie',{exact:true}).fill(code); await other.getByRole('button',{name:'Rejoindre la partie'}).click(); await expect(other.getByRole('alert')).toContainText('déjà utilisé');
  } finally { await otherContext.close(); }
});
