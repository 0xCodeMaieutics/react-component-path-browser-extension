import { describe, expect, it } from "vitest"
import { jsxElementEndLine } from "../src/lib/jsx-range"

/** Position of the n-th `marker` occurrence as 1-based line / 0-based column. */
function positionOf(source: string, marker: string, occurrence = 0): [number, number] {
  let index = -1
  for (let i = 0; i <= occurrence; i++) index = source.indexOf(marker, index + 1)
  const before = source.slice(0, index)
  const line = before.split("\n").length
  return [line, index - before.lastIndexOf("\n") - 1]
}

function endLine(source: string, marker: string, occurrence = 0): number | null {
  return jsxElementEndLine(source, ...positionOf(source, marker, occurrence))
}

describe("jsxElementEndLine", () => {
  it("handles self-closing and single-line elements", () => {
    const source = `const a = <Foo bar="x" />\nconst b = <Bar>text</Bar>\n`
    expect(endLine(source, "<Foo")).toBe(1)
    expect(endLine(source, "<Bar")).toBe(2)
  })

  it("spans multi-line props and children", () => {
    const source = [
      "export function Page() {",
      "  return (",
      "    <Card",
      '      title="Checkout"',
      "      onClose={() => setOpen(false)}",
      "    >",
      "      <PayButton total={total} />",
      "      <p>Don't worry, it's {total > 1 ? 'fine' : \"ok\"}</p>",
      "    </Card>",
      "  )",
      "}",
    ].join("\n")
    expect(endLine(source, "<Card")).toBe(9)
    expect(endLine(source, "<PayButton")).toBe(7)
    expect(endLine(source, "<p>")).toBe(8)
  })

  it("skips JSX nested in expressions, strings, templates, and comments", () => {
    const source = [
      "<List",
      "  render={(item) => <Item key={`${item.id}-}`} label='>' />}",
      "  // a comment with </List>",
      "  label={'}'}",
      ">",
      "  {items.map((item) => (",
      "    <Row item={item}>{item.name}</Row>",
      "  ))}",
      "  {/* </List> */}",
      "  {cond && <Empty />}",
      "</List>",
      "<After />",
    ].join("\n")
    expect(endLine(source, "<List")).toBe(11)
  })

  it("handles fragments and member-expression tags", () => {
    const source = "<>\n  <Radix.Root>\n    <Radix.Item />\n  </Radix.Root>\n</>\n"
    expect(endLine(source, "<>")).toBe(5)
    expect(endLine(source, "<Radix.Root")).toBe(4)
  })

  it("does not mistake comparisons and generics for JSX", () => {
    const source = [
      "<Box",
      "  visible={count < limit && limit > 0}",
      "  value={useMemo<number>(() => compute(), [])}",
      ">",
      "  {a <b ? 1 : 2}",
      "</Box>",
    ].join("\n")
    expect(endLine(source, "<Box")).toBe(6)
  })

  it("finds the tag when the column is slightly before it", () => {
    const source = "return (\n  <Foo>\n  </Foo>\n)"
    expect(jsxElementEndLine(source, 2, 0)).toBe(3)
  })

  it("returns null for unterminated elements", () => {
    expect(endLine("<Foo>\n  <Bar>\n", "<Foo")).toBeNull()
    expect(jsxElementEndLine("const x = 1", 1, 0)).toBeNull()
  })
})
