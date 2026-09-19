/**
 * PATH Build — visual builder proof harness (binding + preview + evidence).
 * Usage: node scripts/pathcode-cli/build/proof-visual-builder.mjs
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { resolvePathPackageRoot } from "../paths.mjs";
import { startPathBuildSurface } from "./surface/server.mjs";
import { captureBrowserEvidence } from "./runtime/browser-evidence.mjs";

function canon(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

async function main() {
  const packageRoot = resolvePathPackageRoot();
  const runtimeRoot = mkdtempSync(join(tmpdir(), "path-build-proof-rt-"));
  mkdirSync(join(homedir(), "PATH Builds"), { recursive: true });
  const targetDir = join(
    homedir(),
    "PATH Builds",
    `proof-ice-visual-${Date.now().toString(36)}`,
  );

  const surface = await startPathBuildSurface({
    packageRoot,
    runtimeRoot,
    openBrowser: false,
    fakeMode: true,
    autoLoop: false,
    port: 0,
  });

  const outcome =
    "Build an emergency website for ICE — In Case of Emergency. The website should explain the product clearly and present it professionally.";

  const started = await fetch(new URL("/api/builds", surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcome, targetDir, originKind: "build-created" }),
  });
  const body = await started.json();
  if (!started.ok || !body.ok) {
    console.error("START_FAILED", body);
    process.exitCode = 1;
    await surface.stop();
    return;
  }

  const buildId = body.buildId;
  const projectRoot = body.projectRoot;
  console.log("buildId", buildId);
  console.log("projectRoot", projectRoot);
  console.log("bindsHome", canon(projectRoot) === canon(homedir()));
  console.log("hasGit", existsSync(join(projectRoot, ".git")));
  console.log("criteria", (body.view.criteria || []).length);

  writeFileSync(
    join(projectRoot, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>ICE — Emergency Profile</title>
<style>body{margin:0;font-family:system-ui;background:#0b1220;color:#f5f7fb}header{padding:4rem 2rem;background:linear-gradient(135deg,#1a2338,#0b1220)}.cta{display:inline-block;margin-top:1rem;padding:.75rem 1.2rem;background:#6ee7a8;color:#062214;border-radius:999px;text-decoration:none;font-weight:700}</style>
</head><body><header><h1>ICE — Emergency Profile</h1><p>When you cannot speak, ICE speaks for you.</p><a class="cta" href="#">Get the app</a></header>
<main style="padding:2rem"><h2>In Case of Emergency</h2><p>Medical and contact information for responders. No account. No cloud.</p></main></body></html>\n`,
  );
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      {
        name: "ice-emergency-website",
        private: true,
        scripts: { test: "node -e \"process.exit(0)\"" },
      },
      null,
      2,
    ),
  );

  const rt = await fetch(
    new URL(`/api/builds/${buildId}/runtime/start`, surface.url),
    { method: "POST" },
  );
  const runtime = await rt.json();
  console.log(
    "runtimeOk",
    runtime.ok,
    runtime.runtime?.url,
    runtime.runtime?.command,
  );

  const view = await (
    await fetch(new URL(`/api/builds/${buildId}`, surface.url))
  ).json();
  console.log(
    "previewEmbed",
    view.preview?.embedPath,
    "previewStatus",
    view.preview?.status,
  );

  let previewHtml = "";
  if (view.preview?.embedPath) {
    const page = await fetch(new URL(view.preview.embedPath, surface.url));
    previewHtml = await page.text();
    console.log("previewHasICE", /ICE/i.test(previewHtml));
    console.log("previewInjected", /path-build-preview/i.test(previewHtml));
  }

  const evidence = await captureBrowserEvidence({
    url: runtime.runtime?.url || view.preview?.url,
    buildId,
    runtimeRoot,
    expectText: ["ICE", "Emergency"],
  });
  console.log(
    "evidenceOk",
    evidence.ok,
    "htmlPath",
    evidence.htmlPath,
    "shot",
    evidence.screenshotPath,
  );

  const msg = await fetch(
    new URL(`/api/builds/${buildId}/message`, surface.url),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Make the hero darker and more premium.",
      }),
    },
  );
  const steered = await msg.json();
  console.log("steerOk", steered.ok, "revision", steered.build?.intent?.outcomeRevision);

  const open = await fetch(new URL("/api/open-folder", surface.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildId }),
  });
  console.log("openFolder", await open.json());

  await surface.stop();
  try {
    rmSync(runtimeRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const pass =
    body.ok &&
    canon(projectRoot) !== canon(homedir()) &&
    existsSync(join(projectRoot, ".git")) &&
    runtime.ok &&
    /ICE/i.test(previewHtml) &&
    evidence.ok &&
    steered.ok;

  console.log(pass ? "PROOF_PASS" : "PROOF_FAIL");
  process.exitCode = pass ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
