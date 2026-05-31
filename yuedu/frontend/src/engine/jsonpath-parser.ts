import { JSONPath } from 'jsonpath-plus'

export function selectByJSONPath(json: any, path: string): any[] {
  if (!path) return []

  try {
    return JSONPath({ path, json })
  } catch {
    return []
  }
}
