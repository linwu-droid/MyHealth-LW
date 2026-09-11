/**
 * Weight / BMI helpers for MyHealth L.W.
 * Healthy adult BMI band 18.5–24.9 (WHO). Midpoint ~22 used as a single "recommended" figure.
 */
export type SexOption = 'female' | 'male' | 'other' | ''

export function bmi(kg: number, heightCm: number): number | null {
  if (!kg || !heightCm || heightCm < 50) return null
  const m = heightCm / 100
  return kg / (m * m)
}

export function bmiCategory(bmiVal: number): string {
  if (bmiVal < 18.5) return 'Underweight'
  if (bmiVal < 25) return 'Healthy range'
  if (bmiVal < 30) return 'Overweight'
  return 'Obese'
}

/** Healthy weight band (kg) for a given height from BMI 18.5–24.9. */
export function healthyWeightRangeKg(heightCm: number): { min: number; max: number } | null {
  if (!heightCm || heightCm < 50) return null
  const m = heightCm / 100
  const m2 = m * m
  return {
    min: round1(18.5 * m2),
    max: round1(24.9 * m2)
  }
}

/** Single recommended weight (kg) at BMI 22. */
export function recommendedWeightKg(heightCm: number): number | null {
  if (!heightCm || heightCm < 50) return null
  const m = heightCm / 100
  return round1(22 * m * m)
}

/**
 * Classic Devine ideal body weight (kg). Optional sex-based reference.
 * Female: 45.5 + 2.3 per inch over 5 ft; Male: 50 + 2.3 per inch over 5 ft.
 */
export function idealBodyWeightKg(heightCm: number, sex: SexOption): number | null {
  if (!heightCm || heightCm < 50) return null
  const inches = heightCm / 2.54
  const over5ft = Math.max(0, inches - 60)
  if (sex === 'female') return round1(45.5 + 2.3 * over5ft)
  if (sex === 'male') return round1(50 + 2.3 * over5ft)
  // Neutral: average of male/female Devine
  return round1((45.5 + 50) / 2 + 2.3 * over5ft)
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function kgDeltaToGoal(currentKg: number, goalKg: number): number {
  return round1(currentKg - goalKg)
}

/** Progress 0–100 from start toward goal (clamped). */
export function goalProgressPct(currentKg: number, startKg: number, goalKg: number): number | null {
  const total = startKg - goalKg
  if (Math.abs(total) < 0.05) return currentKg === goalKg ? 100 : null
  const done = startKg - currentKg
  const pct = (done / total) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}
