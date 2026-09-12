import { test, expect, type Page } from '@playwright/test';
import type { Collection } from '../../src/shared/schemas/collection';
import type { AuthenticatedProfile } from '../../src/shared/contracts/auth';

const profile: AuthenticatedProfile = {
  user: {
    id: 'collection-a',
    senatiId: '00COL',
    firstNames: 'Ana',
    lastNames: 'Prueba',
    birthDate: '2000-01-01',
    age: 26,
    trainerName: 'Entrenadora de prueba',
    role: 'student',
    profileVersion: 0,
    avatarUrl: null,
  },
  initial: { instanceId: 'initial', speciesId: 25, probabilitiesVersion: 1 },
  session: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
};
function collection(): Collection {
  return {
    userId: profile.user.id,
    goal: 150,
    obtained: 1,
    total: 7,
    reserved: 1,
    available: 4,
    nextRefreshAt: null,
    species: [
      { speciesId: 25, total: 5, protected: 1, reserved: 1, available: 3 },
      { speciesId: 151, total: 2, protected: 1, reserved: 0, available: 1 },
    ],
  };
}
async function setup(page: Page) {
  let session: AuthenticatedProfile | null = profile;
  let data: unknown = collection();
  let status = 200;
  let calls = 0;
  await page.route('**/api/me', (route) =>
    route.fulfill(
      session
        ? { json: session }
        : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  );
  await page.route('**/api/me/collection', (route) => {
    calls++;
    return route.fulfill({ status, json: data });
  });
  await page.route('**/api/auth/logout', (route) => {
    session = null;
    return route.fulfill({ status: 204 });
  });
  return {
    set: (next: unknown, code = 200) => {
      data = next;
      status = code;
    },
    calls: () => calls,
    end: () => {
      session = null;
    },
  };
}

test('groups duplicates, shows protected/reserved/available counts, Mew and responsive filters', async ({
  page,
}, info) => {
  await setup(page);
  await page.goto('/coleccion');
  await expect(
    page.getByRole('heading', { name: '1 de 150 especies' }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await expect(page.getByRole('progressbar')).toHaveAttribute('max', '150');
  await expect(
    page.getByRole('list', { name: 'Tu colección' }).getByRole('listitem'),
  ).toHaveCount(2);
  await page
    .getByRole('button', {
      name: 'Ver ficha de Pikachu, número 25',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('dd')).toHaveText(['5', '1', '1', '3']);
  await page.keyboard.press('Escape');
  await page
    .getByLabel('Buscar por nombre o número', { exact: true })
    .fill('#151');
  await expect(
    page.getByRole('list', { name: 'Tu colección' }).getByRole('listitem'),
  ).toHaveCount(1);
  await page.getByLabel('Buscar por nombre o número', { exact: true }).fill('');
  await page
    .getByRole('radio', { name: 'Pendientes', exact: true })
    .locator('..')
    .click();
  await expect(
    page.getByRole('list', { name: 'Tu colección' }).getByRole('listitem'),
  ).toHaveCount(149);
  await page
    .getByRole('radio', { name: 'Mew adicional' })
    .locator('..')
    .click();
  await expect(page.getByRole('list', { name: 'Tu colección' })).toContainText(
    'Mew',
  );
  await page.getByRole('radio', { name: 'Repetidos' }).locator('..').click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({
    width: info.project.name.includes('mobile') ? 390 : 1440,
    height: 1000,
  });
  await page.screenshot({
    path: info.outputPath('collection.png'),
    fullPage: true,
  });
});

test('refreshes on return, focus and confirmed-change broadcast, without keeping stale data on errors', async ({
  page,
}) => {
  const mock = await setup(page);
  await page.goto('/coleccion');
  await expect(
    page.getByRole('heading', { name: '1 de 150 especies' }),
  ).toBeVisible();
  mock.set({
    ...collection(),
    obtained: 2,
    total: 8,
    species: [
      ...collection().species,
      { speciesId: 150, total: 1, protected: 1, reserved: 0, available: 0 },
    ],
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(
    page.getByRole('heading', { name: '2 de 150 especies' }),
  ).toBeVisible();
  mock.set({ error: 'fallo temporal' }, 503);
  await page.getByRole('button', { name: 'Actualizar colección' }).click();
  await expect(
    page.getByRole('heading', { name: 'No pudimos cargar la colección' }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Tu colección' })).toHaveCount(0);
  mock.set(collection());
  await page.evaluate(() => {
    const c = new BroadcastChannel('pokeswap-session');
    c.postMessage('collection-changed');
    c.close();
  });
  await expect(
    page.getByRole('heading', { name: '1 de 150 especies' }),
  ).toBeVisible();
  const before = mock.calls();
  await page.goto('/pokedex');
  await page.goto('/coleccion');
  await expect.poll(mock.calls).toBeGreaterThan(before);
});

test('refreshes when a reservation expires and shows honest empty duplicate results', async ({
  page,
}) => {
  const mock = await setup(page);
  const pending = collection();
  pending.nextRefreshAt = Math.floor(Date.now() / 1000) + 3;
  mock.set(pending);
  await page.goto('/coleccion');
  await expect(
    page.getByRole('heading', { name: '1 de 150 especies' }),
  ).toBeVisible();
  mock.set({
    ...collection(),
    reserved: 0,
    available: 5,
    species: collection().species.map((s) => ({
      ...s,
      available: s.available + s.reserved,
      reserved: 0,
    })),
  });
  await expect(page.getByRole('definition')).toHaveText(['7', '2', '0', '5']);
  mock.set({
    ...collection(),
    total: 1,
    reserved: 0,
    available: 0,
    species: [
      { speciesId: 25, total: 1, protected: 1, reserved: 0, available: 0 },
    ],
  });
  await page.getByRole('button', { name: 'Actualizar colección' }).click();
  await page.getByRole('radio', { name: 'Repetidos' }).locator('..').click();
  await expect(
    page.getByRole('heading', { name: 'Aún no tienes repetidos' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Progreso de la Pokédex' }),
  ).toContainText('Mew adicional: pendiente');
});

test('rejects malformed data and never displays a different account collection', async ({
  page,
}) => {
  const mock = await setup(page);
  mock.set({ ...collection(), goal: 151 });
  await page.goto('/coleccion');
  await expect(
    page.getByRole('heading', { name: 'No pudimos cargar la colección' }),
  ).toBeVisible();
  mock.set({ ...collection(), userId: 'another-account' });
  await page.getByRole('button', { name: 'Actualizar colección' }).click();
  await expect(page).toHaveURL('/ingresar');
  await expect(page.getByRole('list', { name: 'Tu colección' })).toHaveCount(0);
});

test('discards a collection response arriving after logout', async ({
  page,
  isMobile,
}) => {
  const mock = await setup(page);
  await page.goto('/coleccion');
  await expect(
    page.getByRole('heading', { name: '1 de 150 especies' }),
  ).toBeVisible();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/api/me/collection', async (route) => {
    started = true;
    await waiting;
    await route.fulfill({ json: collection() }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Actualizar colección' }).click();
  await expect.poll(() => started).toBe(true);
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  mock.end();
  release();
  await expect(page).toHaveURL('/ingresar');
  await expect(page.getByRole('list', { name: 'Tu colección' })).toHaveCount(0);
});
