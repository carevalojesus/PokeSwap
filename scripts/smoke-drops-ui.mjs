import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';

let stage = 'configuration';

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
    stage = 'teacher login';
    await t.goto(new URL('/ingresar', base).href);
    await t.getByLabel('ID SENATI', { exact: true }).fill(teacher.senatiId);
    await t.getByLabel('Contraseña', { exact: true }).fill(teacher.password);
    await t
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(t).toHaveURL(new URL('/docente', base).href);
    stage = 'teacher create';
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
    stage = 'teacher recovery';
    await t.reload();
    // The newly created drop is first in the teacher's descending list.
    await t.getByRole('button', { name: 'Ver entrega' }).first().click();
    await expect(
      t.getByLabel('Código para compartir con tu clase'),
    ).toHaveValue(code);
    await expect(t.getByRole('img', { name: 'QR del PokéDrop' })).toBeVisible();
    const link = await t.getByLabel('Enlace del PokéDrop').inputValue();
    if (link !== new URL(`/pokedrop#${code}`, base).href) throw Error('link');
    for (const [index, page] of [a, b].entries()) {
      stage = `student ${index + 1} registration`;
      await page.goto(index === 0 ? link : new URL('/registro', base).href);
      if (index === 0)
        await page
          .getByRole('link', { name: 'Crea tu cuenta de alumno' })
          .click();
      await expect(
        page.getByRole('heading', { name: 'Crea tu cuenta', exact: true }),
      ).toBeVisible();
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
      const registered = page
        .waitForResponse(
          (response) => response.url().endsWith('/api/auth/register'),
          { timeout: 10000 },
        )
        .catch(() => null);
      await page
        .getByRole('button', { name: 'Crear mi cuenta', exact: true })
        .click();
      const invalid = await page
        .locator('input[aria-invalid="true"]')
        .evaluateAll((inputs) => inputs.map((input) => input.id));
      if (invalid.length) {
        stage = `registration invalid fields: ${invalid.join(',')}`;
        throw Error('invalid_fixture');
      }
      const registrationResponse = await registered;
      if (!registrationResponse) {
        stage = 'registration produced no HTTP response';
        throw Error('missing_response');
      }
      stage = `student ${index + 1} registration HTTP ${registrationResponse.status()}`;
      if (registrationResponse.status() !== 201) throw Error('registration');
      if (index === 0) {
        await expect(page.getByLabel('Código del PokéDrop')).toHaveValue(code);
        stage = 'registered student sees code, URL normalization';
      }
      await expect(page).toHaveURL(
        new URL(index === 0 ? '/pokedrop' : '/coleccion', base).href,
      );
      stage = `student ${index + 1} initial`;
      const initial = await (
        await contexts[index + 1].request.get(
          new URL('/api/me/collection', base).href,
        )
      ).json();
      if (initial.total !== 1) throw Error('initial');
      stage = `student ${index + 1} entry`;
      if (index === 0)
        await expect(page.getByLabel('Código del PokéDrop')).toHaveValue(code);
      else {
        await page.goto(new URL('/pokedrops', base).href);
        await page.getByLabel('Código del PokéDrop').fill(link);
      }
      await page
        .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: 'Tres nuevos ejemplares te esperan',
        }),
      ).toBeVisible();
      stage = `student ${index + 1} preview`;
      const previewCollection = await (
        await contexts[index + 1].request.get(
          new URL('/api/me/collection', base).href,
        )
      ).json();
      if (previewCollection.total !== 1) throw Error('preview_awarded');
      stage = `student ${index + 1} redemption`;
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
    stage = 'teacher count and cancellation';
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
    stage = 'reward recovery';
    await a.goto(new URL('/pokedrops', base).href);
    await a.getByLabel('Código del PokéDrop').fill(code);
    await a
      .getByRole('button', { name: 'Consultar PokéDrop', exact: true })
      .click();
    await expect(
      a.getByRole('heading', { name: 'Tus tres Pokémon están guardados' }),
    ).toBeVisible();
    console.log(
      `OK ${engine} HTTPS drops: teacher QR/link/code recovery, link through registration, pasted link, two students, preview without award, concurrent duplicate redemptions, four total instances each, cancellation and durable reward recovery.`,
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
main().catch((error) => {
  const line =
    /smoke-drops-ui\.mjs:(\d+)/.exec(String(error?.stack))?.[1] ?? 'unknown';
  console.error(
    `Falló la verificación de PokéDrops de pruebas (${stage}, línea ${line}, ${error instanceof Error ? error.name : 'error'}). No se muestran credenciales, códigos ni datos privados.`,
  );
  process.exitCode = 1;
});
