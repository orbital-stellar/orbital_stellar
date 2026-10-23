import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FOOTER_COMMUNITY_LINKS,
  FOOTER_PRODUCT_LINKS,
  GET_STARTED_HREF,
  GITHUB_ISSUES,
  GITHUB_REPO,
  NAV_LINKS,
  NPM_PACKAGES,
  SCF_PROPOSAL,
  exampleTreeUrl,
  npmUrl,
  type NavLink,
} from "@/lib/links";

const PACKAGES_DIR = fileURLToPath(new URL("../../../packages/", import.meta.url));
const EXAMPLES_DIR = fileURLToPath(new URL("../../../examples/", import.meta.url));

describe("repository URLs", () => {
  it("points at the canonical GitHub repository", () => {
    expect(GITHUB_REPO).toBe("https://github.com/orbital-stellar/orbital_stellar");
  });

  it("derives the issue and proposal URLs from the repository URL", () => {
    expect(GITHUB_ISSUES).toBe(`${GITHUB_REPO}/issues/new/choose`);
    expect(SCF_PROPOSAL).toBe(`${GITHUB_REPO}/blob/main/docs/proposal.md`);
  });
});

describe("npmUrl", () => {
  it("builds the scoped npm package URL", () => {
    expect(npmUrl("pulse-core")).toBe("https://www.npmjs.com/package/@orbital-stellar/pulse-core");
  });

  it("builds a URL for every published package", () => {
    for (const pkg of NPM_PACKAGES) {
      expect(npmUrl(pkg)).toBe(`https://www.npmjs.com/package/@orbital-stellar/${pkg}`);
    }
  });
});

describe("exampleTreeUrl", () => {
  it("builds the GitHub tree URL for a starter", () => {
    expect(exampleTreeUrl("next-starter")).toBe(`${GITHUB_REPO}/tree/main/examples/next-starter`);
  });

  it("does not add a trailing slash", () => {
    expect(exampleTreeUrl("x").endsWith("/")).toBe(false);
  });

  it("the starter linked from the docs exists under examples/", () => {
    expect(statSync(`${EXAMPLES_DIR}next-starter`).isDirectory()).toBe(true);
  });
});

describe("NPM_PACKAGES", () => {
  it("is not empty", () => {
    expect(NPM_PACKAGES.length).toBeGreaterThan(0);
  });

  it("has no duplicates", () => {
    expect(new Set(NPM_PACKAGES).size).toBe(NPM_PACKAGES.length);
  });

  it.each([...NPM_PACKAGES])("%s names a directory under packages/", (pkg) => {
    expect(existsSync(`${PACKAGES_DIR}${pkg}`)).toBe(true);
    expect(statSync(`${PACKAGES_DIR}${pkg}`).isDirectory()).toBe(true);
  });
});

const lists: Array<[string, NavLink[]]> = [
  ["NAV_LINKS", NAV_LINKS],
  ["FOOTER_PRODUCT_LINKS", FOOTER_PRODUCT_LINKS],
  ["FOOTER_COMMUNITY_LINKS", FOOTER_COMMUNITY_LINKS],
];

describe.each(lists)("%s", (_name, links) => {
  it("is not empty", () => {
    expect(links.length).toBeGreaterThan(0);
  });

  it("uses an absolute https URL or a root-relative path for every href", () => {
    for (const { label, href } of links) {
      const ok = href.startsWith("https://") || (href.startsWith("/") && !href.startsWith("//"));
      expect(ok, `${label}: ${href}`).toBe(true);
    }
  });

  it("has no duplicate hrefs", () => {
    const hrefs = links.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has no duplicate or empty labels", () => {
    const labels = links.map((l) => l.label);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("marks absolute URLs as external and paths as internal", () => {
    for (const { label, href, external } of links) {
      expect(Boolean(external), label).toBe(href.startsWith("https://"));
    }
  });

  it("has no placeholder or whitespace-padded hrefs", () => {
    for (const { label, href } of links) {
      expect(href, label).not.toBe("#");
      expect(href, label).toBe(href.trim());
    }
  });
});

describe("GET_STARTED_HREF", () => {
  it("is a root-relative docs path", () => {
    expect(GET_STARTED_HREF.startsWith("/docs/")).toBe(true);
  });
});
