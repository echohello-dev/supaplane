import { useMemo } from "react";
import MarkdownIt from "markdown-it";

interface Props {
  source: string;
  className?: string;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: true,
});

/**
 * Render a markdown source string as HTML. Uses markdown-it with safe defaults
 * (`html: false` so no inline HTML is interpreted) and a token-stream parser
 * suited for agent message content.
 *
 * The renderer is intentionally small and side-effect free. We intentionally
 * don't run a DOM-less measurement layer here — when transcript sizes grow,
 * swap this for a token-streaming renderer backed by Pretext.
 */
export function MarkdownView({ source, className }: Props) {
  const html = useMemo(() => renderSafe(source), [source]);
  return (
    <div
      className={
        className ??
        "markdown-body text-sm leading-relaxed text-neutral-200 [&_a]:text-supaplane-accent [&_a]:underline [&_code]:rounded [&_code]:bg-neutral-800 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-neutral-900 [&_pre]:p-3 [&_strong]:font-semibold [&_ul]:my-2"
      }
      // The HTML is produced by markdown-it with html:false, so the only
      // elements that can appear are the CommonMark tag set plus linkify
      // auto-links. We then strip on*/src/style and any href with an unsafe
      // protocol.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderSafe(source: string): string {
  try {
    const tokens = md.parse(source, {});
    for (const token of tokens) {
      sanitizeAttrs(token);
    }
    return md.renderer.render(tokens, md.options, {});
  } catch {
    return escapeHtml(source);
  }
}

interface MarkdownToken {
  type: string;
  attrs?: [string, string][] | null;
}

function sanitizeAttrs(token: MarkdownToken): void {
  const attrs = token.attrs;
  if (!attrs) return;
  const kept: [string, string][] = [];
  for (const [name, value] of attrs) {
    if (name.startsWith("on") || name === "src" || name === "srcdoc" || name === "style") continue;
    if (name === "href" && !isSafeUrl(value)) continue;
    kept.push([name, value]);
  }
  token.attrs = kept;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "xmpp:", "ftp:"]);

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return true;
  }
  const colon = trimmed.indexOf(":");
  if (colon === -1) return true;
  const proto = trimmed.slice(0, colon + 1).toLowerCase();
  return SAFE_PROTOCOLS.has(proto);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
