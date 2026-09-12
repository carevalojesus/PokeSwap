import { expect, test, type Page } from '@playwright/test';
import type { AuthenticatedProfile } from '../../src/shared/contracts/auth';
import fixtures from '../../src/server/media/fixtures.json' with { type: 'json' };
const photo = Buffer.from(fixtures[0], 'base64');
function profile(): AuthenticatedProfile {
  return {
    user: {
      id: 'avatar-A',
      senatiId: '001-FOTO',
      firstNames: 'Ana',
      lastNames: 'Prueba',
      birthDate: '2000-01-01',
      age: 26,
      trainerName: 'Entrenadora Foto',
      role: 'teacher',
      profileVersion: 0,
      avatarUrl: null,
    },
    initial: null,
    session: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
  };
}
async function setup(page: Page) {
  let current: AuthenticatedProfile | null = profile();
  let saved = photo;
  await page.route('**/api/me', (route) =>
    route.fulfill(
      current
        ? { json: current }
        : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  );
  await page.route('**/api/users/*/avatar*', (route) =>
    route.fulfill({ contentType: 'image/webp', body: saved }),
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
    save: (value: Buffer) => {
      saved = value;
    },
  };
}
async function select(page: Page) {
  await page.getByLabel('Seleccionar foto').setInputFiles({
    name: 'prueba.webp',
    mimeType: 'image/webp',
    buffer: photo,
  });
  await expect(
    page.getByRole('button', { name: 'Guardar foto', exact: true }),
  ).toBeEnabled();
}
test('crop exports real 512px WebP, confirms upload, survives reload and deletes with confirmation', async ({
  page,
}, info) => {
  const session = await setup(page);
  let writes = 0;
  await page.route('**/api/me/avatar', async (route) => {
    writes++;
    const request = route.request();
    expect(request.headers()['x-profile-version']).toBe(
      String(session.get().user.profileVersion),
    );
    if (request.method() === 'PUT') {
      const body = request.postDataBuffer()!;
      expect(body.subarray(0, 4).toString()).toBe('RIFF');
      expect(body.length).toBeLessThanOrEqual(1048576);
      expect(request.headers()['content-type']).toBe('image/webp');
      expect(request.headers()['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
      session.save(body);
      session.set({
        ...session.get(),
        user: {
          ...session.get().user,
          avatarUrl: '/api/users/avatar-A/avatar',
          profileVersion: session.get().user.profileVersion + 1,
        },
      });
    } else {
      expect(request.method()).toBe('DELETE');
      session.set({
        ...session.get(),
        user: {
          ...session.get().user,
          avatarUrl: null,
          profileVersion: session.get().user.profileVersion + 1,
        },
      });
    }
    await route.fulfill({ json: session.get() });
  });
  await page.goto('/perfil');
  await select(page);
  await page.getByLabel('Acercamiento').focus();
  await page.getByLabel('Acercamiento').press('ArrowRight');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({
    width: info.project.name.startsWith('mobile') ? 390 : 1440,
    height: 950,
  });
  await page.screenshot({
    path: info.outputPath('avatar-crop.png'),
    fullPage: true,
  });
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Guardar foto', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Solicitud confirmada');
  const image = page.getByRole('img', { name: 'Foto de perfil guardada' });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(512);
  await page.reload();
  await expect(
    page.getByRole('img', { name: 'Foto de perfil guardada' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Eliminar foto', exact: true })
    .click();
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Conservar foto' }).click();
  expect(writes).toBe(1);
  await page
    .getByRole('button', { name: 'Eliminar foto', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Eliminación confirmada',
  );
  await expect(
    page.getByRole('img', { name: 'Foto de perfil guardada' }),
  ).toHaveCount(0);
  expect(writes).toBe(2);
});
test('invalid and oversized files never upload; cancel discards preview', async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route('**/api/me/avatar', (route) => {
    writes++;
    return route.fulfill({ status: 500 });
  });
  await page.goto('/perfil');
  await page.getByLabel('Seleccionar foto').setInputFiles({
    name: 'x.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(page.getByRole('alert')).toContainText('Selecciona JPEG');
  await page.getByLabel('Seleccionar foto').setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('hasta 5 MiB');
  await page.getByLabel('Seleccionar foto').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not image'),
  });
  await expect(page.getByRole('alert')).toContainText('No pudimos abrir');
  await select(page);
  await page.getByRole('button', { name: 'Cancelar recorte' }).click();
  await expect(page.getByText('Vista previa · aún no guardada')).toHaveCount(0);
  expect(writes).toBe(0);
});
test('lost upload response retries identical bytes and key, while conflicts recover the current profile', async ({
  page,
}) => {
  const session = await setup(page);
  let previous: Buffer;
  let key = '';
  let count = 0;
  await page.route('**/api/me/avatar', async (route) => {
    count++;
    if (count === 1) {
      previous = route.request().postDataBuffer()!;
      key = route.request().headers()['idempotency-key'];
      await route.abort('failed');
    } else if (count === 2) {
      expect(route.request().postDataBuffer()).toEqual(previous);
      expect(route.request().headers()['idempotency-key']).toBe(key);
      session.set({
        ...session.get(),
        user: {
          ...session.get().user,
          avatarUrl: '/api/users/avatar-A/avatar',
          profileVersion: 1,
        },
      });
      await route.fulfill({ json: session.get() });
    } else {
      await route.fulfill({ status: 409, json: { code: 'PROFILE_CONFLICT' } });
    }
  });
  await page.goto('/perfil');
  await select(page);
  await page.getByRole('button', { name: 'Guardar foto', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
  await expect(page.getByRole('status')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Reintentar misma operación' })
    .click();
  await expect(page.getByRole('status')).toContainText('Solicitud confirmada');
  expect(count).toBe(2);
  await select(page);
  await page.getByRole('button', { name: 'Guardar foto', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El perfil cambió');
  await page
    .getByRole('button', { name: 'Consultar perfil y descartar intento' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Perfil actual recuperado',
  );
  await expect(
    page.getByRole('img', { name: 'Foto de perfil guardada' }),
  ).toBeVisible();
});
test('logout during upload hides the preview and a late result cannot restore the account', async ({
  page,
  isMobile,
}) => {
  const session = await setup(page);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const value = session.get();
  let writes = 0;
  await page.route('**/api/me/avatar', async (route) => {
    writes++;
    await pending;
    await route
      .fulfill({
        json: {
          ...value,
          user: {
            ...value.user,
            profileVersion: 1,
            avatarUrl: '/api/users/avatar-A/avatar',
          },
        },
      })
      .catch(() => {});
  });
  await page.goto('/perfil');
  await select(page);
  await page.getByRole('button', { name: 'Guardar foto', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Guardando foto…' }),
  ).toBeDisabled();
  await expect.poll(() => writes).toBe(1);
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL('/ingresar');
  release();
  await page.goto('/perfil');
  await expect(page).toHaveURL('/ingresar');
  await expect(page.getByText('Vista previa · aún no guardada')).toHaveCount(0);
});
