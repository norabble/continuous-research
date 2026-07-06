import { describe, expect, it } from "vitest";
import { renderUntrustedMarkdown } from "./site-md";

describe("renderUntrustedMarkdown", () => {
  it("renders headings, emphasis, lists, and links", () => {
    const html = renderUntrustedMarkdown("# T\n\n- **a**\n- [x](https://e.com)");
    expect(html).toContain("<h1>T</h1>");
    expect(html).toContain("<strong>a</strong>");
    expect(html).toContain('href="https://e.com"');
  });

  it("escapes raw HTML instead of parsing it", () => {
    const html = renderUntrustedMarkdown("hi <script>alert(1)</script> <img src=x onerror=y>");
    expect(html).not.toContain("<script>");
    // No *live* img element (the tag is inert text, not a parsed element) --
    // see the report for why "not.toContain('onerror')" isn't the right
    // assertion here: escape-and-show necessarily leaves the attribute's
    // literal letters visible as text, same as it does for "script" below.
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("strips claim annotations", () => {
    const html = renderUntrustedMarkdown(
      "Claim text.\n<!-- claim: a | backs: b | status: supported -->\n",
    );
    expect(html).not.toContain("claim:");
  });

  it("neutralizes unsafe link schemes", () => {
    const html = renderUntrustedMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  // --- Extra safety-contract coverage beyond the brief's four tests ---

  it("neutralizes data: URLs", () => {
    const html = renderUntrustedMarkdown(
      "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    );
    expect(html).not.toContain("data:");
    expect(html).toContain('href="#"');
  });

  it("neutralizes unsafe schemes regardless of case, whitespace, or reference-style links", () => {
    expect(renderUntrustedMarkdown("[x](JaVaScRiPt:alert(1))")).toContain('href="#"');
    expect(renderUntrustedMarkdown("[x](  javascript:alert(1))")).toContain('href="#"');
    expect(renderUntrustedMarkdown("[x](vbscript:alert(1))")).toContain('href="#"');
    const referenceStyle = renderUntrustedMarkdown("[x][r]\n\n[r]: javascript:alert(1)");
    expect(referenceStyle).not.toContain("javascript:");
    expect(referenceStyle).toContain('href="#"');
  });

  it("neutralizes protocol-relative URLs (external host via the current page's scheme)", () => {
    const html = renderUntrustedMarkdown("[x](//evil.example)");
    expect(html).not.toContain("evil.example");
    expect(html).toContain('href="#"');
  });

  it("neutralizes backslash-as-slash authority tricks browsers apply for http(s) URLs", () => {
    // Two literal backslashes normalize to "//" under browser URL parsing for
    // special schemes, which would otherwise smuggle an external host past a
    // naive "starts with // is the only unsafe form" check.
    const html = renderUntrustedMarkdown(String.raw`[x](\\\\evil.example)`);
    expect(html).not.toContain("evil.example");
    expect(html).toContain('href="#"');
  });

  it("allows safe relative and fragment references untouched", () => {
    expect(renderUntrustedMarkdown("[x](/abs/rel)")).toContain('href="/abs/rel"');
    expect(renderUntrustedMarkdown("[x](./rel)")).toContain('href="./rel"');
    expect(renderUntrustedMarkdown("[x](../rel)")).toContain('href="../rel"');
    expect(renderUntrustedMarkdown("[x](relative-page)")).toContain('href="relative-page"');
    expect(renderUntrustedMarkdown("[x](#frag)")).toContain('href="#frag"');
    expect(renderUntrustedMarkdown("[x](mailto:a@b.com)")).toContain('href="mailto:a@b.com"');
  });

  it("does not allow attribute breakout through link/title/alt text", () => {
    const hrefBreakout = renderUntrustedMarkdown('[x](https://e.com/"onmouseover="alert(1))');
    expect(hrefBreakout).not.toMatch(/href="https:\/\/e\.com\/"onmouseover/);

    const titleBreakout = renderUntrustedMarkdown(
      String.raw`[x](https://e.com "a\" onmouseover=\"b")`,
    );
    expect(titleBreakout).not.toContain('onmouseover="b"');

    const altBreakout = renderUntrustedMarkdown('![xyz" onerror="alert(1)](https://e.com/img.png)');
    expect(altBreakout).not.toContain('onerror="alert(1)"');
  });

  it("degrades blockquote syntax to escaped text, but still autolinks a bracketed URL (accepted tradeoff of escape-before-parse)", () => {
    // Escaping the whole source before marked parses it is what keeps raw
    // HTML from ever reaching marked's HTML tokenizer, but it also means any
    // markdown construct built on a literal `<`/`>` is affected: blockquotes
    // (`> `) lose their meaning entirely and render as plain escaped text.
    // Bracketed autolinks (`<https://...>`) are different: once escaping
    // strips the brackets down to visible `&lt;`/`&gt;` text, marked's GFM
    // bare-URL autolinker still recognizes the URL *between* them and turns
    // it into a real (safety-checked) link. Both behaviors are accepted
    // limitations of this design, not bugs -- documented here so a future
    // change doesn't "fix" one without noticing the other.
    const html = renderUntrustedMarkdown("> quoted\n\n<https://e.com>");
    expect(html).toContain("&gt; quoted");
    expect(html).toContain('&lt;<a href="https://e.com">https://e.com</a>&gt;');
  });
});
