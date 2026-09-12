import { randomUUID } from 'node:crypto';
/* global document, innerWidth -- Used only inside Playwright's browser evaluate. */
import { chromium, webkit, expect } from '@playwright/test';

// This creates a fictitious student only on a dedicated temporary test Worker.
async function main() {
  const [base, engine = 'chromium'] = process.argv.slice(2);
  const url = new URL(base);
  if (
    url.protocol !== 'https:' ||
    !/^pokeswap-collection-ui-[a-f0-9]{8}\.christian-ar-valo-jes-s\.workers\.dev$/.test(
      url.hostname,
    ) ||
    !['chromium', 'webkit'].includes(engine)
  )
    throw Error('test_only');
  const credentials = {
    id: `COL${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
    password: randomUUID(),
  };
  const browser = await { chromium, webkit }[engine].launch();
  const contexts = [];
  try {
    for (const width of [390, 1440])
      contexts.push(
        await browser.newContext({
          viewport: { width, height: 1000 },
          locale: 'es-PE',
        }),
      );
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    await a.goto(new URL('/registro', base).href);
    await a.getByLabel('ID SENATI', { exact: true }).fill(credentials.id);
    await a
      .getByLabel('Contraseña', { exact: true })
      .fill(credentials.password);
    await a.getByLabel('Nombres', { exact: true }).fill('Alumna de prueba');
    await a.getByLabel('Apellidos', { exact: true }).fill('Colección temporal');
    await a
      .getByLabel('Fecha de nacimiento', { exact: true })
      .fill('2000-02-29');
    await a
      .getByRole('button', { name: 'Crear mi cuenta', exact: true })
      .click();
    await expect(a).toHaveURL(new URL('/coleccion', base).href);
    const meResponse = await contexts[0].request.get(
      new URL('/api/me', base).href,
    );
    if (meResponse.status() !== 200) throw Error('session');
    const me = await meResponse.json();
    const expected = {
      userId: me.user.id,
      goal: 150,
      obtained: me.initial.speciesId <= 150 ? 1 : 0,
      total: 1,
      reserved: 0,
      available: 0,
      nextRefreshAt: null,
      species: [
        {
          speciesId: me.initial.speciesId,
          total: 1,
          protected: 1,
          reserved: 0,
          available: 0,
        },
      ],
    };
    await b.goto(new URL('/ingresar', base).href);
    await b.getByLabel('ID SENATI', { exact: true }).fill(credentials.id);
    await b
      .getByLabel('Contraseña', { exact: true })
      .fill(credentials.password);
    await b
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(b).toHaveURL(new URL('/coleccion', base).href);
    for (const [index, page] of [a, b].entries()) {
      await expect(page.getByRole('progressbar')).toHaveAttribute(
        'value',
        String(expected.obtained),
      );
      await expect(page.getByRole('progressbar')).toHaveAttribute('max', '150');
      await expect(
        page.getByRole('list', { name: 'Tu colección' }).getByRole('listitem'),
      ).toHaveCount(1);
      const response = await contexts[index].request.get(
        new URL('/api/me/collection', base).href,
      );
      if (
        response.status() !== 200 ||
        response.headers()['cache-control'] !== 'no-store'
      )
        throw Error('private_read');
      expect(await response.json()).toEqual(expected);
      await page
        .getByRole('radio', { name: 'Repetidos' })
        .locator('..')
        .click();
      await expect(
        page.getByRole('heading', { name: 'Aún no tienes repetidos' }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole('list', { name: 'Tu colección' }).getByRole('listitem'),
      ).toHaveCount(1);
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ))
      )
        throw Error('overflow');
    }
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.get(new URL('/api/me/collection', base).href)
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
    console.log(
      `OK ${engine} HTTPS collection: real registration/initial, two independent sessions, persisted counts, goal 150, duplicate empty state, reload, private cache and anonymous denial.`,
    );
  } finally {
    for (const context of contexts)
      await context.request
        .post(new URL('/api/auth/logout', base).href, {
          headers: { Origin: url.origin },
          data: {},
        })
        .catch(() => {});
    await browser.close();
  }
}
main().catch(() => {
  console.error(
    'Falló el recorrido de colección de pruebas. No se muestran credenciales ni datos privados.',
  );
  process.exitCode = 1;
});
