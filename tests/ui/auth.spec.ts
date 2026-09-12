import { expect, test, type Page } from '@playwright/test';
import type { AuthenticatedProfile } from '../../src/shared/contracts/auth';

function account(
  role: 'student' | 'teacher' = 'student',
  id = 'A',
): AuthenticatedProfile {
  return {
    user: {
      id,
      senatiId: `00${id}`,
      firstNames: `Persona ${id}`,
      lastNames: 'Prueba',
      birthDate: '2000-02-29',
      age: 26,
      trainerName: `Entrenador ${id}`,
      role,
      profileVersion: 1,
      avatarUrl: null,
    },
    initial:
      role === 'student'
        ? {
            instanceId: `initial-${id}`,
            speciesId: id === 'B' ? 7 : 25,
            probabilitiesVersion: 1,
          }
        : null,
    session: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
  };
}
async function mockSession(
  page: Page,
  initial: AuthenticatedProfile | null = null,
) {
  let current = initial;
  await page.route('**/api/me', (route) =>
    route.fulfill(
      current
        ? { json: current }
        : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  );
  await page.route('**/api/me/collection', (route) => {
    if (!current?.initial)
      return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
    return route.fulfill({
      json: {
        userId: current.user.id,
        goal: 150,
        obtained: current.initial.speciesId <= 150 ? 1 : 0,
        total: 1,
        reserved: 0,
        available: 0,
        nextRefreshAt: null,
        species: [
          {
            speciesId: current.initial.speciesId,
            total: 1,
            protected: 1,
            reserved: 0,
            available: 0,
          },
        ],
      },
    });
  });
  return {
    set: (value: AuthenticatedProfile | null) => {
      current = value;
    },
  };
}
async function fillLogin(page: Page, id = '00A') {
  await page.getByLabel('ID SENATI', { exact: true }).fill(id);
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('una frase de prueba larga');
}
async function fillRegistration(page: Page) {
  await fillLogin(page, ' 001-ab ');
  await page.getByLabel('Nombres', { exact: true }).fill(' Ana   María ');
  await page.getByLabel('Apellidos', { exact: true }).fill('Prueba Uno');
  await page
    .getByLabel('Fecha de nacimiento', { exact: true })
    .fill('2000-02-29');
}
async function logout(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
}

test('registration validates, sends normalized data once and recovers the persisted initial', async ({
  page,
  isMobile,
}) => {
  const session = await mockSession(page);
  let submissions = 0;
  const student = account();
  await page.route('**/api/auth/register', async (route) => {
    submissions++;
    const input = route.request().postDataJSON();
    expect(input.senatiId).toBe('001-AB');
    expect(input.firstNames).toBe('Ana María');
    expect(Object.keys(input).sort()).toEqual([
      'birthDate',
      'firstNames',
      'lastNames',
      'password',
      'senatiId',
    ]);
    session.set(student);
    await route.fulfill({ status: 201, json: student });
  });
  await page.route('**/api/auth/logout', async (route) => {
    session.set(null);
    await route.fulfill({ status: 204 });
  });
  await page.goto('/registro');
  await page
    .getByRole('button', { name: 'Crear mi cuenta', exact: true })
    .click();
  await expect(page.getByLabel('ID SENATI', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(submissions).toBe(0);
  await fillRegistration(page);
  await page
    .getByRole('button', { name: 'Crear mi cuenta', exact: true })
    .click();
  await expect(page).toHaveURL('/coleccion');
  await expect(
    page.getByRole('region', { name: 'Pokémon inicial confirmado' }),
  ).toContainText('Pikachu');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Tu primer compañero' }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  await page.goto('/perfil');
  await expect(page.getByRole('main')).toContainText('Persona A');
  await logout(page, isMobile);
  await expect(page).toHaveURL('/ingresar');
  await page.goBack();
  await expect(page.getByRole('main')).not.toContainText('Persona A');
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
});

test('wrong credentials, rate limit and unconfirmed cookie never show success', async ({
  page,
}) => {
  await mockSession(page);
  let mode = 'wrong';
  let calls = 0;
  await page.route('**/api/auth/login', (route) => {
    calls++;
    return route.fulfill(
      mode === 'wrong'
        ? { status: 401, json: { code: 'INVALID_CREDENTIALS' } }
        : mode === 'rate'
          ? {
              status: 429,
              headers: { 'Retry-After': '2' },
              json: { code: 'RATE_LIMITED' },
            }
          : { json: account() },
    );
  });
  await page.goto('/ingresar');
  await fillLogin(page);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'ID o contraseña incorrectos',
  );
  await expect(page.getByRole('alert')).toBeFocused();
  mode = 'rate';
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Espera 2 segundos');
  await expect(
    page.getByRole('button', { name: /Espera \d+ s/ }),
  ).toBeDisabled();
  mode = 'cookie';
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Permite las cookies');
  await expect(page).toHaveURL('/ingresar');
  expect(calls).toBe(3);
});

test('lost registration response offers authenticated recovery instead of retrying automatically', async ({
  page,
}) => {
  const session = await mockSession(page);
  let calls = 0;
  await page.route('**/api/auth/register', (route) => {
    calls++;
    return route.abort();
  });
  await page.route('**/api/auth/login', (route) => {
    session.set(account());
    return route.fulfill({ json: account() });
  });
  await page.goto('/registro');
  await fillRegistration(page);
  await page
    .getByRole('button', { name: 'Crear mi cuenta', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'La cuenta podría haberse creado',
  );
  expect(calls).toBe(1);
  await page
    .getByRole('alert')
    .getByRole('link', { name: 'Ir a iniciar sesión' })
    .click();
  await expect(page).toHaveURL('/ingresar');
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  await fillLogin(page);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL('/coleccion');
  await expect(
    page.getByRole('heading', { name: 'Pikachu', exact: true }),
  ).toBeVisible();
});

test('logout failure discards private UI and a later account cannot see the prior profile', async ({
  page,
  isMobile,
}) => {
  const session = await mockSession(page, account());
  let fail = true;
  await page.route('**/api/auth/logout', (route) => {
    if (fail) return route.abort();
    session.set(null);
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/auth/login', (route) => {
    session.set(account('student', 'B'));
    return route.fulfill({ json: account('student', 'B') });
  });
  await page.goto('/perfil');
  await expect(page.getByRole('main')).toContainText('Persona A');
  await logout(page, isMobile);
  await expect(
    page.getByRole('heading', { name: 'No pudimos confirmar el cierre' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Persona A');
  fail = false;
  await page
    .getByRole('button', { name: 'Reintentar cierre de sesión' })
    .click();
  await expect(page).toHaveURL('/ingresar');
  await fillLogin(page, '00B');
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Squirtle', exact: true }),
  ).toBeVisible();
  await page.goto('/perfil');
  await expect(page.getByRole('main')).toContainText('Persona B');
  await expect(page.getByRole('main')).not.toContainText('Persona A');
});

test('student cannot open teacher routes, teacher has no initial and session refresh can expire', async ({
  page,
}) => {
  const session = await mockSession(page, account());
  await page.goto('/docente/alumnos');
  await expect(
    page.getByRole('heading', {
      name: 'Esta sección no está disponible para tu cuenta',
    }),
  ).toBeVisible();
  session.set(account('teacher'));
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Alumnos', exact: true }),
  ).toBeVisible();
  await page.goto('/coleccion');
  await expect(
    page.getByRole('heading', {
      name: 'Esta sección no está disponible para tu cuenta',
    }),
  ).toBeVisible();
  session.set(null);
  await page.reload();
  await expect(page).toHaveURL('/ingresar');
});

test('loading, failed session checks, retry and malformed responses hide private data', async ({
  page,
}) => {
  let mode = 'pending';
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/me', async (route) => {
    if (mode === 'pending') await pending;
    await route.fulfill(
      mode === 'ok' ? { json: account() } : { json: { user: account().user } },
    );
  });
  await page.goto('/perfil');
  await expect(
    page.getByRole('heading', { name: 'Comprobando tu sesión' }),
  ).toBeVisible();
  mode = 'bad';
  release?.();
  await expect(
    page.getByRole('heading', { name: 'No pudimos verificar tu sesión' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Persona A');
  mode = 'ok';
  await page.getByRole('button', { name: 'Volver a comprobar' }).click();
  await expect(page.getByRole('main')).toContainText('Persona A');
});

test('forms fit mobile and desktop and show a labelled password toggle', async ({
  page,
}, testInfo) => {
  await mockSession(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/registro');
    await expect(
      page.getByRole('form', { name: 'Crear cuenta de alumno' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const password = page.getByLabel('Contraseña', { exact: true });
  await password.fill('una contraseña de prueba');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await password.clear();
  await page.screenshot({
    path: testInfo.outputPath('register-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ingresar');
  await expect(
    page.getByRole('form', { name: 'Iniciar sesión' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('login-mobile.png'),
    fullPage: true,
  });
});

test('a pending submission is not duplicated and session expiry hides the profile', async ({
  page,
}) => {
  const session = await mockSession(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route('**/api/auth/login', async (route) => {
    calls++;
    await pending;
    const value = account();
    value.session.expiresAt = Math.floor(Date.now() / 1000) + 2;
    session.set(value);
    await route.fulfill({ json: value });
  });
  await page.goto('/ingresar');
  await fillLogin(page);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Confirmando…' }),
  ).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(calls).toBe(1);
  release?.();
  await expect(page).toHaveURL('/coleccion');
  session.set(null);
  await expect(page).toHaveURL('/ingresar', { timeout: 5000 });
  await expect(page.getByRole('main')).not.toContainText('Entrenador A');
});

test('logout cancels an old profile request and its late response cannot restore private data', async ({
  page,
  isMobile,
}) => {
  let delay = false;
  let loggedOut = false;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/me', async (route) => {
    if (delay) {
      await pending;
      await route.fulfill({ json: account() }).catch(() => {});
    } else
      await route.fulfill(
        loggedOut
          ? { status: 401, json: { code: 'UNAUTHENTICATED' } }
          : { json: account() },
      );
  });
  await page.route('**/api/auth/logout', (route) => {
    loggedOut = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/perfil');
  await expect(page.getByRole('main')).toContainText('Persona A');
  delay = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(
    page.getByRole('heading', { name: 'Comprobando tu sesión' }),
  ).toBeVisible();
  await logout(page, isMobile);
  delay = false;
  release?.();
  await expect(page).toHaveURL('/ingresar');
  await expect(page.getByRole('main')).not.toContainText('Persona A');
  await page.goto('/perfil');
  await expect(page).toHaveURL('/ingresar');
});

test('confirmed logout invalidates another open tab without broadcasting personal data', async ({
  context,
  page,
  isMobile,
}) => {
  let current: AuthenticatedProfile | null = account();
  await context.route('**/api/me', (route) =>
    route.fulfill(
      current
        ? { json: current }
        : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  );
  await context.route('**/api/auth/logout', (route) => {
    current = null;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/perfil');
  const second = await context.newPage();
  await second.goto('/perfil');
  await expect(second.getByRole('main')).toContainText('Persona A');
  await logout(page, isMobile);
  await expect(page).toHaveURL('/ingresar');
  await expect(second).toHaveURL('/ingresar');
  await expect(second.getByRole('main')).not.toContainText('Persona A');
  await second.close();
});
