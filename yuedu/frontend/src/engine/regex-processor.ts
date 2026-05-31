export function applyRegex(input: string, pattern: string, replacement: string): string {
  if (!pattern) return input

  try {
    const regex = new RegExp(pattern, 'g')
    return input.replace(regex, replacement)
  } catch {
    return input
  }
}
