/** Mineral tracking keys (amounts in mg unless noted). */
export const MINERAL_KEYS = [
  'sodium',
  'potassium',
  'calcium',
  'magnesium',
  'phosphorus',
  'iron',
  'zinc',
  'copper',
  'manganese',
  'selenium',
  'iodine'
] as const

export type MineralKey = (typeof MINERAL_KEYS)[number]

export type MineralMap = Partial<Record<MineralKey, number>>

export const MINERAL_META: Record<
  MineralKey,
  { label: string; unit: 'mg' | 'µg'; short: string }
> = {
  sodium: { label: 'Sodium', unit: 'mg', short: 'Na' },
  potassium: { label: 'Potassium', unit: 'mg', short: 'K' },
  calcium: { label: 'Calcium', unit: 'mg', short: 'Ca' },
  magnesium: { label: 'Magnesium', unit: 'mg', short: 'Mg' },
  phosphorus: { label: 'Phosphorus', unit: 'mg', short: 'P' },
  iron: { label: 'Iron', unit: 'mg', short: 'Fe' },
  zinc: { label: 'Zinc', unit: 'mg', short: 'Zn' },
  copper: { label: 'Copper', unit: 'mg', short: 'Cu' },
  manganese: { label: 'Manganese', unit: 'mg', short: 'Mn' },
  selenium: { label: 'Selenium', unit: 'µg', short: 'Se' },
  iodine: { label: 'Iodine', unit: 'µg', short: 'I' }
}

/**
 * Sensible adult daily mineral goals (AU/NZ NRV / WHO-ish defaults).
 * Sodium uses the ~2000 mg suggested dietary target (not the lower AI).
 * Iron/zinc are mid-range adult values (women often need more iron).
 */
export function defaultMineralGoals(): Record<MineralKey, number> {
  return {
    sodium: 2000,
    potassium: 3500,
    calcium: 1000,
    magnesium: 350,
    phosphorus: 1000,
    iron: 11,
    zinc: 11,
    copper: 1.7,
    manganese: 5,
    selenium: 70,
    iodine: 150
  }
}

export function roundMineral(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (Math.abs(n) >= 100) return Math.round(n)
  if (Math.abs(n) >= 10) return Math.round(n * 10) / 10
  return Math.round(n * 100) / 100
}

/** Scale mineral amounts by serving quantity; omit empty maps. */
export function scaleMinerals(src: MineralMap | undefined, qty: number): MineralMap | undefined {
  if (!src || !Number.isFinite(qty) || qty === 0) return undefined
  const out: MineralMap = {}
  let any = false
  for (const key of MINERAL_KEYS) {
    const v = src[key]
    if (v === undefined || v === null || !Number.isFinite(v)) continue
    out[key] = roundMineral(v * qty)
    any = true
  }
  return any ? out : undefined
}

export function addMinerals(a: MineralMap | undefined, b: MineralMap | undefined): MineralMap {
  const out: MineralMap = {}
  for (const key of MINERAL_KEYS) {
    const av = a?.[key]
    const bv = b?.[key]
    if (av === undefined && bv === undefined) continue
    out[key] = roundMineral((av ?? 0) + (bv ?? 0))
  }
  return out
}

export function scaleMineralMap(m: MineralMap, factor: number): MineralMap {
  const out: MineralMap = {}
  for (const key of MINERAL_KEYS) {
    const v = m[key]
    if (v === undefined) continue
    out[key] = roundMineral(v * factor)
  }
  return out
}

/** True if the map has at least one finite mineral value. */
export function hasAnyMineral(m: MineralMap | undefined): boolean {
  if (!m) return false
  return MINERAL_KEYS.some((k) => {
    const v = m[k]
    return v !== undefined && v !== null && Number.isFinite(v)
  })
}

/** Keep only finite mineral values from a partial input. */
export function normalizeMinerals(input: unknown): MineralMap | undefined {
  if (!input || typeof input !== 'object') return undefined
  const src = input as Record<string, unknown>
  const out: MineralMap = {}
  let any = false
  for (const key of MINERAL_KEYS) {
    const raw = src[key]
    if (raw === undefined || raw === null || raw === '') continue
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) continue
    out[key] = roundMineral(n)
    any = true
  }
  return any ? out : undefined
}
