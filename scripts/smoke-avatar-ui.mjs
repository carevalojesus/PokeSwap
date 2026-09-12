import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

// Dedicated temporary test deployment only; never creates accounts in production.
async function main() {
  const [base] = process.argv.slice(2);
  const url = new URL(base);
  if (
    url.protocol !== 'https:' ||
    !/^pokeswap-avatar-ui-[a-f0-9]{8}\.christian-ar-valo-jes-s\.workers\.dev$/.test(
      url.hostname,
    )
  )
    throw Error('test_only');
  const [fixture] = JSON.parse(
    await readFile(
      new URL('../src/server/media/fixtures.json', import.meta.url),
      'utf8',
    ),
  );
  const file = {
    name: 'figura.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from(fixture, 'base64'),
  };
  const credentials = {
    id: `FOTO${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
    password: randomUUID(),
  };
  const browser = await chromium.launch();
  const contexts = [];
  let account;
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
    await a.getByLabel('Apellidos', { exact: true }).fill('Foto temporal');
    await a
      .getByLabel('Fecha de nacimiento', { exact: true })
      .fill('2000-02-29');
    await a
      .getByRole('button', { name: 'Crear mi cuenta', exact: true })
      .click();
    await expect(a).toHaveURL(new URL('/coleccion', base).href);
    account = await (
      await contexts[0].request.get(new URL('/api/me', base).href)
    ).json();
    await b.goto(new URL('/ingresar', base).href);
    await b.getByLabel('ID SENATI', { exact: true }).fill(credentials.id);
    await b
      .getByLabel('Contraseña', { exact: true })
      .fill(credentials.password);
    await b
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(b).toHaveURL(new URL('/coleccion', base).href);
    for (const page of [a, b]) {
      await page.goto(new URL('/perfil', base).href);
      await page.getByLabel('Seleccionar foto').setInputFiles(file);
      await expect(
        page.getByRole('button', { name: 'Guardar foto', exact: true }),
      ).toBeEnabled();
    }
    await a.getByRole('button', { name: 'Guardar foto', exact: true }).click();
    await expect(a.getByRole('status')).toContainText('Solicitud confirmada');
    const conflict = b.waitForResponse(
      (r) =>
        r.url().endsWith('/api/me/avatar') && r.request().method() === 'PUT',
    );
    await b.getByRole('button', { name: 'Guardar foto', exact: true }).click();
    if ((await conflict).status() !== 409) throw Error('conflict');
    await expect(b.getByRole('alert')).toContainText('El perfil cambió');
    await b
      .getByRole('button', { name: 'Consultar perfil y descartar intento' })
      .click();
    await b.reload();
    const image = b.getByRole('img', { name: 'Foto de perfil guardada' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el) => el.naturalWidth)).toBe(512);
    const endpoint = new URL(`/api/users/${account.user.id}/avatar`, base).href;
    const response = await contexts[1].request.get(endpoint);
    if (
      response.status() !== 200 ||
      response.headers()['cache-control'] !== 'private, no-cache'
    )
      throw Error('private_read');
    const anonymous = await browser.newContext();
    try {
      if ((await anonymous.request.get(endpoint)).status() !== 401)
        throw Error('anonymous');
    } finally {
      await anonymous.close();
    }
    await a.getByRole('button', { name: 'Eliminar foto', exact: true }).click();
    await a.getByRole('button', { name: 'Confirmar eliminación' }).click();
    await expect(a.getByRole('status')).toContainText('Eliminación confirmada');
    await b.reload();
    await expect(
      b.getByRole('img', { name: 'Foto de perfil guardada' }),
    ).toHaveCount(0);
    const final = await (
      await contexts[0].request.get(new URL('/api/me', base).href)
    ).json();
    if (
      final.user.avatarUrl !== null ||
      JSON.stringify(final.initial) !== JSON.stringify(account.initial)
    )
      throw Error('initial_changed');
    console.log(
      'OK real avatar UI: student registration, crop/upload to R2, second-session conflict and read, authenticated image, delete and unchanged initial.',
    );
  } finally {
    try {
      if (account) {
        const current = await (
          await contexts[0].request.get(new URL('/api/me', base).href)
        ).json();
        if (current.user?.avatarUrl)
          await contexts[0].request.delete(
            new URL('/api/me/avatar', base).href,
            {
              headers: {
                Origin: url.origin,
                'X-Profile-Version': String(current.user.profileVersion),
              },
            },
          );
      }
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
}
main().catch(() => {
  console.error(
    'Falló el recorrido de fotos de pruebas. No se muestran credenciales ni datos privados.',
  );
  process.exitCode = 1;
});
