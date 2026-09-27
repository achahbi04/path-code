/**
 * Phase 6 — Project rail UI finish.
 *
 * Falsifies the pre-Phase-6 `<details>/<summary>` rail and asserts the
 * freeze-quality row system + Phase 1 build-identity footer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const surfaceRoot = new URL(
  "../../scripts/pathcode-cli/build/surface/public/",
  import.meta.url,
);

function readSurface(name: string) {
  return readFileSync(new URL(name, surfaceRoot), "utf8");
}

describe("Phase 6 project rail UI finish", () => {
  it("replaces details/summary rail sections with a row system", () => {
    const html = readSurface("index.html");
    expect(html).not.toMatch(/<details[^>]*class="rail-section"/);
    expect(html).not.toMatch(/id="sourceSection"/);
    expect(html).not.toMatch(/id="repoSection"/);
    expect(html).not.toMatch(/id="detailsSection"/);

    expect(html).toMatch(/class="rail-rows"/);
    expect(html).toMatch(/data-rail="source"/);
    expect(html).toMatch(/data-rail="repo"/);
    expect(html).toMatch(/data-rail="details"/);
    expect(html).toMatch(/>Project Source</);
    expect(html).toMatch(/>Repository</);
    expect(html).toMatch(/>Project Details</);
    expect(html).toMatch(/id="projectRepoState">Local</);
  });

  it("keeps Project Source actions and Project Details controls", () => {
    const html = readSurface("index.html");
    for (const id of [
      "openFolderBtn",
      "copyPathBtn",
      "downloadZipBtn",
      "openCodeBtn",
      "repositoryBtn",
      "projectDetails",
      "renameTitleBtn",
      "archiveBtn",
      "restoreBtn",
      "recoverBuildBtn",
    ]) {
      expect(html).toMatch(new RegExp(`id="${id}"`));
    }
    expect(html).toMatch(/>Open Folder</);
    expect(html).toMatch(/>Copy Project Path</);
    expect(html).toMatch(/>Download Project ZIP</);
    expect(html).toMatch(/>Open in PATH Code</);
  });

  it("shows Phase 1 build identity in the rail footer", () => {
    const html = readSurface("index.html");
    expect(html).toMatch(/Build identity/);
    expect(html).toMatch(/id="codeIdentitySha"/);
    expect(html).toMatch(/id="codeIdentityMain"/);
    expect(html).toMatch(/id="codeIdentityProcs"/);

    const js = readSurface("app.js");
    expect(js).toMatch(/codeIdentitySha/);
    expect(js).toMatch(/els\.codeIdentitySha/);
    expect(js).toMatch(/Build identity|codeIdentitySha\.textContent/);
  });

  it("wires a button accordion instead of native details", () => {
    const js = readSurface("app.js");
    expect(js).toMatch(/Phase 6 project-rail accordion/);
    expect(js).toMatch(/function setRailRowOpen\(/);
    expect(js).toMatch(/function bindRailRows\(/);
    expect(js).toMatch(/bindRailRows\(\)/);
    expect(js).not.toMatch(/sourceSection|repoSection|detailsSection/);
  });

  it("styles consistent row height, chevrons, separators, and Local value", () => {
    const css = readSurface("app.css");
    expect(css).toMatch(/\.rail-row-head\s*\{/);
    expect(css).toMatch(/min-height:\s*2\.35rem/);
    expect(css).toMatch(/grid-template-columns:\s*0\.9rem minmax\(0, 1fr\) auto/);
    expect(css).toMatch(/\.rail-chevron::before\s*\{\s*content:\s*"›"/);
    expect(css).toMatch(/\.rail-row\[data-open="true"\]\s*\.rail-chevron::before\s*\{\s*content:\s*"⌄"/);
    expect(css).toMatch(/\.rail-row-value\s*\{[\s\S]*?justify-self:\s*end/);
    expect(css).toMatch(/\.rail-row\s*\{[\s\S]*?border-bottom:\s*1px solid/);
    expect(css).toMatch(/\.code-identity-kicker/);
    expect(css).toMatch(/\.code-identity-sha/);
  });
});
