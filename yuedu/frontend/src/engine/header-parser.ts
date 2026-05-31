export function parseHeader(raw: string): Record<string, string> {
  if (!raw) return {}

  if (typeof raw !== 'string') return raw as any

  try {
    return JSON.parse(raw)
  } catch {}

  try {
    const normalized = raw
      .replace(/'/g, '"')
      .replace(/(\w+):/g, '"$1":')
    return JSON.parse(normalized)
  } catch {}

  return {}
}
