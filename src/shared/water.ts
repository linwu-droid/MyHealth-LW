/**
 * Water intake helpers for MyHealth L.W.
 * Adult rule of thumb: ~35 ml per kg body weight, clamped to a sensible band.
 */
export const WATER_DEFAULT_ML = 2000
export const WATER_MIN_ML = 1500
export const WATER_MAX_ML = 4000
export const WATER_ML_PER_KG = 35

/** Recommended daily water (ml) from latest weight; 2000 if no weight. */
export function recommendWaterMl(weightKg: number | null | undefined): number {
  if (weightKg == null || !(weightKg > 0)) return WATER_DEFAULT_ML
  const raw = weightKg * WATER_ML_PER_KG
  return Math.round(Math.max(WATER_MIN_ML, Math.min(WATER_MAX_ML, raw)))
}

/** Round to nearest step (default 50 ml) for display / custom input. */
export function roundMl(n: number, step = 50): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n / step) * step
}

export function formatMl(n: number): string {
  const v = Math.round(n)
  if (v >= 1000) {
    const L = Math.round((v / 1000) * 100) / 100
    return `${L} L`
  }
  return `${v} ml`
}

export function formatMlExact(n: number): string {
  return `${Math.round(n)} ml`
}

/** Progress 0–100 toward daily goal (clamped). */
export function waterProgressPct(totalMl: number, goalMl: number): number {
  if (!goalMl || goalMl <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((totalMl / goalMl) * 100)))
}

export type WaterTipKind = 'under' | 'ok' | 'over'

export function waterTip(totalMl: number, goalMl: number): { kind: WaterTipKind; message: string } {
  if (goalMl <= 0) {
    return { kind: 'ok', message: 'Set a water goal in Settings to track progress.' }
  }
  const pct = (totalMl / goalMl) * 100
  if (pct < 70) {
    return {
      kind: 'under',
      message: `You're under your water goal (${formatMlExact(totalMl)} of ${formatMlExact(goalMl)}). Try sipping regularly through the day.`
    }
  }
  if (pct > 130) {
    return {
      kind: 'over',
      message: `You've logged well above your goal (${formatMlExact(totalMl)} of ${formatMlExact(goalMl)}). That's fine if active or hot — otherwise ease off.`
    }
  }
  return {
    kind: 'ok',
    message: `On track for water — ${formatMlExact(totalMl)} of ${formatMlExact(goalMl)} (${Math.round(pct)}%).`
  }
}