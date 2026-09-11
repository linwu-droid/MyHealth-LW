/**
 * Compendium-style MET catalog + calorie estimators for exercise logging.
 * Formula: kcal = MET x weightKg x (minutes / 60), rounded to nearest kcal.
 */
export type ExercisePreset = { id: string; name: string; met: number; category: string }

export const PRESETS: ExercisePreset[] = [
  { id: 'walk-leisure', name: 'Walking (leisure)', met: 2.0, category: 'Walking' },
  { id: 'walk-brisk', name: 'Walking (brisk)', met: 3.5, category: 'Walking' },
  { id: 'walk-very-brisk', name: 'Walking (very brisk)', met: 4.3, category: 'Walking' },
  { id: 'run-easy', name: 'Running (easy)', met: 7.0, category: 'Running' },
  { id: 'run-moderate', name: 'Running (moderate)', met: 9.8, category: 'Running' },
  { id: 'run-hard', name: 'Running (hard)', met: 11.5, category: 'Running' },
  { id: 'cycle-leisure', name: 'Cycling (leisure)', met: 4.0, category: 'Cycling' },
  { id: 'cycle-moderate', name: 'Cycling (moderate)', met: 6.8, category: 'Cycling' },
  { id: 'cycle-vigorous', name: 'Cycling (vigorous)', met: 10.0, category: 'Cycling' },
  { id: 'swim-moderate', name: 'Swimming (moderate)', met: 7.0, category: 'Swimming' },
  { id: 'swim-vigorous', name: 'Swimming (vigorous)', met: 9.8, category: 'Swimming' },
  { id: 'elliptical', name: 'Elliptical trainer', met: 5.0, category: 'Cardio' },
  { id: 'rowing-moderate', name: 'Rowing (moderate)', met: 7.0, category: 'Cardio' },
  { id: 'rowing-vigorous', name: 'Rowing (vigorous)', met: 8.5, category: 'Cardio' },
  { id: 'yoga', name: 'Yoga', met: 2.5, category: 'Mind-body' },
  { id: 'pilates', name: 'Pilates', met: 3.0, category: 'Mind-body' },
  { id: 'strength', name: 'Strength training', met: 5.0, category: 'Strength' },
  { id: 'hiit', name: 'HIIT', met: 8.0, category: 'Cardio' },
  { id: 'hiking', name: 'Hiking', met: 6.0, category: 'Outdoors' },
  { id: 'dance', name: 'Dance', met: 5.0, category: 'Recreation' },
  { id: 'basketball', name: 'Basketball', met: 6.5, category: 'Sports' },
  { id: 'soccer', name: 'Soccer', met: 7.0, category: 'Sports' },
  { id: 'tennis', name: 'Tennis', met: 7.3, category: 'Sports' },
  { id: 'stair-climbing', name: 'Stair climbing', met: 8.8, category: 'Cardio' },
  { id: 'jump-rope', name: 'Jump rope', met: 11.0, category: 'Cardio' },
  { id: 'household', name: 'Household chores', met: 3.0, category: 'Daily' },
  { id: 'stretching', name: 'Stretching', met: 2.3, category: 'Mind-body' },
  { id: 'standing-desk', name: 'Standing desk', met: 1.5, category: 'Daily' },
  { id: 'gardening', name: 'Gardening', met: 3.8, category: 'Daily' },
  { id: 'aerobics', name: 'Aerobics', met: 6.5, category: 'Cardio' },
  { id: 'boxing', name: 'Boxing', met: 7.8, category: 'Sports' },
  { id: 'volleyball', name: 'Volleyball', met: 4.0, category: 'Sports' },
  { id: 'golf', name: 'Golf (walking)', met: 4.3, category: 'Sports' },
  { id: 'skateboard', name: 'Skateboarding', met: 5.0, category: 'Recreation' },
  { id: 'martial-arts', name: 'Martial arts', met: 10.3, category: 'Sports' }
]

/** Fuzzy preset lookup: exact id/name, then includes match on lowercased name. */
export function findPreset(name: string): ExercisePreset | null {
  const q = name.trim().toLowerCase()
  if (!q) return null
  const exact = PRESETS.find(
    (p) => p.id.toLowerCase() === q || p.name.toLowerCase() === q
  )
  if (exact) return exact
  const includes = PRESETS.find(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      q.includes(p.name.toLowerCase()) ||
      p.id.toLowerCase().includes(q)
  )
  return includes ?? null
}

/** Standard MET calorie formula; rounds to nearest kcal, min 0. */
export function estimateExerciseKcal(opts: {
  met: number
  weightKg: number
  minutes: number
}): number {
  const { met, weightKg, minutes } = opts
  if (!Number.isFinite(met) || !Number.isFinite(weightKg) || !Number.isFinite(minutes)) {
    return 0
  }
  if (met <= 0 || weightKg <= 0 || minutes <= 0) return 0
  return Math.max(0, Math.round(met * weightKg * (minutes / 60)))
}

/**
 * Resolve MET from activity name via preset match, then keyword heuristics.
 * Returns null when unknown (caller may leave kcal manual / 0).
 */
export function resolveMetFromName(name: string): number | null {
  const preset = findPreset(name)
  if (preset) return preset.met

  const q = name.trim().toLowerCase()
  if (!q) return null

  if (/\b(walk|walking|stroll)\b/.test(q)) return 3.5
  if (/\b(run|running|jog|jogging)\b/.test(q)) return 9.8
  if (/\b(cycle|cycling|bike|biking|bicycle)\b/.test(q)) return 6.8
  if (/\b(swim|swimming)\b/.test(q)) return 7
  if (/\b(yoga)\b/.test(q)) return 2.5
  if (/\b(weight|strength|gym|lift|lifting)\b/.test(q)) return 5
  if (/\b(hiit|interval)\b/.test(q)) return 8
  if (/\b(hike|hiking)\b/.test(q)) return 6
  if (/\b(row|rowing)\b/.test(q)) return 7
  if (/\b(ellipti)\b/.test(q)) return 5
  if (/\b(pilates)\b/.test(q)) return 3
  if (/\b(dance|dancing)\b/.test(q)) return 5
  if (/\b(stair)\b/.test(q)) return 8.8
  if (/\b(jump.?rope|skipping)\b/.test(q)) return 11
  if (/\b(stretch)\b/.test(q)) return 2.3
  if (/\b(basketball)\b/.test(q)) return 6.5
  if (/\b(soccer|football)\b/.test(q)) return 7
  if (/\b(tennis)\b/.test(q)) return 7.3

  return null
}