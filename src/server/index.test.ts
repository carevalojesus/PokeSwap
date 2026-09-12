import { describe, expect, it } from 'vitest';
import app from './index';

describe('API foundation', () => {
  it('provides a JSON liveness response without infrastructure details', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'pokeswap-classroom',
    });
  });

  it.each(['/api', '/api/no-existe', '/api/health/no-existe'])(
    'returns JSON 404 for %s rather than a success page',
    async (path) => {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'Ruta no encontrada.' });
    },
  );

  it('does not treat an unsupported POST as a successful health check', async () => {
    const response = await app.request('/api/health', {
      method: 'POST',
      headers: { Origin: 'http://localhost' },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Ruta no encontrada.' });
  });
});
