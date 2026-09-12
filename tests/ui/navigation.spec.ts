import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
});

test('catalog search, filters, accessible detail and recovery', async ({
  page,
}) => {
  await page.goto('/pokedex');
  const list = page.getByRole('list', { name: 'Especies' });
  await expect(list.getByRole('listitem')).toHaveCount(151);
  const search = page.getByRole('searchbox', {
    name: 'Buscar por nombre o número',
  });
  await search.fill('pikachu');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  const card = page.getByRole('button', {
    name: 'Ver ficha de Pikachu, número 25',
  });
  await card.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
  await expect(dialog).toContainText('no indica que tengas este Pokémon');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();
  await search.fill('no-existe');
  await expect(
    page.getByRole('heading', { name: 'No encontramos esa especie' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Limpiar búsqueda y filtros' })
    .click();
  await page.getByText('Adicional', { exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Mew');
  await page.getByRole('radio', { name: /Adicional/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: /Meta/ })).toBeChecked();
  await expect(list.getByRole('listitem')).toHaveCount(150);
  await search.fill('#150');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Mewtwo');
});

test('private routes require a session and unknown paths remain recoverable', async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      privateRequests.push(request.url());
  });
  for (const path of [
    '/coleccion',
    '/intercambios',
    '/ranking',
    '/perfil',
    '/docente',
    '/docente/alumnos',
    '/docente/pokedrops',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL('/ingresar');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Entra a tu aventura' }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveTitle('Entra a tu aventura · PokéSwap Classroom');
  }
  await page.goto('/una-ruta-inexistente');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Este camino no existe',
  );
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL('/');
  expect(
    privateRequests.every((url) => new URL(url).pathname === '/api/me'),
  ).toBe(true);
});

test('navigation, history and heading focus', async ({ page, isMobile }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', {
    name: isMobile ? 'Navegación inferior' : 'Navegación principal',
  });
  await nav.getByRole('link', { name: 'Pokédex', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(
    nav.getByRole('link', { name: 'Pokédex', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await page.goForward();
  await expect(page).toHaveURL('/pokedex');
  if (isMobile) {
    const menu = page.getByRole('button', { name: 'Abrir menú' });
    await menu.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await menu.click();
    await dialog.getByRole('link', { name: 'Intercambios' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await menu.click();
    await page
      .getByRole('dialog')
      .getByRole('link', { name: 'Espacio docente' })
      .click();
    await expect(page).toHaveURL('/ingresar');
  }
});

test('keyboard skip link, dialog focus trap and visible quantities', async ({
  page,
  browserName,
}) => {
  // macOS WebKit uses Option-Tab for links; keep host preferences unchanged.
  const tabKey =
    browserName === 'webkit' && process.platform === 'darwin'
      ? 'Alt+Tab'
      : 'Tab';
  await page.goto('/');
  await page.keyboard.press(tabKey);
  await expect(
    page.getByRole('link', { name: 'Saltar al contenido' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const trigger = page
    .getByRole('main')
    .getByRole('button', { name: 'Cómo jugar' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Pikachu ×5');
  await expect(dialog).toContainText('1 protegido');
  await expect(dialog).toContainText('4 disponibles');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press(i % 2 ? `Shift+${tabKey}` : tabKey);
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(
    await trigger.evaluate((e) => getComputedStyle(e).outlineStyle),
  ).not.toBe('none');
});

test('responsive widths, reduced motion and image failure', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/pokemon/1.png', (route) => route.abort());
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Ver ficha de Bulbasaur, número 1' })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText('Imagen no disponible', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.goto('/pokedex');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.unroute('**/pokemon/1.png');
  await page.goto('/');
  await page.screenshot({
    path: testInfo.outputPath('home-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pokedex');
  await page.screenshot({ path: testInfo.outputPath('pokedex-mobile.png') });
});
