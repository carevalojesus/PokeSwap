import { test, expect, type Page } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import type { AuthenticatedProfile } from '../../src/shared/contracts/auth';
import {
  parseDropInput,
  dropLink,
} from '../../src/client/features/drops/drop-link';

const code = 'cd'.repeat(32);
const userId = 'qr-student';
const drop = {
  id: '751edb08-0b9f-4b0b-9e83-14dd1b1ad203',
  createdAt: 1,
  expiresAt: Math.floor(Date.now() / 1000) + 1800,
  cancelledAt: null,
  state: 'active',
};
function profile(
  role: 'student' | 'teacher' = 'student',
): AuthenticatedProfile {
  return {
    user: {
      id: userId,
      senatiId: '00QR',
      firstNames: 'Ana',
      lastNames: 'Prueba',
      birthDate: '2000-01-01',
      age: 26,
      trainerName: 'Prueba QR',
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
}
async function setup(
  page: Page,
  initial: AuthenticatedProfile | null = profile(),
) {
  let current = initial;
  let previews = 0,
    redemptions = 0;
  await page.route('**/api/me', (route) =>
    route.fulfill(
      current
        ? { json: current }
        : { status: 401, json: { code: 'UNAUTHENTICATED' } },
    ),
  );
  await page.route('**/api/auth/login', (route) => {
    current = profile();
    return route.fulfill({ json: current });
  });
  await page.route('**/api/auth/register', (route) => {
    current = profile();
    return route.fulfill({ status: 201, json: current });
  });
  await page.route('**/api/auth/logout', (route) => {
    current = null;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/drops/preview', (route) => {
    previews++;
    expect(route.request().postDataJSON()).toEqual({ code });
    return route.fulfill({ json: { userId, drop, reward: null } });
  });
  await page.route('**/api/drops/redeem', (route) => {
    redemptions++;
    return route.fulfill({ status: 503, json: { code: 'DROP_UNCONFIRMED' } });
  });
  return { previews: () => previews, redemptions: () => redemptions };
}

test('sharing parser rejects foreign and executable links, extra URL fields and malformed codes', () => {
  const origin = 'https://classroom.example';
  expect(parseDropInput(dropLink(code, origin), origin)).toBe(code);
  expect(parseDropInput(` ${code.toUpperCase()} `, origin)).toBe(code);
  for (const input of [
    `https://evil.example/pokedrop#${code}`,
    `javascript:alert(1)`,
    `${origin}/pokedrop?code=${code}`,
    `${origin}/intercambios#${code}`,
    `${origin}/pokedrop#${code}extra`,
    `https://user:pass@classroom.example/pokedrop#${code}`,
    `${origin}/pokedrop?next=https://evil.example#${code}`,
  ])
    expect(parseDropInput(input, origin)).toBeNull();
});
for (const register of [false, true])
  test(`link survives ${register ? 'registration' : 'login'} in memory; opening and scanning never redeem`, async ({
    page,
  }) => {
    const requests = await setup(page, null);
    const exposed: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(code)) exposed.push(request.url());
    });
    await page.goto(`/pokedrop#${code}`);
    await expect(page).toHaveURL('/pokedrop');
    if (register) {
      await page
        .getByRole('link', { name: 'Crea tu cuenta de alumno' })
        .click();
      await page.getByLabel('Nombres', { exact: true }).fill('Ana');
      await page.getByLabel('Apellidos', { exact: true }).fill('Prueba');
      await page
        .getByLabel('Fecha de nacimiento', { exact: true })
        .fill('2000-01-01');
    }
    await page.getByLabel('ID SENATI', { exact: true }).fill('00QR');
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('una clave ficticia larga');
    await page
      .getByRole('button', {
        name: register ? 'Crear mi cuenta' : 'Iniciar sesión',
        exact: true,
      })
      .click();
    await expect(page.getByLabel('Código del PokéDrop')).toHaveValue(code);
    await expect(page).toHaveURL('/pokedrop');
    expect(requests.previews()).toBe(0);
    expect(requests.redemptions()).toBe(0);
    expect(exposed).toEqual([]);
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain(code);
    await page
      .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Confirmar canje de 3 Pokémon' }),
    ).toBeVisible();
    expect(requests.previews()).toBe(1);
    expect(requests.redemptions()).toBe(0);
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Vuelve a abrir el enlace del PokéDrop',
      }),
    ).toBeVisible();
  });

