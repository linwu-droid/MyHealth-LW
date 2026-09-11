export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function kgToLb(kg: number): number {
  return kg * 2.2046226218
}

export function lbToKg(lb: number): number {
  return lb / 2.2046226218
}

export function formatWeight(kg: number, unit: 'kg' | 'lb'): string {
  if (unit === 'lb') return `${kgToLb(kg).toFixed(1)} lb`
  return `${kg.toFixed(1)} kg`
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
