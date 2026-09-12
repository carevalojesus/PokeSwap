import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Edits are confined to the dedicated temporary test Worker and test credentials.
async function main() {
  const [base, file] = process.argv.slice(2);
  const url = new URL(base);
  const credentials = JSON.parse(await readFile(file, 'utf8'));
  if (
    url.protocol !== 'https:' ||
    !/^pokeswap-profile-ui-[a-f0-9]{8}\.christian-ar-valo-jes-s\.workers\.dev$/.test(
      url.hostname,
    ) ||
    credentials.environment !== '--test' ||
    credentials.status !== 'created'
  )
    throw new Error('test_only');
  const browser = await chromium.launch();
  const contexts = [];
  let original;
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        locale: 'es-PE',
      });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(new URL('/ingresar', base).href);
      await page
        .getByLabel('ID SENATI', { exact: true })
        .fill(credentials.senatiId);
      await page
        .getByLabel('Contraseña', { exact: true })
        .fill(credentials.password);
      await page
        .getByRole('button', { name: 'Iniciar sesión', exact: true })
        .click();
      await expect(page).toHaveURL(new URL('/docente', base).href);
      await page.goto(new URL('/perfil', base).href);
      await page
        .getByRole('button', { name: 'Editar perfil', exact: true })
        .click();
    }
    const [a, b] = contexts.map((c) => c.pages()[0]);
    original = await (
      await contexts[0].request.get(new URL('/api/me', base).href)
    ).json();
    await a
      .getByLabel('Nombres', { exact: true })
      .fill('Verificación temporal');
    await a
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(a.getByRole('status')).toContainText('Cambios guardados');
    await b
      .getByLabel('Nombres', { exact: true })
      .fill('Borrador segundo dispositivo');
    const conflict = b.waitForResponse(
      (r) =>
        r.url().endsWith('/api/me/profile') && r.request().method() === 'PATCH',
    );
    await b
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    if ((await conflict).status() !== 409) throw new Error('expected_conflict');
    await expect(b.getByLabel('Nombres', { exact: true })).toHaveValue(
      'Borrador segundo dispositivo',
    );
    await b.getByRole('button', { name: 'Cargar datos actuales' }).click();
    await expect(b.getByLabel('Nombres', { exact: true })).toHaveValue(
      'Verificación temporal',
    );
    await b
      .getByLabel('Nombres', { exact: true })
      .fill('Cambio revisado temporal');
    await b
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(b.getByRole('status')).toContainText('Cambios guardados');
    await a.reload();
    await expect(a.getByRole('main')).toContainText('Cambio revisado temporal');
    const current = await (
      await contexts[0].request.get(new URL('/api/me', base).href)
    ).json();
    if (
      current.user.profileVersion !== original.user.profileVersion + 2 ||
      current.user.senatiId !== original.user.senatiId ||
      current.user.trainerName !== original.user.trainerName ||
      current.user.birthDate !== original.user.birthDate
    )
      throw new Error('unexpected_profile');
    console.log(
      'OK real profile UI: persisted edit, conflict 409 across sessions, draft recovery and unchanged identity.',
    );
  } finally {
    try {
      if (original && contexts[0]) {
        const current = await (
          await contexts[0].request.get(new URL('/api/me', base).href)
        ).json();
        const restored = await contexts[0].request.patch(
          new URL('/api/me/profile', base).href,
          {
            headers: { Origin: url.origin },
            data: {
              firstNames: original.user.firstNames,
              lastNames: original.user.lastNames,
              birthDate: original.user.birthDate,
              profileVersion: current.user.profileVersion,
            },
          },
        );
        if (restored.status() !== 200) {
          console.error('No se confirmó la restauración del perfil ficticio.');
          process.exitCode = 1;
        }
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
    'Falló la comprobación de perfil en pruebas. No se muestran credenciales ni detalles privados.',
  );
  process.exitCode = 1;
});
