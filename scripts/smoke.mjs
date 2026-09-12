import assert from 'node:assert/strict';

const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  throw new Error('Uso: npm run smoke -- http(s)://host');
}

async function request(path, init) {
  return fetch(new URL(path, base), {
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
}

for (const path of ['/', '/coleccion']) {
  const response = await request(path, {
    headers: { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' },
  });
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  const html = await response.text();
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /PokéSwap Classroom/);
  console.log(`OK SPA: ${path}`);
}

for (const headers of [
  {},
  { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' },
]) {
  const health = await request('/api/health', { headers });
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), {
    status: 'ok',
    service: 'pokeswap-classroom',
  });
  for (const path of ['/api', '/api/no-existe']) {
    const missing = await request(path, { headers });
    assert.equal(missing.status, 404, path);
    assert.deepEqual(await missing.json(), { error: 'Ruta no encontrada.' });
  }
}
console.log('OK API: salud y rutas desconocidas, con fetch y navegación.');
