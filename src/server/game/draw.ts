import { secureUint32, uniformInteger } from './random';

export const PROBABILITIES_VERSION = 1;

export interface RewardDraw {
  readonly speciesId: number;
  readonly probabilitiesVersion: typeof PROBABILITIES_VERSION;
}

// One common function for the initial and each of the three PokéDrop slots.
// No collection state, pity counter, network lookup or persistence here.
export function drawPokemon(
  nextUint32: () => number = secureUint32,
): RewardDraw {
  const ticket = uniformInteger(1000, nextUint32);
  const speciesId =
    ticket === 0
      ? 150
      : ticket === 1
        ? 151
        : uniformInteger(149, nextUint32) + 1;
  return { speciesId, probabilitiesVersion: PROBABILITIES_VERSION };
}
