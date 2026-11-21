import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * Headline-style title case (AP style): capitalize every word except short joining words
 * (a, an, and, of, the, to…) unless they start or end the title. Never lowercases anything,
 * so names like "TrailsTV+", "NPS" or "McKittrick" keep their capitals.
 */
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "vs", "vs.", "via"]);

const cap = (w: string) => w.replace(/^([^\p{L}\p{N}]*)(\p{Ll})/u, (_m, pre: string, c: string) => pre + c.toUpperCase());

export function titleCase(s: string): string {
  const words = s.split(/(\s+)/);
  const real = words.map((w, i) => (/\S/.test(w) ? i : -1)).filter((i) => i >= 0);
  const first = real[0], last = real[real.length - 1];
  return words.map((w, i) => {
    if (!/\S/.test(w)) return w;
    const bare = w.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, "");
    if (SMALL.has(bare) && i !== first && i !== last) return w;
    return w.split("-").map(cap).join("-"); // Cross-country → Cross-Country
  }).join("");
}

/** titleCase every piece of text inside a title (works through fragments and spans). */
export function titleCaseNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return titleCase(node);
  if (Array.isArray(node)) return Children.map(node, titleCaseNode);
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return el.props.children === undefined ? el : cloneElement(el, undefined, titleCaseNode(el.props.children));
  }
  return node;
}
