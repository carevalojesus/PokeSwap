import { z } from 'zod';

export const dropCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/);
export const createDropSchema = z.strictObject({
  id: z.uuid(),
  minutes: z.number().int().min(1).max(1440).default(30),
});
export const redeemDropSchema = z.strictObject({ code: dropCodeSchema });
const timestamp = z.number().int().nonnegative();
export const dropSchema = z.strictObject({
  id: z.uuid(),
  createdAt: timestamp,
  expiresAt: timestamp,
  cancelledAt: timestamp.nullable(),
  state: z.enum(['active', 'expired', 'cancelled']),
  redemptions: z.number().int().nonnegative(),
});
export const rewardSchema = z
  .strictObject({
    id: z.uuid(),
    dropId: z.uuid(),
    userId: z.string().min(1),
    createdAt: timestamp,
    probabilitiesVersion: z.literal(1),
    instances: z
      .array(
        z.strictObject({
          instanceId: z.uuid(),
          speciesId: z.number().int().min(1).max(151),
          slot: z.number().int().min(0).max(2),
        }),
      )
      .length(3),
  })
  .refine(
    (r) =>
      new Set(r.instances.map((i) => i.slot)).size === 3 &&
      new Set(r.instances.map((i) => i.instanceId)).size === 3,
  );
export const dropDetailSchema = z.strictObject({
  userId: z.string().min(1),
  drop: dropSchema,
  code: dropCodeSchema.nullable(),
});
export const dropListSchema = z.strictObject({
  userId: z.string().min(1),
  drops: z.array(dropSchema).max(50),
});
export const dropPreviewSchema = z.strictObject({
  userId: z.string().min(1),
  drop: dropSchema.omit({ redemptions: true }),
  reward: rewardSchema.nullable(),
});
export type Drop = z.infer<typeof dropSchema>;
export type DropReward = z.infer<typeof rewardSchema>;
