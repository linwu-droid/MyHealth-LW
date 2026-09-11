export type PortionUnit = 'servings' | 'g' | 'kg' | 'each'

/**
 * Parse grams from servingLabel e.g. "100 g", "1 egg (50 g)", "1 cup (195 g)", "28 g (about 23)".
 * Returns null when no gram amount is found (e.g. "250 ml", "1 serving").
 */
export function parseServingGrams(servingLabel: string): number | null {
  if (!servingLabel || typeof servingLabel !== 'string') return null
  const m = servingLabel.match(/(\d+(?:\.\d+)?)\s*g\b/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Convert user amount+unit into serving multiplier relative to Food macros. */
export function portionToServingQty(opts: {
  amount: number
  unit: PortionUnit
  servingLabel: string
}): { qty: number; error?: string } {
  const amount = Number(opts.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { qty: 1, error: 'Amount must be greater than 0' }
  }
  const unit = opts.unit

  if (unit === 'servings' || unit === 'each') {
    return { qty: amount }
  }

  const grams = parseServingGrams(opts.servingLabel)
  if (grams == null || grams <= 0) {
    return {
      qty: 1,
      error: 'This food has no gram weight in its serving label. Use servings or each instead.'
    }
  }

  if (unit === 'g') {
    return { qty: amount / grams }
  }
  if (unit === 'kg') {
    return { qty: (amount * 1000) / grams }
  }

  return { qty: amount }
}

/** Display label for a logged portion, e.g. "1.5 servings", "150 g", "0.5 kg", "2 each". */
export function formatPortion(amount: number, unit: PortionUnit): string {
  const n = Number(amount)
  const pretty = Number.isFinite(n)
    ? String(Math.round(n * 100) / 100).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
    : String(amount)
  if (unit === 'servings') return `${pretty} servings`
  if (unit === 'g') return `${pretty} g`
  if (unit === 'kg') return `${pretty} kg`
  if (unit === 'each') return `${pretty} each`
  return `${pretty} ${unit}`
}