test('denied camera permission leaves the equivalent link/code consultation usable', async ({
  page,
}, info) => {
  const requests = await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    });
  });
  await page.goto('/pokedrops');
  await expect(page.getByLabel('Vista de la cámara')).toHaveCount(0);
  await page.getByRole('button', { name: 'Escanear QR' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'No pudimos abrir la cámara',
  );
  await page.screenshot({
    path: info.outputPath('camera-denied.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cerrar cámara' }).click();
  await page
    .getByLabel('Código del PokéDrop')
    .fill(new URL(`/pokedrop#${code}`, page.url()).href);
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Confirmar canje de 3 Pokémon' }),
  ).toBeVisible();
  expect(requests.previews()).toBe(1);
  expect(requests.redemptions()).toBe(0);
});

test('teacher QR decodes with the shipped scanner to the exact share link', async ({
  page,
}, info) => {
  await setup(page, profile('teacher'));
  await page.route('**/api/admin/drops', (route) =>
    route.fulfill({ json: { userId, drops: [{ ...drop, redemptions: 0 }] } }),
  );
  await page.route('**/api/admin/drops/*', (route) =>
    route.fulfill({
      json: { userId, drop: { ...drop, redemptions: 0 }, code },
    }),
  );
  await page.goto('/docente/pokedrops');
  await page.getByRole('button', { name: 'Ver entrega' }).click();
  const svg = page.getByRole('img', { name: 'QR del PokéDrop' });
  await expect(svg).toBeVisible();
  const module = (await readdir('dist/client/assets')).find((name) =>
    /^qr-scanner.min-.*\.js$/.test(name),
  );
  expect(module).toBeTruthy();
  const png = (await svg.screenshot()).toString('base64');
  const decoded = await page.evaluate(
    async ({ moduleName, png }) => {
      const exports = await import(`/assets/${moduleName}`);
      const Scanner = Object.values(exports).find(
        (value) => typeof value === 'function' && 'scanImage' in value,
      ) as {
        scanImage: (
          source: string,
          options: object,
        ) => Promise<{ data: string }>;
      };
      return (
        await Scanner.scanImage(`data:image/png;base64,${png}`, {
          returnDetailedScanResult: true,
        })
      ).data;
    },
    { moduleName: module!, png },
  );
  expect(decoded).toBe(
    await page.getByLabel('Enlace del PokéDrop').inputValue(),
  );
  expect(decoded).toBe(new URL(`/pokedrop#${code}`, page.url()).href);
  await page.screenshot({
    path: info.outputPath('teacher-qr.png'),
    fullPage: true,
  });
});

