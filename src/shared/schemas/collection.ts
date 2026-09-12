import { z } from 'zod';

const count = z.number().int().nonnegative().safe();
export const collectionSpeciesSchema = z
  .strictObject({
    speciesId: z.number().int().min(1).max(151),
    total: count.positive(),
    protected: z.literal(1),
    reserved: count,
    available: count,
  })
  .refine((s) => s.total === s.protected + s.reserved + s.available);
export const collectionSchema = z
  .strictObject({
    userId: z.string().min(1),
    species: z.array(collectionSpeciesSchema).max(151),
    goal: z.literal(150),
    obtained: count.max(150),
    total: count,
    reserved: count,
    available: count,
    nextRefreshAt: count.nullable(),
  })
  .refine(
    (c) =>
      new Set(c.species.map((s) => s.speciesId)).size === c.species.length &&
      c.obtained === c.species.filter((s) => s.speciesId <= 150).length &&
      c.total === c.species.reduce((n, s) => n + s.total, 0) &&
      c.reserved === c.species.reduce((n, s) => n + s.reserved, 0) &&
      c.available === c.species.reduce((n, s) => n + s.available, 0),
  );
export type Collection = z.infer<typeof collectionSchema>;
export type CollectionSpecies = z.infer<typeof collectionSpeciesSchema>;
