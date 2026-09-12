import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';

// Fictitious students and test teacher only; never accepts the production host.
async function main() {
  const [base, credentialsFile, engine = 'chromium'] = process.argv.slice(2);
  const url = new URL(base);
  if (
    url.protocol !== 'https:' ||
    !/^pokeswap-drops-ui-[a-f0-9]{8}\.christian-ar-valo-jes-s\.workers\.dev$/.test(
      url.hostname,
    ) ||
    !['chromium', 'webkit'].includes(engine)
  )
    throw Error('test_only');
  const teacher = JSON.parse(await readFile(credentialsFile, 'utf8'));
  if (teacher.status !== 'created' || teacher.environment !== '--test')
    throw Error('test_teacher_only');
  const browser = await { chromium, webkit }[engine].launch();
  const contexts = [];
  let dropId;
  try {
    for (const width of [1440, 390, 390])
      contexts.push(
        await browser.newContext({
          viewport: { width, height: 1000 },
          locale: 'es-PE',
        }),
      );
    const [t, a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    await t.goto(new URL('/ingresar', base).href);
    await t.getByLabel('ID SENATI', { exact: true }).fill(teacher.senatiId);
    await t.getByLabel('Contraseña', { exact: true }).fill(teacher.password);
    await t
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(t).toHaveURL(new URL('/docente', base).href);
    await t.goto(new URL('/docente/pokedrops', base).href);
    const created = t.waitForResponse(
      (r) =>
        r.url().endsWith('/api/admin/drops') && r.request().method() === 'POST',
    );
    await t
      .getByRole('button', { name: 'Crear PokéDrop', exact: true })
      .click();
    const response = await created;
    if (response.status() !== 200) throw Error('create');
    const data = await response.json();
    dropId = data.drop.id;
    const code = await t
      .getByLabel('Código para compartir con tu clase')
      .inputValue();
    if (code !== data.code) throw Error('code');
    await t.reload();
    // The newly created drop is first in the teacher's descending list.
    await t.getByRole('button', { name: 'Ver entrega' }).first().click();
    await expect(
      t.getByLabel('Código para compartir con tu clase'),
    ).toHaveValue(code);
    for (const [index, page] of [a, b].entries()) {
      await page.goto(new URL('/registro', base).href);
      await page
        .getByLabel('ID SENATI', { exact: true })
        .fill(
          `DROP${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
        );
      await page.getByLabel('Contraseña', { exact: true }).fill(randomUUID());
      await page
        .getByLabel('Nombres', { exact: true })
        .fill('Alumno de prueba');
      await page
        .getByLabel('Apellidos', { exact: true })
        .fill('PokéDrop temporal');
      await page
        .getByLabel('Fecha de nacimiento', { exact: true })
        .fill('2000-02-29');
      await page
        .getByRole('button', { name: 'Crear mi cuenta', exact: true })
        .click();
      await expect(page).toHaveURL(new URL('/coleccion', base).href);
      const initial = await (
        await contexts[index + 1].request.get(
          new URL('/api/me/collection', base).href,
        )
      ).json();
      if (initial.total !== 1) throw Error('initial');
      await page.goto(new URL('/pokedrops', base).href);
      await page.getByLabel('Código del PokéDrop').fill(code);
      await page
        .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: 'Tres nuevos ejemplares te esperan',
        }),
      ).toBeVisible();
      const previewCollection = await (
        await contexts[index + 1].request.get(
          new URL('/api/me/collection', base).href,
        )
      ).json();
      if (previewCollection.total !== 1) throw Error('preview_awarded');
      const duplicate = contexts[index + 1].request.post(
        new URL('/api/drops/redeem', base).href,
        { headers: { Origin: url.origin }, data: { code } },
      );
      await page
        .getByRole('button', { name: 'Confirmar canje de 3 Pokémon' })
        .click();
      await expect(
        page
          .getByRole('region', { name: 'Premios confirmados' })
          .getByRole('listitem'),
      ).toHaveCount(3);
      const repeated = await duplicate;
      if (repeated.status() !== 200) throw Error('race');
      const persisted = await (
        await contexts[index + 1].request.post(
          new URL('/api/drops/preview', base).href,
          { headers: { Origin: url.origin }, data: { code } },
        )
      ).json();
      expect(persisted.reward).toEqual((await repeated.json()).reward);
      await page
        .getByRole('link', { name: 'Ver mi colección', exact: true })
        .click();
      const collection = await (
        await contexts[index + 1].request.get(
          new URL('/api/me/collection', base).href,
        )
      ).json();
      if (collection.total !== 4) throw Error('total');
    }
    await t
      .getByRole('button', { name: 'Consultar estado', exact: true })
      .click();
    await expect(
      t.getByRole('region', { name: 'PokéDrop seleccionado' }),
    ).toContainText('Canjes confirmados: 2');
    await t
      .getByRole('button', { name: 'Cancelar PokéDrop', exact: true })
      .click();
    await t.getByRole('button', { name: 'Confirmar cancelación' }).click();
    await expect(
      t.getByRole('region', { name: 'PokéDrop seleccionado' }),
    ).toContainText('Cancelado');
    await a.goto(new URL('/pokedrops', base).href);
    await a.getByLabel('Código del PokéDrop').fill(code);
    await a
      .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
      .click();
    await expect(
      a.getByRole('heading', { name: 'Tus tres Pokémon están guardados' }),
    ).toBeVisible();
    console.log(
      `OK ${engine} HTTPS drops: teacher create/reload/code recovery, two students, preview without award, concurrent duplicate redemptions, four total instances each, cancellation and durable reward recovery.`,
    );
  } finally {
    if (dropId && contexts[0])
      await contexts[0].request
        .post(new URL(`/api/admin/drops/${dropId}/cancel`, base).href, {
          headers: { Origin: url.origin },
          data: {},
        })
        .catch(() => {});
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
    'Falló la verificación de PokéDrops de pruebas. No se muestran credenciales, códigos ni datos privados.',
  );
  process.exitCode = 1;
});
