/**
 * Renders agent-written markdown to HTML safe for the static site.
 *
 * The source is untrusted content written by research agents (impact
 * declarations, findings prose), not vetted contributors — this module is
 * the security boundary before that text becomes a page. Safety contract:
 *
 *   - Raw HTML in the source is escaped, never parsed. Escaping the *whole*
 *     source before `marked` ever sees it means `marked`'s own HTML
 *     tokenizer never fires — there's no "sanitize the parsed HTML" step to
 *     keep in sync with its grammar as it evolves. The tradeoff: markdown
 *     constructs built on a literal `<`/`>` (blockquotes `> `, bracket
 *     autolinks `<https://...>`) degrade to visible escaped text too. That's
 *     an accepted limitation for this content, not a bug — see
 *     site-md.test.ts.
 *   - `<!-- claim: ... -->` annotation lines are stripped before rendering:
 *     they're structure for the claim index (src/annotations.ts), not
 *     content for readers.
 *   - Link/image destinations are restricted to `http:`, `https:`,
 *     `mailto:`, or schemeless (relative/fragment) references. Everything
 *     else — `javascript:`, `data:`, `vbscript:`, protocol-relative
 *     `//host`, and the backslash-as-slash authority trick browsers apply
 *     when resolving http(s) URLs — is neutralized to `#`.
 */

import { Marked, type Token, type Tokens } from "marked";

const ANNOTATION_LINE = /^[ \t]*<!--\s*claim:[\s\S]*?-->[ \t]*$/gm;

const escapeHtml = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

// Drops ASCII control characters and space (code points 0x00-0x20), which
// browsers strip from URLs before resolving them. Written as a codepoint
// filter, not a regex, so no control-character escape needs to live in a
// regex literal (that trips `no-control-regex`, and for good reason: a
// regex hiding a raw control byte is exactly the kind of thing worth a lint
// rule in a file whose whole job is URL sanitization).
const stripControlAndSpace = (s: string): string =>
  Array.from(s)
    .filter((ch) => (ch.codePointAt(0) ?? 0) > 0x20)
    .join("");

/**
 * Mirrors how a browser resolves a URL, not just a text pattern: strip
 * control characters (browsers do), fold backslashes to slashes (browsers
 * treat `\` as `/` when resolving http(s) URLs, which is how a *single*
 * backslash reference like `\evil.com` stays a same-origin absolute path
 * but *two* backslashes coalesce into a protocol-relative `//evil.com`
 * authority), then check the first colon-terminated scheme (if any)
 * against an allowlist. No scheme at all means a relative reference, which
 * is safe by construction — it can't select "javascript" or change host.
 *
 * Shared with the site renderer for scheme-validating data-derived URLs
 * in href attributes.
 */
export function isSafeHref(href: string): boolean {
  const stripped = stripControlAndSpace(href.trim());
  const normalized = stripped.replace(/\\/g, "/");
  if (normalized.startsWith("//")) return false; // protocol-relative -> external host
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(normalized)?.[0];
  return scheme ? SAFE_SCHEMES.has(scheme.toLowerCase()) : true;
}

function isLinkOrImageToken(token: Token): token is Tokens.Link | Tokens.Image {
  return token.type === "link" || token.type === "image";
}

export function renderUntrustedMarkdown(md: string): string {
  const withoutAnnotations = md.replace(ANNOTATION_LINE, "");
  const source = escapeHtml(withoutAnnotations);
  const marked = new Marked({
    async: false,
    walkTokens: (token) => {
      if (isLinkOrImageToken(token) && !isSafeHref(token.href)) {
        token.href = "#";
      }
    },
  });
  return marked.parse(source) as string;
}
