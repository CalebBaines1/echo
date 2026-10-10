import { z } from 'zod';

export const PersonSchema = z.object({
  id: z.string().max(80),
  name: z.string().trim().min(1).max(60),
  ids: z.array(z.string().max(80)).max(60),
  hobbyIds: z.array(z.string().max(40)).max(20).optional(),
  notes: z.array(z.string().max(120)).max(20).optional(),
  loves: z.array(z.string().trim().max(80)).max(6).optional(),
  tasteNames: z.array(z.string().trim().max(120)).max(8).optional(),
});

export const AreaSchema = z.object({
  label: z.string().max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  sample: z.boolean().optional(),
});
