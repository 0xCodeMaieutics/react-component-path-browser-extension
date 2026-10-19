/**
 * A small JSX scanner: given the position of an element's opening `<`, find
 * where the element ends. It understands strings, template literals, comments,
 * braces, and JSX nested inside expressions, which is enough for real
 * component code without shipping a full parser. Returns -1 when unsure.
 */

const NAME_CHAR = /[\w$.:-]/
const JSX_AFTER = new Set(["(", ",", "?", ":", "=", "&", "|", "{", "[", "!", ";", ">", "}", ""])
const MAX_DEPTH = 200

function skipString(source: string, index: number): number {
  const quote = source[index]
  for (let i = index + 1; i < source.length; i++) {
    const char = source[i]
    if (char === "\\") i++
    else if (char === quote) return i + 1
    else if (char === "\n") return i
  }
  return -1
}

function skipTemplate(source: string, index: number, depth: number): number {
  for (let i = index + 1; i < source.length; i++) {
    const char = source[i]
    if (char === "\\") i++
    else if (char === "`") return i + 1
    else if (char === "$" && source[i + 1] === "{") {
      i = skipBraces(source, i + 1, depth + 1)
      if (i < 0) return -1
      i--
    }
  }
  return -1
}

function skipComment(source: string, index: number): number {
  if (source[index + 1] === "/") {
    const end = source.indexOf("\n", index)
    return end < 0 ? source.length : end
  }
  const end = source.indexOf("*/", index + 2)
  return end < 0 ? -1 : end + 2
}

function previousSignificant(source: string, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (!/\s/.test(source[i]!)) {
      const word = /(?:^|[^\w$])(?:return|yield|default|case|await)$/.exec(source.slice(Math.max(0, i - 8), i + 1))
      return word ? "(" : source[i]!
    }
  }
  return ""
}

function startsJsx(source: string, index: number): boolean {
  const next = source[index + 1] ?? ""
  return (next === ">" || /[A-Za-z_$]/.test(next)) && JSX_AFTER.has(previousSignificant(source, index))
}

/** `index` points at `{`; returns the index after the matching `}`. */
function skipBraces(source: string, index: number, depth: number): number {
  if (depth > MAX_DEPTH) return -1
  let nesting = 0
  for (let i = index; i < source.length; i++) {
    const char = source[i]
    if (char === "'" || char === '"') {
      i = skipString(source, i)
      if (i < 0) return -1
      i--
    } else if (char === "`") {
      i = skipTemplate(source, i, depth)
      if (i < 0) return -1
      i--
    } else if (char === "/" && (source[i + 1] === "/" || source[i + 1] === "*")) {
      i = skipComment(source, i)
      if (i < 0) return -1
      i--
    } else if (char === "<" && startsJsx(source, i)) {
      i = scanElement(source, i, depth + 1)
      if (i < 0) return -1
      i--
    } else if (char === "{") {
      nesting++
    } else if (char === "}") {
      nesting--
      if (nesting === 0) return i + 1
    }
  }
  return -1
}

function scanChildren(source: string, index: number, depth: number): number {
  for (let i = index; i < source.length; i++) {
    const char = source[i]
    if (char === "<") {
      if (source[i + 1] === "/") {
        const end = source.indexOf(">", i)
        return end < 0 ? -1 : end + 1
      }
      i = scanElement(source, i, depth + 1)
      if (i < 0) return -1
      i--
    } else if (char === "{") {
      i = skipBraces(source, i, depth + 1)
      if (i < 0) return -1
      i--
    }
  }
  return -1
}

/** `index` points at `<`; returns the index after the element's end. */
function scanElement(source: string, index: number, depth: number): number {
  if (depth > MAX_DEPTH) return -1
  let i = index + 1
  while (/\s/.test(source[i] ?? "")) i++
  if (source[i] === ">") return scanChildren(source, i + 1, depth)
  if (!NAME_CHAR.test(source[i] ?? "")) return -1
  while (NAME_CHAR.test(source[i] ?? "")) i++

  for (; i < source.length; i++) {
    const char = source[i]
    if (char === "/" && source[i + 1] === ">") return i + 2
    if (char === "/" && (source[i + 1] === "/" || source[i + 1] === "*")) {
      i = skipComment(source, i)
      if (i < 0) return -1
      i--
    } else if (char === ">") {
      return scanChildren(source, i + 1, depth)
    } else if (char === "{") {
      i = skipBraces(source, i, depth + 1)
      if (i < 0) return -1
      i--
    } else if (char === "'" || char === '"') {
      i = skipString(source, i)
      if (i < 0) return -1
      i--
    } else if (char === "<") {
      i = scanElement(source, i, depth + 1)
      if (i < 0) return -1
      i--
    }
  }
  return -1
}

function offsetOf(source: string, line: number, column: number): number {
  let offset = 0
  for (let current = 1; current < line; current++) {
    const next = source.indexOf("\n", offset)
    if (next < 0) return -1
    offset = next + 1
  }
  return offset + column
}

/**
 * Last line (1-based) of the JSX element whose `<` is at `line` (1-based) and
 * `column` (0-based), or null when the element can't be scanned.
 */
export function jsxElementEndLine(source: string, line: number, column: number): number | null {
  let start = offsetOf(source, line, column)
  if (start < 0 || start > source.length) return null
  if (source[start] !== "<") {
    const lineEnd = source.indexOf("\n", start)
    const next = source.indexOf("<", start)
    if (next < 0 || (lineEnd >= 0 && next > lineEnd)) return null
    start = next
  }
  const end = scanElement(source, start, 0)
  if (end < 0) return null
  let endLine = line
  for (let i = start; i < end - 1; i++) if (source[i] === "\n") endLine++
  return endLine
}
