export function selectByXPath(html: string, xpath: string): string[] {
  if (!xpath) return []

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const result = document.evaluate(xpath, doc, null, XPathResult.ANY_TYPE, null)
    const nodes: string[] = []
    let node: Node | null = result.iterateNext()
    while (node) {
      if (node.nodeType === Node.ATTRIBUTE_NODE) {
        nodes.push((node as Attr).value)
      } else {
        nodes.push(node.textContent ?? '')
      }
      node = result.iterateNext()
    }
    return nodes
  } catch {
    return []
  }
}
