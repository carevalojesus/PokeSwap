import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Real credentials are read privately: no traces, screenshots or raw failures.
async function main() {
  const [base, credentialsFile] = process.argv.slice(2);
  if (!base || !credentialsFile || new URL(base).protocol !== 'https:')
    throw new Error('invalid_arguments');
  const credentials = JSON.parse(await readFile(credentialsFile, 'utf8'));
  if (credentials.status !== 'created')
    throw new Error('invalid_credentials_file');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'es-PE',
  });
  try {
    const page = await context.newPage();
    await page.goto(new URL('/ingresar', base).href);
    await expect(
      page.getByRole('form', { name: 'Iniciar sesión' }),
    ).toBeVisible();
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
    await expect(page.getByRole('main')).toContainText(
      'Tu acceso docente está confirmado',
    );
    const me = await context.request.get(new URL('/api/me', base).href);
    const profile = await me.json();
    if (
      me.status() !== 200 ||
      profile.user.id !== credentials.userId ||
      profile.user.role !== 'teacher' ||
      profile.initial !== null
    )
      throw new Error('unexpected_profile');
    await page.getByRole('link', { name: 'Mi perfil', exact: true }).click();
    await expect(
      page.getByRole('main').getByText(credentials.senatiId, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await expect(page).toHaveURL(new URL('/ingresar', base).href);
    const ended = await context.request.get(new URL('/api/me', base).href);
    if (ended.status() !== 401) throw new Error('logout_not_confirmed');
    await page.goto(new URL('/perfil', base).href);
    await expect(page).toHaveURL(new URL('/ingresar', base).href);
    console.log(
      'OK teacher UI: login, role, private profile, logout and route protection.',
    );
  } finally {
    await context.request
      .post(new URL('/api/auth/logout', base).href, {
        data: {},
        headers: { Origin: new URL(base).origin },
      })
      .catch(() => {});
    await browser.close();
  }
}
main().catch(() => {
  console.error(
    'Falló el recorrido docente. No se muestran credenciales ni detalles privados. Uso: npm run smoke:auth:ui -- https://host /ruta/credenciales.json',
  );
  process.exitCode = 1;
});
