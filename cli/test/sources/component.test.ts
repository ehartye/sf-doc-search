import { describe, it, expect, vi } from "vitest";
import { fetchComponent, componentUrl } from "../../src/sources/component";

describe("component source", () => {
  it("builds the cx-router URL", () => {
    expect(componentUrl({ namespace: "lightning", name: "button", model: "lwc" })).toBe(
      "https://developer.salesforce.com/cx-router/components?model=lwc&namespace=lightning&component=button",
    );
  });

  it("url-encodes component ref fields", () => {
    expect(componentUrl({ namespace: "ns&x", name: "a b", model: "lwc" })).toBe(
      "https://developer.salesforce.com/cx-router/components?model=lwc&namespace=ns%26x&component=a%20b",
    );
  });

  it("formats the component JSON into markdown with attributes", async () => {
    const browser = {
      fetchJsonInPage: vi.fn(async () => ({
        response: {
          name: "button", type: "lwc",
          global: { description: "A clickable element used to perform an action.", support: "GA" },
          attributes: [{ name: "iconName", nameInKebabCase: "icon-name", description: "The Lightning Design System name of the icon.", required: false }],
        },
        responseCode: 200,
      })),
    } as any;
    const res = await fetchComponent(browser, { namespace: "lightning", name: "button", model: "lwc" });
    expect(res.title).toBe("lightning-button");
    expect(res.markdown).toContain("A clickable element");
    expect(res.markdown).toContain("icon-name");
    expect(res.source).toBe("component");
  });

  it("stamps a dated provenance line", async () => {
    const browser = { fetchJsonInPage: async () => ({ response: { attributes: [] } }) } as any;
    const doc = await fetchComponent(browser, { namespace: "lightning", name: "button", model: "lwc" });
    expect(doc.markdown).toMatch(/> Retrieved: \d{4}-\d{2}-\d{2} via sf-docs \(component\)/);
  });
});
