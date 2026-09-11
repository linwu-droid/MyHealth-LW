/**
 * Health profile: allergen catalog, text extraction, food matching, recommendations.
 * Shared by main + renderer (diary red flags).
 */

import type {
  HealthItemKind,
  HealthProfile,
  HealthRestriction
} from './types'

export type { HealthItemKind, HealthProfile, HealthRestriction }

export interface AllergenPreset {
  /** Stable slug used as restriction id when toggling presets. */
  id: string
  label: string
  kind: HealthItemKind
  aliases: string[]
  prefer: string[]
  avoid: string[]
}

export interface ExtractCandidate {
  presetId?: string
  label: string
  kind: HealthItemKind
  aliases: string[]
  matchedTerms: string[]
  confidence: 'high' | 'medium'
}

export interface FoodMatchHit {
  label: string
  kind: HealthItemKind
  matchedAlias: string
}

export interface DiaryRedFlag {
  entryId: string
  entryName: string
  hits: FoodMatchHit[]
}

export function emptyHealthProfile(): HealthProfile {
  return {
    restrictions: [],
    notes: '',
    reportExcerpt: '',
    avoidKeywords: [],
    preferKeywords: [],
    updatedAt: undefined
  }
}

export function ensureHealthProfileShape(raw: unknown): HealthProfile {
  const base = emptyHealthProfile()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<HealthProfile>
  const restrictions = Array.isArray(o.restrictions)
    ? o.restrictions
        .filter((r): r is HealthRestriction => !!r && typeof r === 'object' && typeof (r as HealthRestriction).id === 'string')
        .map((r) => ({
          id: String(r.id),
          label: String(r.label || '').trim() || 'Item',
          kind: normalizeKind(r.kind),
          aliases: Array.isArray(r.aliases)
            ? r.aliases.map((a) => String(a).trim()).filter(Boolean)
            : undefined,
          source: r.source === 'report' || r.source === 'manual' ? r.source : undefined,
          notes: r.notes != null ? String(r.notes) : undefined,
          enabled: r.enabled === false ? false : true
        }))
    : []
  return {
    restrictions,
    notes: o.notes != null ? String(o.notes) : '',
    reportExcerpt: o.reportExcerpt != null ? String(o.reportExcerpt) : '',
    avoidKeywords: Array.isArray(o.avoidKeywords)
      ? o.avoidKeywords.map((k) => String(k).trim()).filter(Boolean)
      : [],
    preferKeywords: Array.isArray(o.preferKeywords)
      ? o.preferKeywords.map((k) => String(k).trim()).filter(Boolean)
      : [],
    updatedAt: o.updatedAt != null ? String(o.updatedAt) : undefined
  }
}

function normalizeKind(k: unknown): HealthItemKind {
  if (k === 'allergy' || k === 'intolerance' || k === 'restriction' || k === 'other') return k
  return 'other'
}

