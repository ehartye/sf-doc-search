import { describe, it, expect } from "vitest";
import { route } from "../src/router";

describe("route", () => {
  const cases: Array<[string, string]> = [
    ["https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_intro_what_is_apex.htm", "atlas"],
    ["https://developer.salesforce.com/docs/platform/lwc/guide/intro.html", "atlas-lwr"],
    ["https://developer.salesforce.com/docs/component-library/bundle/lightning-button", "component"],
    ["https://developer.salesforce.com/docs/component-library/documentation/en/lightning-component-reference", "component"],
    ["https://help.salesforce.com/s/articleView?id=platform.security_about_sharing_rules&type=5", "help"],
    ["https://help.salesforce.com/s/articleView?id=release-notes.salesforce_release_notes.htm&type=5", "release"],
    ["https://releasenotes.docs.salesforce.com/en-us/summer26/release-notes/salesforce_release_notes.htm", "release"],
    ["https://trailhead.salesforce.com/content/learn/modules/apex_basics_dotnet", "trailhead"],
    ["apexcode/apex_intro_what_is_apex.htm", "atlas"],
    ["https://example.com/whatever", "generic"],
  ];

  it.each(cases)("classifies %s as %s", (input, expected) => {
    expect(route(input).source).toBe(expected);
  });

  it("parses atlas refs from a full dev-docs URL", () => {
    const r = route("https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_intro_what_is_apex.htm");
    expect(r.atlas).toEqual({
      deliverable: "apexcode",
      file: "apex_intro_what_is_apex.htm",
      locale: "en-us",
      longId: "atlas.en-us.apexcode.meta",
      docVersion: undefined,
    });
  });

  it("parses component refs", () => {
    const r = route("https://developer.salesforce.com/docs/component-library/bundle/lightning-button");
    expect(r.component).toEqual({ namespace: "lightning", name: "button", model: "lwc" });
  });

  it("keeps hyphens in multi-word component names", () => {
    expect(
      route("https://developer.salesforce.com/docs/component-library/bundle/lightning-tree-grid").component,
    ).toEqual({ namespace: "lightning", name: "tree-grid", model: "lwc" });
  });

  it("returns generic for malformed http input instead of throwing", () => {
    expect(route("https://").source).toBe("generic");
  });

  it("lowercases atlas segments from an uppercase shorthand id", () => {
    expect(route("ATLAS.EN-US.APEXCODE.META").atlas).toMatchObject({
      deliverable: "apexcode",
      locale: "en-us",
      longId: "atlas.en-us.apexcode.meta",
    });
  });
});
