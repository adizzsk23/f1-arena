import { z } from 'zod';

/**
 * Track JSON format (SPEC §10). Coordinates are metres in a flat world plane:
 * +x east, +y north, the track runs in the order the points are listed and is closed.
 * Per-point attributes are interpolated along the Catmull-Rom centerline.
 */
export const TrackPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  /** Full asphalt width between the white lines (m). */
  width: z.number().positive(),
  /** Wall distance from the centerline, left / right (m). Must exceed width/2. */
  wallL: z.number().positive(),
  wallR: z.number().positive(),
  /** Kerb present on the left / right edge at this point. */
  kerbL: z.boolean().default(false),
  kerbR: z.boolean().default(false),
});

const ProgressRange = z.object({ from: z.number().min(0).max(1), to: z.number().min(0).max(1) });

export const TrackJsonSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().default(1),
  /** Sector boundaries as lap-progress fractions (0..1), excluding the start/finish line at 0. */
  sectors: z.array(z.number().gt(0).lt(1)).default([]),
  points: z.array(TrackPointSchema).min(4),
  /** Grid boxes behind the line (m before s = 0). Phase 1 uses only the first. */
  gridSlotsM: z.array(z.number().nonnegative()).default([20]),
  // ---- Defined now, used from Phase 3 ----
  drsZones: z
    .array(z.object({ detection: z.number().min(0).max(1), activation: ProgressRange }))
    .default([]),
  pitLane: z
    .object({
      entry: z.number().min(0).max(1),
      exit: z.number().min(0).max(1),
      speedLimitKph: z.number().positive(),
      boxes: z.array(z.number().min(0).max(1)),
    })
    .nullable()
    .default(null),
  trackLimits: z
    .object({ enforced: z.boolean(), exemptRanges: z.array(ProgressRange).default([]) })
    .default({ enforced: false, exemptRanges: [] }),
  /** Free-form layout notes (corner names etc.). */
  corners: z.array(z.object({ name: z.string(), at: z.number().min(0).max(1) })).default([]),
});

export type TrackPoint = z.infer<typeof TrackPointSchema>;
export type TrackJson = z.infer<typeof TrackJsonSchema>;
export type TrackJsonInput = z.input<typeof TrackJsonSchema>;

export function parseTrackJson(data: unknown): TrackJson {
  return TrackJsonSchema.parse(data);
}