// Canvas video streams exercise actual track lifetimes without a physical webcam.
for (const exit of [
  'close',
  'navigate',
  'hidden',
  'session',
  'late permission',
])
  test(`camera tracks end on ${exit} and never reopen automatically`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Canvas captureStream fixture runs in Chromium; WebKit covers denial and QR decoding.',
    );
    await setup(page);
    await page.addInitScript(
      ({ late }) => {
        const fixture = {
          calls: 0,
          tracks: [] as MediaStreamTrack[],
          release: () => {},
        };
        Object.assign(window, { cameraFixture: fixture });
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          value: async () => {
            fixture.calls++;
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 800;
            canvas.getContext('2d')!.fillRect(0, 0, 800, 800);
            const stream = canvas.captureStream(10);
            fixture.tracks.push(...stream.getTracks());
            if (late)
              await new Promise<void>((resolve) => {
                fixture.release = resolve;
              });
            return stream;
          },
        });
      },
      { late: exit === 'late permission' },
    );
    await page.goto('/pokedrops');
    const calls = () =>
      page.evaluate(
        () =>
          (window as unknown as { cameraFixture: { calls: number } })
            .cameraFixture.calls,
      );
    expect(await calls()).toBe(0);
    await page.getByRole('button', { name: 'Escanear QR' }).click();
    await expect.poll(calls).toBe(1);
    if (exit === 'navigate')
      await page
        .getByRole('link', { name: 'Pokédex', exact: true })
        .first()
        .click();
    else if (exit === 'hidden')
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    else if (exit === 'session')
      await page.evaluate(() => {
        const channel = new BroadcastChannel('pokeswap-session');
        channel.postMessage('profile-changed');
        channel.close();
      });
    else await page.getByRole('button', { name: 'Cerrar cámara' }).click();
    if (exit === 'late permission')
      await page.evaluate(() =>
        (
          window as unknown as { cameraFixture: { release: () => void } }
        ).cameraFixture.release(),
      );
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              cameraFixture: { tracks: MediaStreamTrack[] };
            }
          ).cameraFixture.tracks.every((track) => track.readyState === 'ended'),
        ),
      )
      .toBe(true);
    await expect(page.getByLabel('Vista de la cámara')).toHaveCount(0);
    if (exit === 'hidden')
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    expect(await calls()).toBe(1);
  });

test('a camera decodes the generated QR, stops its tracks and only fills the consultation form', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Canvas captureStream fixture requires Chromium.',
  );
  await setup(page, profile('teacher'));
  await page.route('**/api/admin/drops', (route) =>
    route.fulfill({ json: { userId, drops: [{ ...drop, redemptions: 0 }] } }),
  );
  await page.route('**/api/admin/drops/*', (route) =>
    route.fulfill({
      json: { userId, drop: { ...drop, redemptions: 0 }, code },
    }),
  );
  await page.goto('/docente/pokedrops');
  await page.getByRole('button', { name: 'Ver entrega' }).click();
  const png = (
    await page.getByRole('img', { name: 'QR del PokéDrop' }).screenshot()
  ).toString('base64');
  const requests = await setup(page);
  await page.addInitScript(
    ({ png }) => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 800;
          canvas.height = 800;
          const context = canvas.getContext('2d')!;
          const image = new Image();
          image.src = `data:image/png;base64,${png}`;
          await image.decode();
          const paint = () => {
            context.fillStyle = 'white';
            context.fillRect(0, 0, 800, 800);
            context.drawImage(image, 200, 200, 400, 400);
          };
          paint();
          const stream = canvas.captureStream(10);
          Object.assign(window, { scannedTracks: stream.getTracks() });
          const timer = setInterval(() => {
            if (
              stream.getTracks().every((track) => track.readyState === 'ended')
            )
              clearInterval(timer);
            else paint();
          }, 100);
          return stream;
        },
      });
    },
    { png },
  );
  await page.goto('/pokedrops');
  await page.getByRole('button', { name: 'Escanear QR' }).click();
  await expect(page.getByLabel('Código del PokéDrop')).toHaveValue(code);
  await expect(page.getByLabel('Vista de la cámara')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { scannedTracks: MediaStreamTrack[] }
      ).scannedTracks.every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(requests.previews()).toBe(0);
  expect(requests.redemptions()).toBe(0);
  await page
    .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Confirmar canje de 3 Pokémon' }),
  ).toBeVisible();
  expect(requests.redemptions()).toBe(0);
});

test('a second link in the same tab replaces the previous draft without querying or redeeming', async ({
  page,
}) => {
  const requests = await setup(page);
  await page.goto(`/pokedrop#${code}`);
  await expect(page.getByLabel('Código del PokéDrop')).toHaveValue(code);
  const next = 'ef'.repeat(32);
  await page.evaluate((next) => {
    window.location.hash = next;
  }, next);
  await expect(page.getByLabel('Código del PokéDrop')).toHaveValue(next);
  await expect(page).toHaveURL('/pokedrop');
  expect(requests.previews()).toBe(0);
  expect(requests.redemptions()).toBe(0);
});
