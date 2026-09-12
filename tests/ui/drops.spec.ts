import { test, expect, type Page } from '@playwright/test';
import type { AuthenticatedProfile } from '../../src/shared/contracts/auth';
import type { Drop, DropReward } from '../../src/shared/schemas/drops';

const code = 'ab'.repeat(32),
  userId = 'drops-person';
const id = '751edb08-0b9f-4b0b-9e83-14dd1b1ad203';
function drop(): Drop {
  return {
    id,
    createdAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 1800,
    cancelledAt: null,
    state: 'active',
    redemptions: 0,
  };
}
function previewDrop() {
  const d = drop();
  return {
    id: d.id,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    cancelledAt: d.cancelledAt,
    state: d.state,
  };
}
function reward(): DropReward {
  return {
    id: 'e26dacdf-6e70-482b-a359-7c0c6286d68f',
    dropId: id,
    userId,
    createdAt: Math.floor(Date.now() / 1000),
    probabilitiesVersion: 1,
    instances: [25, 151, 25].map((speciesId, slot) => ({
      instanceId: `aa18ee8d-91a7-4d1f-9c3f-7895f43615a${slot}`,
      speciesId,
      slot,
    })),
  };
}
async function session(page: Page, role: 'student' | 'teacher') {
  let current: AuthenticatedProfile | null = {
    user: {
      id: userId,
      senatiId: '00DROP',
      firstNames: 'Ana',
      lastNames: 'Prueba',
      birthDate: '2000-01-01',
      age: 26,
      trainerName: 'Entrenadora de prueba',
      role,
      profileVersion: 0,
      avatarUrl: null,
    },
    initial:
      role === 'student'
        ? { instanceId: 'initial', speciesId: 25, probabilitiesVersion: 1 }
        : null,
    session: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
  };
  await page.route('**/api/me', (route) =>
    route.fulfill(
      current
        ? { json: current }
        : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  );
  await page.route('**/api/auth/logout', (route) => {
    current = null;
    return route.fulfill({ status: 204 });
  });
}
test('teacher validates duration, retries one creation, recovers sharing code after reload and cancels', async ({
  page,
}, info) => {
  await session(page, 'teacher');
  let saved: Drop | null = null;
  let first = true;
  let creationId = '';
  let writes = 0;
  await page.route('**/api/admin/drops', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { userId, drops: saved ? [saved] : [] } });
    writes++;
    const input = route.request().postDataJSON();
    if (creationId) expect(input.id).toBe(creationId);
    creationId = input.id;
    expect(input.minutes).toBe(30);
    saved = { ...drop(), id: input.id };
    if (first) {
      first = false;
      return route.abort();
    }
    return route.fulfill({ json: { userId, drop: saved, code } });
  });
  await page.route('**/api/admin/drops/*', (route) =>
    route.fulfill({ json: { userId, drop: saved, code } }),
  );
  await page.route('**/api/admin/drops/*/cancel', (route) => {
    saved = {
      ...saved!,
      state: 'cancelled',
      cancelledAt: Math.floor(Date.now() / 1000),
    };
    return route.fulfill({ json: { userId, drop: saved } });
  });
  await page.goto('/docente/pokedrops');
  await page.getByLabel('Vigencia en minutos').fill('0');
  await page
    .getByRole('button', { name: 'Crear PokéDrop', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('entre 1 y 1440');
  expect(writes).toBe(0);
  await page.getByLabel('Vigencia en minutos').fill('30');
  await page
    .getByRole('button', { name: 'Crear PokéDrop', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
  await page.getByRole('button', { name: 'Reintentar creación' }).click();
  await expect(
    page.getByLabel('Código para compartir con tu clase'),
  ).toHaveValue(code);
  expect(writes).toBe(2);
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
    path: info.outputPath('teacher-drops.png'),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Ver entrega' }).click();
  await expect(
    page.getByLabel('Código para compartir con tu clase'),
  ).toHaveValue(code);
  await page
    .getByRole('button', { name: 'Cancelar PokéDrop', exact: true })
    .click();
  await expect(
    page.getByText(
      'Cancelar impedirá nuevos canjes. Los premios ya entregados se conservan.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(
    page.getByRole('region', { name: 'PokéDrop seleccionado' }),
  ).toContainText('Cancelado');
  await expect(
    page.getByLabel('Código para compartir con tu clase'),
  ).toHaveCount(0);
});

test('student consults without awarding, recovers lost redemption and sees four instances in collection', async ({
  page,
}, info) => {
  await session(page, 'student');
  let saved: DropReward | null = null;
  let writes = 0;
  await page.route('**/api/drops/preview', (route) =>
    route.fulfill({ json: { userId, drop: previewDrop(), reward: saved } }),
  );
  await page.route('**/api/drops/redeem', (route) => {
    writes++;
    saved = reward();
    return route.abort();
  });
  await page.route('**/api/me/collection', (route) =>
    route.fulfill({
      json: {
        userId,
        goal: 150,
        obtained: 1,
        total: 4,
        reserved: 0,
        available: 2,
        nextRefreshAt: null,
        species: [
          { speciesId: 25, total: 3, protected: 1, reserved: 0, available: 2 },
          { speciesId: 151, total: 1, protected: 1, reserved: 0, available: 0 },
        ],
      },
    }),
  );
  await page.goto('/pokedrops');
  await page.getByLabel('Código del PokéDrop').fill('bad');
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('64 caracteres');
  await page.getByLabel('Código del PokéDrop').fill(code);
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tres nuevos ejemplares te esperan' }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page
    .getByRole('button', { name: 'Confirmar canje de 3 Pokémon' })
    .click();
  await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Premios confirmados' })
      .getByRole('listitem'),
  ).toHaveCount(3);
  expect(writes).toBe(1);
  await page.screenshot({
    path: info.outputPath('student-drops.png'),
    fullPage: true,
  });
  await page.reload();
  await page.getByLabel('Código del PokéDrop').fill(code);
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tus tres Pokémon están guardados' }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page
    .getByRole('link', { name: 'Ver mi colección', exact: true })
    .click();
  await expect(page.getByRole('definition')).toHaveText(['4', '2', '0', '2']);
});

test('expired and cancelled drops never offer a new redemption; bad contracts show errors', async ({
  page,
}) => {
  await session(page, 'student');
  let response: unknown = {
    userId,
    drop: {
      id,
      createdAt: 0,
      expiresAt: 1,
      cancelledAt: null,
      state: 'expired',
    },
    reward: null,
  };
  await page.route('**/api/drops/preview', (route) =>
    route.fulfill({ json: response }),
  );
  await page.goto('/pokedrops');
  await page.getByLabel('Código del PokéDrop').fill(code);
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'PokéDrop vencido' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirmar canje de 3 Pokémon' }),
  ).toHaveCount(0);
  response = {
    userId,
    drop: {
      id,
      createdAt: 0,
      expiresAt: 1,
      cancelledAt: 1,
      state: 'cancelled',
    },
    reward: null,
  };
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'PokéDrop cancelado' }),
  ).toBeVisible();
  response = { unexpected: true };
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
});

