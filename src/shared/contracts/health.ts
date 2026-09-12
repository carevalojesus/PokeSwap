/** Liveness only: this does not assert database or game readiness. */
export interface HealthResponse {
  status: 'ok';
  service: 'pokeswap-classroom';
}
