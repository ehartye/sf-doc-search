import { describe, it, expect } from "vitest";
import { flattenToc, findHref, type TocNode } from "../src/toc";

const toc: TocNode[] = [
  {
    id: "apex_dev_guide",
    text: "Apex Developer Guide",
    a_attr: { href: "apex_dev_guide.htm" },
    children: [
      {
        id: "apex_intro",
        text: "Getting Started with Apex",
        a_attr: { href: "apex_intro.htm" },
        children: [
          { id: "apex_intro_what_is_apex", text: "What is Apex?", a_attr: { href: "apex_intro_what_is_apex.htm" } },
        ],
      },
    ],
  },
];

describe("toc", () => {
  it("flattens all nodes depth-first", () => {
    expect(flattenToc(toc).map((n) => n.id)).toEqual([
      "apex_dev_guide",
      "apex_intro",
      "apex_intro_what_is_apex",
    ]);
  });

  it("finds an href by exact id", () => {
    expect(findHref(toc, "apex_intro_what_is_apex")).toBe("apex_intro_what_is_apex.htm");
  });

  it("finds an href by case-insensitive title substring", () => {
    expect(findHref(toc, "what is apex")).toBe("apex_intro_what_is_apex.htm");
  });

  it("returns undefined when nothing matches", () => {
    expect(findHref(toc, "nonexistent")).toBeUndefined();
  });
});