/** Curated common allergens / intolerances / diet restrictions (AU-friendly wording). */
export const ALLERGEN_PRESETS: AllergenPreset[] = [
  {
    id: 'peanut',
    label: 'Peanut',
    kind: 'allergy',
    aliases: ['peanut', 'peanuts', 'peanut butter', 'arachis', 'groundnut', 'groundnuts'],
    prefer: ['sunflower butter', 'tahini (if sesame OK)', 'soy butter (if soy OK)', 'seeds'],
    avoid: ['peanuts', 'peanut butter', 'satay', 'mixed nuts with peanut', 'some Asian sauces']
  },
  {
    id: 'tree-nut',
    label: 'Tree nut',
    kind: 'allergy',
    aliases: [
      'tree nut',
      'tree nuts',
      'almond',
      'almonds',
      'cashew',
      'cashews',
      'walnut',
      'walnuts',
      'hazelnut',
      'hazelnuts',
      'pistachio',
      'pistachios',
      'pecan',
      'pecans',
      'brazil nut',
      'macadamia',
      'macadamias'
    ],
    prefer: ['seeds (pumpkin, sunflower)', 'legumes (if OK)', 'oats'],
    avoid: ['almonds', 'cashews', 'walnuts', 'hazelnuts', 'pistachios', 'nut milks', 'pesto with nuts', 'praline']
  },
  {
    id: 'dairy',
    label: 'Dairy / milk / lactose',
    kind: 'intolerance',
    aliases: [
      'dairy',
      'milk',
      'lactose',
      'cow milk',
      'cows milk',
      'casein',
      'whey',
      'cheese',
      'butter',
      'cream',
      'yoghurt',
      'yogurt',
      'milk protein'
    ],
    prefer: ['lactose-free milk', 'oat milk', 'almond milk (if nuts OK)', 'soy milk (if soy OK)', 'coconut yoghurt'],
    avoid: ['milk', 'cheese', 'butter', 'cream', 'yoghurt', 'ice cream', 'whey protein', 'milk chocolate']
  },
  {
    id: 'egg',
    label: 'Egg',
    kind: 'allergy',
    aliases: ['egg', 'eggs', 'egg white', 'egg yolk', 'albumin', 'mayonnaise'],
    prefer: ['egg-free baking mixes', 'flax “egg”', 'chia gel', 'tofu scramble (if soy OK)'],
    avoid: ['eggs', 'mayonnaise', 'meringue', 'some baked goods', 'egg noodles']
  },
  {
    id: 'gluten',
    label: 'Gluten / wheat',
    kind: 'intolerance',
    aliases: [
      'gluten',
      'wheat',
      'barley',
      'rye',
      'coeliac',
      'celiac',
      'wheat flour',
      'semolina',
      'spelt',
      'triticale'
    ],
    prefer: ['rice', 'quinoa', 'corn', 'buckwheat', 'gluten-free oats', 'potato', 'GF bread'],
    avoid: ['bread', 'pasta', 'wheat flour', 'couscous', 'beer', 'many sauces with wheat']
  },
  {
    id: 'soy',
    label: 'Soy',
    kind: 'allergy',
    aliases: ['soy', 'soya', 'soybean', 'soybeans', 'edamame', 'tofu', 'tempeh', 'soy sauce', 'lecithin'],
    prefer: ['rice', 'quinoa', 'coconut aminos', 'chickpeas (if OK)', 'pea protein'],
    avoid: ['tofu', 'soy milk', 'edamame', 'soy sauce', 'miso', 'tempeh', 'many processed foods']
  },
  {
    id: 'fish',
    label: 'Fish',
    kind: 'allergy',
    aliases: [
      'fish',
      'salmon',
      'tuna',
      'cod',
      'haddock',
      'sardine',
      'anchovy',
      'anchovies',
      'fish sauce',
      'worcestershire'
    ],
    prefer: ['poultry', 'legumes', 'eggs (if OK)', 'tofu (if soy OK)'],
    avoid: ['salmon', 'tuna', 'fish sauce', 'caesar dressing', 'anchovy paste', 'fish oil']
  },
  {
    id: 'shellfish',
    label: 'Shellfish',
    kind: 'allergy',
    aliases: [
      'shellfish',
      'crustacean',
      'crustaceans',
      'prawn',
      'prawns',
      'shrimp',
      'crab',
      'lobster',
      'crayfish',
      'mollusc',
      'molluscs',
      'mussel',
      'mussels',
      'oyster',
      'oysters',
      'scallop',
      'scallops',
      'clam',
      'clams'
    ],
    prefer: ['poultry', 'beef', 'legumes', 'eggs (if OK)'],
    avoid: ['prawns', 'shrimp', 'crab', 'lobster', 'mussels', 'oysters', 'seafood sauce']
  },
  {
    id: 'sesame',
    label: 'Sesame',
    kind: 'allergy',
    aliases: ['sesame', 'sesame seed', 'sesame seeds', 'tahini', 'hummus', 'halvah', 'sesame oil'],
    prefer: ['sunflower seeds', 'pumpkin seeds', 'nut butters (if nuts OK)'],
    avoid: ['sesame seeds', 'tahini', 'hummus', 'some breads', 'Asian sesame oils']
  },
  {
    id: 'sulphites',
    label: 'Sulphites',
    kind: 'intolerance',
    aliases: [
      'sulphite',
      'sulphites',
      'sulfite',
      'sulfites',
      'sulphur dioxide',
      'sulfur dioxide',
      'e220',
      'e221',
      'e222',
      'e223',
      'e224',
      'e225',
      'e226',
      'e227',
      'e228'
    ],
    prefer: ['fresh fruit/veg', 'unsulphured dried fruit', 'fresh meat'],
    avoid: ['dried fruit with sulphites', 'wine', 'some processed meats', 'pickled foods']
  },
  {
    id: 'mustard',
    label: 'Mustard',
    kind: 'allergy',
    aliases: ['mustard', 'mustard seed', 'mustard seeds', 'dijon'],
    prefer: ['vinegar-based dressings without mustard', 'herbs'],
    avoid: ['mustard', 'dijon', 'many vinaigrettes', 'some sausages']
  },
  {
    id: 'celery',
    label: 'Celery',
    kind: 'allergy',
    aliases: ['celery', 'celeriac', 'celery salt', 'celery seed'],
    prefer: ['other crunchy veg (carrot, cucumber)', 'fresh herbs'],
    avoid: ['celery', 'celeriac', 'stock cubes with celery', 'some soups']
  },
  {
    id: 'lupin',
    label: 'Lupin',
    kind: 'allergy',
    aliases: ['lupin', 'lupine', 'lupini'],
    prefer: ['other legumes if tolerated', 'grains'],
    avoid: ['lupin flour', 'some GF baked goods', 'lupini beans']
  },
  {
    id: 'corn',
    label: 'Corn / maize',
    kind: 'intolerance',
    aliases: ['corn', 'maize', 'cornflour', 'cornstarch', 'polenta', 'corn syrup'],
    prefer: ['rice', 'potato', 'oats (if OK)', 'wheat (if OK)'],
    avoid: ['corn chips', 'polenta', 'cornflour sauces', 'many processed snacks']
  },
  {
    id: 'nightshade',
    label: 'Nightshades',
    kind: 'restriction',
    aliases: [
      'nightshade',
      'nightshades',
      'tomato',
      'tomatoes',
      'potato',
      'potatoes',
      'eggplant',
      'aubergine',
      'capsicum',
      'pepper',
      'peppers',
      'paprika'
    ],
    prefer: ['sweet potato', 'carrot', 'pumpkin', 'leafy greens', 'rice'],
    avoid: ['tomato', 'potato', 'eggplant', 'capsicum', 'chilli', 'paprika']
  },
  {
    id: 'fodmap',
    label: 'Low FODMAP (high-FODMAP avoid)',
    kind: 'restriction',
    aliases: ['fodmap', 'ibs', 'fructan', 'fructose', 'polyol', 'galactan'],
    prefer: ['ripe banana', 'carrot', 'zucchini', 'rice', 'oats', 'firm tofu', 'lactose-free dairy'],
    avoid: ['onion', 'garlic', 'wheat in large serves', 'apple', 'pear', 'beans', 'cauliflower']
  }
]

