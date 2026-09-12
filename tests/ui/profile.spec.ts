import { expect, test, type Page } from '@playwright/test';
import type { AuthenticatedProfile } from '../../src/shared/contracts/auth';

function account(): AuthenticatedProfile {
  return {
    user: {
      id: 'profile-A',
      senatiId: '001-PERFIL',
      firstNames: 'Ana',
      lastNames: 'Prueba',
      birthDate: '2000-02-29',
      age: 26,
      trainerName: 'Entrenadora de prueba',
      role: 'student',
      profileVersion: 0,
      avatarUrl: null,
    },
    initial: {
      instanceId: 'initial-A',
      speciesId: 25,
      probabilitiesVersion: 1,
    },
    session: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
  };
}
async function setup(page: Page) {
  let current: AuthenticatedProfile | null = account();
  let failRead = false;
  await page.route('**/api/me', (route) =>
    route.fulfill(
      failRead
        ? { status: 503, json: { code: 'INTERNAL_ERROR' } }
        : current
          ? { json: current }
          : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  );
  await page.route('**/api/auth/logout', (route) => {
    current = null;
    return route.fulfill({ status: 204 });
  });
  return {
    get: () => current!,
    set: (value: AuthenticatedProfile) => {
      current = value;
    },
    fail: (value: boolean) => {
      failRead = value;
    },
  };
}
async function edit(page: Page) {
  await page.goto('/perfil');
  await page
    .getByRole('button', { name: 'Editar perfil', exact: true })
    .click();
}

test('profile validates, normalizes and persists a confirmed edit without editable identity', async ({
  page,
}, testInfo) => {
  const session = await setup(page);
  let writes = 0;
  await page.route('**/api/me/profile', async (route) => {
    writes++;
    const data = route.request().postDataJSON();
    expect(route.request().method()).toBe('PATCH');
    expect(data).toEqual({
      firstNames: 'María José',
      lastNames: 'Prueba',
      birthDate: '2000-02-29',
      profileVersion: 0,
    });
    session.set({
      ...session.get(),
      user: { ...session.get().user, ...data, profileVersion: 1 },
    });
    await route.fulfill({ json: session.get() });
  });
  await edit(page);
  await expect(page.getByLabel('ID SENATI', { exact: true })).toHaveCount(0);
  await page.getByLabel('Nombres', { exact: true }).fill('');
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await expect(page.getByLabel('Nombres', { exact: true })).toBeFocused();
  expect(writes).toBe(0);
  await page.getByLabel('Nombres', { exact: true }).fill(' María   José ');
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  await expect(page.getByRole('status')).toBeFocused();
  expect(writes).toBe(1);
  await page.reload();
  await expect(page.getByRole('main')).toContainText('María José');
  await page
    .getByRole('button', { name: 'Editar perfil', exact: true })
    .click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({
    width: testInfo.project.name.startsWith('mobile') ? 390 : 1440,
    height: 900,
  });
  await page.screenshot({
    path: testInfo.outputPath('perfil-editor.png'),
    fullPage: true,
  });
});
test('conflict retains the draft and requires explicitly loading the current version', async ({
  page,
}) => {
  const session = await setup(page);
  let writes = 0;
  await page.route('**/api/me/profile', async (route) => {
    writes++;
    const data = route.request().postDataJSON();
    if (data.profileVersion !== session.get().user.profileVersion)
      return route.fulfill({ status: 409, json: { code: 'PROFILE_CONFLICT' } });
    session.set({
      ...session.get(),
      user: {
        ...session.get().user,
        ...data,
        profileVersion: data.profileVersion + 1,
      },
    });
    return route.fulfill({ json: session.get() });
  });
  await edit(page);
  await page.getByLabel('Nombres', { exact: true }).fill('Mi borrador');
  session.set({
    ...session.get(),
    user: {
      ...session.get().user,
      firstNames: 'Cambio remoto',
      profileVersion: 1,
    },
  });
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Otro dispositivo');
  await expect(page.getByLabel('Nombres', { exact: true })).toHaveValue(
    'Mi borrador',
  );
  await expect(
    page.getByRole('button', { name: 'Guardar cambios', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Cargar datos actuales' }).click();
  await expect(page.getByLabel('Nombres', { exact: true })).toHaveValue(
    'Cambio remoto',
  );
  await page.getByLabel('Nombres', { exact: true }).fill('Cambio revisado');
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  expect(writes).toBe(2);
});
test('a lost response recovers persisted data without retrying the write', async ({
  page,
}) => {
  const session = await setup(page);
  let writes = 0;
  await page.route('**/api/me/profile', async (route) => {
    writes++;
    session.set({
      ...session.get(),
      user: {
        ...session.get().user,
        ...route.request().postDataJSON(),
        profileVersion: 1,
      },
    });
    await route.abort('failed');
  });
  await edit(page);
  await page.getByLabel('Nombres', { exact: true }).fill('Persistido');
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'podrían haberse guardado',
  );
  await expect(page.getByRole('status')).toHaveCount(0);
  session.fail(true);
  await page.getByRole('button', { name: 'Cargar datos actuales' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Conservamos tu borrador',
  );
  session.fail(false);
  await page.getByRole('button', { name: 'Cargar datos actuales' }).click();
  await expect(page.getByLabel('Nombres', { exact: true })).toHaveValue(
    'Persistido',
  );
  expect(writes).toBe(1);
});
test('background session refresh hides private fields but preserves the unsaved form and its version', async ({
  page,
}) => {
  const session = await setup(page);
  await edit(page);
  await page.getByLabel('Nombres', { exact: true }).fill('Borrador local');
  session.fail(true);
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(
    page.getByRole('heading', { name: 'No pudimos verificar tu sesión' }),
  ).toBeVisible();
  await expect(page.getByLabel('Nombres', { exact: true })).not.toBeVisible();
  session.fail(false);
  session.set({
    ...session.get(),
    user: { ...session.get().user, firstNames: 'Remoto', profileVersion: 1 },
  });
  await page.getByRole('button', { name: 'Volver a comprobar' }).click();
  await expect(page.getByLabel('Nombres', { exact: true })).toHaveValue(
    'Borrador local',
  );
  await page.route('**/api/me/profile', (route) => {
    expect(route.request().postDataJSON().profileVersion).toBe(0);
    return route.fulfill({ status: 409, json: { code: 'PROFILE_CONFLICT' } });
  });
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Otro dispositivo');
});
test('pending profile writes cannot duplicate or restore data after logout', async ({
  page,
  isMobile,
}) => {
  const session = await setup(page);
  let writes = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const response = session.get();
  await page.route('**/api/me/profile', async (route) => {
    writes++;
    await pending;
    await route
      .fulfill({
        json: {
          ...response,
          user: { ...response.user, firstNames: 'Tardío', profileVersion: 1 },
        },
      })
      .catch(() => {});
  });
  await edit(page);
  await page.getByLabel('Nombres', { exact: true }).fill('Tardío');
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(writes).toBe(1);
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL('/ingresar');
  release();
  await page.goto('/perfil');
  await expect(page).toHaveURL('/ingresar');
  await expect(page.getByText('Tardío', { exact: true })).toHaveCount(0);
});

test('refreshes at successive Lima midnights even when the first response is unchanged', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2025-02-28T04:59:50Z') });
  const current = account();
  current.user.age = 24;
  let reads = 0;
  await page.route('**/api/me', (route) => {
    reads++;
    return route.fulfill({ json: current });
  });
  await page.goto('/perfil');
  await expect(page.getByRole('main')).toContainText('24 años');
  await page.clock.pauseAt(new Date('2025-02-28T04:59:59Z'));
  const first = reads;
  await page.clock.runFor(1100);
  await expect.poll(() => reads).toBeGreaterThan(first);
  await page.clock.resume();
  await expect(
    page.getByRole('heading', { name: 'Mi perfil', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toContainText('24 años');
  const second = reads;
  current.user.age = 25;
  await page.clock.fastForward(86_400_000);

  await expect.poll(() => reads).toBeGreaterThan(second);
  await expect(page.getByRole('main')).toContainText('25 años');
});
