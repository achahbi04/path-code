/**
 * Phase GC1-b — GC1B-G Cloud Workstations image contract proofs.
 * Zero network. Zero GCP. $0. Engine src/** untouched.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GC1_DIR = join(CHECKOUT_ROOT, "scripts/pathcode-cli/gc1");
const DOCKERFILE = join(GC1_DIR, "image/Dockerfile");
const CONTRACT = join(GC1_DIR, "image-contract.mjs");
const IMAGE = join(GC1_DIR, "engineering-image.mjs");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function load() {
  const bust = randomUUID();
  const [contract, image] = await Promise.all([
    import(`${pathToFileURL(CONTRACT).href}?b=${bust}`),
    import(`${pathToFileURL(IMAGE).href}?b=${bust}`),
  ]);
  return { ...contract, ...image };
}

describe("GC1B-G CLOUD WORKSTATIONS IMAGE CONTRACT", () => {
  it("Engineering Dockerfile + expected image config pass the contract", async () => {
    const beforeDf = sha256(DOCKERFILE);
    const beforeContract = sha256(CONTRACT);
    const {
      assertWorkstationsImageContract,
      WORKSTATIONS_BASE,
      workstationsBasePinnedReference,
      assertDurableToolchainPathEnv,
      buildConfigContainerPin,
    } = await load();

    const dockerfileText = readFileSync(DOCKERFILE, "utf8");
    const imageConfig = {
      User: null,
      Entrypoint: [WORKSTATIONS_BASE.entrypoint],
      Cmd: null,
      WorkingDir: null,
      Env: [
        "PATH=/usr/local/go/bin:/usr/local/cargo/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      ],
      presentPaths: [
        WORKSTATIONS_BASE.entrypoint,
        WORKSTATIONS_BASE.startupDir,
        WORKSTATIONS_BASE.addUserScript,
        WORKSTATIONS_BASE.sshScript,
      ],
    };

    const body = buildConfigContainerPin({
      digest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const result = assertWorkstationsImageContract({
      dockerfileText,
      imageConfig,
      workstationConfigBody: body,
    });
    expect(result.ok).toBe(true);
    expect(result.base).toBe(workstationsBasePinnedReference());
    expect(result.entrypoint).toBe("/google/scripts/entrypoint.sh");
    expect(WORKSTATIONS_BASE.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

    const pathEnv = imageConfig.Env?.[0];
    expect(pathEnv).toMatch(/^PATH=/);
    assertDurableToolchainPathEnv(pathEnv!.replace(/^PATH=/, ""));

    expect(sha256(DOCKERFILE)).toBe(beforeDf);
    expect(sha256(CONTRACT)).toBe(beforeContract);
  });

  it("falsify: remove workstation entrypoint → contract fails; restore by hash", async () => {
    const before = sha256(CONTRACT);
    const { assertWorkstationsImageContract, WORKSTATIONS_BASE } = await load();
    const dockerfileText = readFileSync(DOCKERFILE, "utf8");

    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText,
        imageConfig: {
          User: null,
          Entrypoint: ["/bin/bash"],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            WORKSTATIONS_BASE.addUserScript,
            WORKSTATIONS_BASE.sshScript,
          ],
        },
      }),
    ).toThrow(/Entrypoint|entrypoint/i);

    expect(sha256(CONTRACT)).toBe(before);
  });

  it("falsify: remove runtime user startup mechanism → contract fails", async () => {
    const before = sha256(CONTRACT);
    const { assertWorkstationsImageContract, WORKSTATIONS_BASE } = await load();
    const dockerfileText = readFileSync(DOCKERFILE, "utf8");

    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText,
        imageConfig: {
          User: null,
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            // missing 010_add-user.sh
            WORKSTATIONS_BASE.sshScript,
          ],
        },
      }),
    ).toThrow(/010_add-user|missing/i);

    expect(sha256(CONTRACT)).toBe(before);
  });

  it("falsify: USER user / runAsUser → contract fails (v2 defect class)", async () => {
    const beforeDf = sha256(DOCKERFILE);
    const { assertWorkstationsImageContract, WORKSTATIONS_BASE } = await load();
    const good = readFileSync(DOCKERFILE, "utf8");

    const badUserDockerfile = `${good}\nUSER user\n`;
    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText: badUserDockerfile,
        imageConfig: {
          User: "user",
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          WorkingDir: "/home/user/workspace",
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            WORKSTATIONS_BASE.addUserScript,
            WORKSTATIONS_BASE.sshScript,
          ],
        },
      }),
    ).toThrow(/USER|User|WorkingDir|home/i);

    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText: good,
        imageConfig: {
          User: null,
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            WORKSTATIONS_BASE.addUserScript,
            WORKSTATIONS_BASE.sshScript,
          ],
        },
        workstationConfigBody: {
          container: {
            image: "x@sha256:abc",
            runAsUser: 1000,
          },
        },
      }),
    ).toThrow(/runAsUser/i);

    expect(sha256(DOCKERFILE)).toBe(beforeDf);
  });

  it("falsify: overwrite startup directory / missing ssh script → fails", async () => {
    const before = sha256(CONTRACT);
    const { assertWorkstationsImageContract, WORKSTATIONS_BASE } = await load();
    const dockerfileText = readFileSync(DOCKERFILE, "utf8");

    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText,
        imageConfig: {
          User: null,
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            // startup dir wiped
            WORKSTATIONS_BASE.addUserScript,
            WORKSTATIONS_BASE.sshScript,
          ],
        },
      }),
    ).toThrow(/workstation-startup|missing/i);

    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText,
        imageConfig: {
          User: null,
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            WORKSTATIONS_BASE.addUserScript,
            // missing ssh
          ],
        },
      }),
    ).toThrow(/020_start-sshd|missing/i);

    expect(sha256(CONTRACT)).toBe(before);
  });

  it("falsify: /root/.cargo PATH reliance → user-env proof fails", async () => {
    const before = sha256(CONTRACT);
    const { assertDurableToolchainPathEnv } = await load();
    expect(() =>
      assertDurableToolchainPathEnv("/root/.cargo/bin:/usr/bin"),
    ).toThrow(/root|PATH/i);
    expect(() => assertDurableToolchainPathEnv("/usr/bin")).toThrow(/missing/i);
    expect(sha256(CONTRACT)).toBe(before);
  });

  it("falsify: omit Go /usr/local/bin shim or rust profile.d → contract fails", async () => {
    const before = sha256(CONTRACT);
    const { assertWorkstationsImageContract, WORKSTATIONS_BASE } = await load();
    const good = readFileSync(DOCKERFILE, "utf8");
    const noGoShim = good.replace(
      /&& ln -sf \/usr\/local\/go\/bin\/go \/usr\/local\/bin\/go \\\n\s*&& ln -sf \/usr\/local\/go\/bin\/gofmt \/usr\/local\/bin\/gofmt\n/,
      "\n",
    );
    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText: noGoShim,
        imageConfig: {
          User: null,
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            WORKSTATIONS_BASE.addUserScript,
            WORKSTATIONS_BASE.sshScript,
          ],
        },
      }),
    ).toThrow(/go|shim|\/usr\/local\/bin/i);

    const noProfile = good.replace(
      /\/etc\/profile\.d\/zz-pathcode-toolchains\.sh/g,
      "/tmp/not-a-profile.sh",
    );
    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText: noProfile,
        imageConfig: {
          User: null,
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            WORKSTATIONS_BASE.addUserScript,
            WORKSTATIONS_BASE.sshScript,
          ],
        },
      }),
    ).toThrow(/profile\.d|zz-pathcode/i);

    expect(sha256(CONTRACT)).toBe(before);
  });

  it("v2 historical Dockerfile surface would fail GC1B-G", async () => {
    const { assertWorkstationsImageContract, WORKSTATIONS_BASE, IMAGE_DIGEST_HISTORY } =
      await load();
    expect(IMAGE_DIGEST_HISTORY["gc1b-v2"]).toBe(
      "sha256:7cdbbce2a60a77728b21fc2c55da4f24af18e5fd2d8aa48bdccc9dcdc9a9015a",
    );
    expect(IMAGE_DIGEST_HISTORY["gc1b-v3"]).toBe(
      "sha256:077bd0639241bbc649b110cb0a910a5e1d46337b2f88ec978536a4649a694868",
    );
    expect(IMAGE_DIGEST_HISTORY["gc1b-v3"]).not.toBe(IMAGE_DIGEST_HISTORY["gc1b-v2"]);
    // v4 digest is filled after Cloud Build publish; when present must be distinct.
    if (IMAGE_DIGEST_HISTORY["gc1b-v4"]) {
      expect(IMAGE_DIGEST_HISTORY["gc1b-v4"]).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(IMAGE_DIGEST_HISTORY["gc1b-v4"]).not.toBe(IMAGE_DIGEST_HISTORY["gc1b-v3"]);
    }

    const v2Defect = `
FROM us-central1-docker.pkg.dev/cloud-workstations-images/predefined/code-oss:latest
USER root
RUN mkdir -p /home/user/workspace && chown -R user:user /home/user
ENV PATH="/root/.cargo/bin:\${PATH}"
WORKDIR /home/user/workspace
USER user
`;
    expect(() =>
      assertWorkstationsImageContract({
        dockerfileText: v2Defect,
        imageConfig: {
          User: "user",
          Entrypoint: [WORKSTATIONS_BASE.entrypoint],
          WorkingDir: "/home/user/workspace",
          Env: ["PATH=/root/.cargo/bin:/usr/bin"],
          presentPaths: [
            WORKSTATIONS_BASE.entrypoint,
            WORKSTATIONS_BASE.startupDir,
            WORKSTATIONS_BASE.addUserScript,
            WORKSTATIONS_BASE.sshScript,
          ],
        },
      }),
    ).toThrow(/GC1B-G|code-oss|USER|home|root/i);
  });
});
