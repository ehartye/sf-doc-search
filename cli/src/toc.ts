export interface TocNode {
  id: string;
  text: string;
  a_attr?: { href?: string };
  children?: TocNode[];
}

export function flattenToc(nodes: TocNode[]): TocNode[] {
  const out: TocNode[] = [];
  const walk = (list: TocNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Find a page href by exact id first, then case-insensitive title substring. */
export function findHref(nodes: TocNode[], query: string): string | undefined {
  const flat = flattenToc(nodes);
  const byId = flat.find((n) => n.id === query);
  if (byId?.a_attr?.href) return byId.a_attr.href;
  const q = query.toLowerCase();
  const byText = flat.find((n) => n.text.toLowerCase().includes(q));
  return byText?.a_attr?.href;
}