test('pending redemption is not duplicated and cannot restore rewards after logout', async ({
  page,
  isMobile,
}) => {
  await session(page, 'student');
  let writes = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/drops/preview', (route) =>
    route.fulfill({ json: { userId, drop: previewDrop(), reward: null } }),
  );
  await page.route('**/api/drops/redeem', async (route) => {
    writes++;
    await pending;
    await route.fulfill({ json: { reward: reward() } }).catch(() => {});
  });
  await page.goto('/pokedrops');
  await page.getByLabel('Código del PokéDrop').fill(code);
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirmar canje de 3 Pokémon' })
    .click();
  await expect.poll(() => writes).toBe(1);
  await expect(
    page.getByRole('button', { name: 'Confirmar canje de 3 Pokémon' }),
  ).toBeDisabled();
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  release();
  await expect(page).toHaveURL('/ingresar');
  await expect(
    page.getByRole('region', { name: 'Premios confirmados' }),
  ).toHaveCount(0);
});

test('a rejected teacher session hides an already displayed sharing code', async ({
  page,
}) => {
  await session(page, 'teacher');
  let expired = false;
  await page.route('**/api/admin/drops', (route) =>
    route.fulfill(
      expired
        ? { status: 401, json: { code: 'UNAUTHENTICATED' } }
        : { json: { userId, drops: [drop()] } },
    ),
  );
  await page.route('**/api/admin/drops/*', (route) =>
    route.fulfill({ json: { userId, drop: drop(), code } }),
  );
  await page.goto('/docente/pokedrops');
  await page.getByRole('button', { name: 'Ver entrega' }).click();
  await expect(
    page.getByLabel('Código para compartir con tu clase'),
  ).toHaveValue(code);
  expired = true;
  await page.getByRole('button', { name: 'Actualizar entregas' }).click();
  await expect(page).toHaveURL('/ingresar');
  await expect(
    page.getByLabel('Código para compartir con tu clase'),
  ).toHaveCount(0);
});