const PRESET_BY_ID = new Map(ALLERGEN_PRESETS.map((p) => [p.id, p]))

export function getPreset(id: string): AllergenPreset | undefined {
  return PRESET_BY_ID.get(id)
}

/** Escape for RegExp literal. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Case-insensitive match preferring word boundaries / multi-word phrases.
 * Longer aliases are tried first to avoid partial short hits when a longer phrase exists.
 */
export function textMatchesAlias(haystack: string, alias: string): boolean {
  const a = alias.trim()
  if (!a || !haystack) return false
  const text = haystack.toLowerCase()
  const needle = a.toLowerCase()
  if (needle.includes(' ')) {
    // Multi-word: require contiguous phrase with non-letter boundaries
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(needle)}(?:$|[^a-z0-9])`, 'i')
    return re.test(text)
  }
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(needle)}(?:$|[^a-z0-9])`, 'i')
  return re.test(text)
}

export function collectAvoidAliases(profile: HealthProfile): { label: string; kind: HealthItemKind; alias: string }[] {
  const out: { label: string; kind: HealthItemKind; alias: string }[] = []
  const seen = new Set<string>()
  for (const r of profile.restrictions) {
    if (r.enabled === false) continue
    const aliases = [
      r.label,
      ...(r.aliases ?? []),
      ...(getPreset(r.id)?.aliases ?? [])
    ]
    for (const raw of aliases) {
      const alias = raw.trim()
      if (!alias) continue
      const key = `${r.id}::${alias.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ label: r.label, kind: r.kind, alias })
    }
  }
  for (const k of profile.avoidKeywords ?? []) {
    const alias = k.trim()
    if (!alias) continue
    const key = `custom::${alias.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label: alias, kind: 'other', alias })
  }
  // Longer aliases first so "peanut butter" wins over "butter" when both apply to dairy+peanut etc.
  out.sort((a, b) => b.alias.length - a.alias.length)
  return out
}

export function matchFoodAgainstProfile(
  foodName: string,
  brand: string | undefined,
  profile: HealthProfile
): FoodMatchHit[] {
  const hay = `${foodName} ${brand ?? ''}`.trim()
  if (!hay) return []
  const hits: FoodMatchHit[] = []
  const hitLabels = new Set<string>()
  for (const row of collectAvoidAliases(profile)) {
    if (!textMatchesAlias(hay, row.alias)) continue
    if (hitLabels.has(row.label.toLowerCase())) continue
    hitLabels.add(row.label.toLowerCase())
    hits.push({ label: row.label, kind: row.kind, matchedAlias: row.alias })
  }
  return hits
}

export function flagDiaryEntries(
  entries: { id: string; name: string; foodId?: string }[],
  foodsById: Map<string, { name: string; brand?: string }>,
  profile: HealthProfile
): DiaryRedFlag[] {
  const flags: DiaryRedFlag[] = []
  for (const e of entries) {
    const food = e.foodId ? foodsById.get(e.foodId) : undefined
    const brand = food?.brand
    const hits = matchFoodAgainstProfile(e.name, brand, profile)
    if (hits.length) flags.push({ entryId: e.id, entryName: e.name, hits })
  }
  return flags
}

export function recommendationsForProfile(profile: HealthProfile): {
  prefer: { from: string; items: string[] }[]
  avoid: { from: string; items: string[] }[]
} {
  const prefer: { from: string; items: string[] }[] = []
  const avoid: { from: string; items: string[] }[] = []
  for (const r of profile.restrictions) {
    if (r.enabled === false) continue
    const preset = getPreset(r.id)
    if (preset) {
      if (preset.prefer.length) prefer.push({ from: r.label, items: [...preset.prefer] })
      if (preset.avoid.length) avoid.push({ from: r.label, items: [...preset.avoid] })
    } else {
      const aliases = r.aliases?.length ? r.aliases : [r.label]
      avoid.push({ from: r.label, items: aliases })
    }
  }
  if ((profile.preferKeywords ?? []).length) {
    prefer.push({ from: 'Custom prefer', items: [...(profile.preferKeywords ?? [])] })
  }
  if ((profile.avoidKeywords ?? []).length) {
    avoid.push({ from: 'Custom avoid', items: [...(profile.avoidKeywords ?? [])] })
  }
  return { prefer, avoid }
}

/** Heuristic allergen extraction from free text / report paste. */
export function extractAllergenCandidates(text: string): ExtractCandidate[] {
  const raw = (text || '').trim()
  if (!raw) return []
  const lower = raw.toLowerCase()
  const candidates: ExtractCandidate[] = []
  const foundIds = new Set<string>()

  for (const preset of ALLERGEN_PRESETS) {
    const matched: string[] = []
    // Sort aliases longest-first
    const aliases = [...preset.aliases].sort((a, b) => b.length - a.length)
    for (const alias of aliases) {
      if (textMatchesAlias(lower, alias)) matched.push(alias)
    }
    if (matched.length === 0) continue
    foundIds.add(preset.id)
    // High if near allergy/intolerance/avoid language, else medium
    const nearCue = new RegExp(
      `(?:allerg(?:y|ic|ies)|intoleran|avoid|sensitive|sensitivity|reaction|anaphyla|do not|cannot|can't).{0,40}${escapeRe(matched[0])}|${escapeRe(matched[0])}.{0,40}(?:allerg(?:y|ic|ies)|intoleran|avoid|sensitive|reaction)`,
      'i'
    )
    const confidence: 'high' | 'medium' = nearCue.test(raw) ? 'high' : 'medium'
    candidates.push({
      presetId: preset.id,
      label: preset.label,
      kind: preset.kind,
      aliases: [...preset.aliases],
      matchedTerms: [...new Set(matched)],
      confidence
    })
  }

  // Free-form "Allergic to X" / "Allergy: X" lines not covered by presets
  const freePatterns = [
    /allerg(?:y|ic)\s*(?:to|:)\s*([a-z0-9][a-z0-9\s\-\/]{1,40})/gi,
    /intoleran(?:t|ce)\s*(?:to|:)\s*([a-z0-9][a-z0-9\s\-\/]{1,40})/gi,
    /avoid\s*:?\s*([a-z0-9][a-z0-9\s\-\/,]{1,60})/gi
  ]
  for (const re of freePatterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      const chunk = m[1].split(/[,;.]/)[0].trim().replace(/\s+/g, ' ')
      if (chunk.length < 2 || chunk.length > 40) continue
      // Skip if already covered by a preset match on same text
      const covered = ALLERGEN_PRESETS.some(
        (p) => foundIds.has(p.id) && p.aliases.some((a) => textMatchesAlias(chunk, a) || textMatchesAlias(a, chunk))
      )
      if (covered) continue
      const id = `custom-${chunk.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
      if (foundIds.has(id)) continue
      foundIds.add(id)
      candidates.push({
        label: chunk.replace(/\b\w/g, (c) => c.toUpperCase()),
        kind: /intoleran/i.test(m[0]) ? 'intolerance' : /avoid/i.test(m[0]) ? 'restriction' : 'allergy',
        aliases: [chunk.toLowerCase()],
        matchedTerms: [chunk],
        confidence: 'medium'
      })
    }
  }

  candidates.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1
    return a.label.localeCompare(b.label)
  })
  return candidates
}

export const HEALTH_DISCLAIMER =
  'Not medical advice. Recommendations are general food suggestions based on your profile. Confirm with a clinician or dietitian before changing your diet, especially for allergies.'
