/**
 * Citation helpers for canonical capability ledger construction.
 */

import type {
  DocumentCitation,
  ModuleCitation,
  ObligationCitation,
} from "./types.js";

export function doc(
  path: string,
  atCommit: string,
  meaning: string,
): DocumentCitation {
  return {
    kind: "document",
    path,
    atCommit,
    meaning,
    admissibility: "REPOSITORY_RECORDED",
  };
}

export function mod(
  path: string,
  atCommit: string,
  meaning: string,
): ModuleCitation {
  return {
    kind: "module",
    path,
    atCommit,
    meaning,
    admissibility: "MECHANICALLY_VERIFIABLE",
  };
}

export function obligation(
  id: string,
  inDocument: string,
  atCommit: string,
  exactEvidenceNeedle: string,
): ObligationCitation {
  return {
    kind: "obligation",
    id,
    inDocument,
    atCommit,
    exactEvidenceNeedle,
    admissibility: "REPOSITORY_RECORDED",
  };
}

/** Phase checkpoint SHAs — full 40-hex immutable evidence anchors. */
export const SHA = {
  phase0: "7de4bf07a1cad3215f63d9abb5dedc20d28d2255",
  phase1A: "f166857ff9fe39c9dc9dea82786eb054345e4e27",
  phase1B: "fd324aaca43c054f3577f5c269a6cdf4da56658f",
  phase1C: "bc178d3f3b1c073f8945e032a0a608b500ccadab",
  phase1D: "6455d6b1a43b27587325f67d4aff3f12b64a772a",
  phase1E: "d1fb57c8353a98ab032bf5b27a791a92218aecb9",
  phase1F: "57980bd3972822f4cbdf9e78fbec31e1f776c445",
  phase1Closure: "ca35f9dbfbc29cc839ddc7586acbf86fc1af7703",
  phase2Master: "8a30af66ba0d0f40d1949342cde2a0fca971c437",
  phase2A: "784d171ac2187a38ebebfc351bb5d5edc451da55",
  phase2B: "7a204ad6d05ef8ff2bc67f1ea77cfe20f03d8ddb",
  phase2C: "733c4e0bc295746af8529e02ea40b9fe8b224de2",
  phase2D: "16e978c4840757c9c5484f75d9de7ab3d688ae2a",
  phase2E: "621b0f47c7d90627721c37f21fc63e2f084d8629",
  phase2FImpl: "ba588a084982736bfd924aa5fc821df45694279f",
  phase2FEvidence: "fb1484afe9c6527dd906dfdb6aa5a907ac6d01ab",
  phase2G_H1_Impl: "c0309407ea891cfa036f93d455f500694779c301",
  phase2G_H1_Evidence: "1ec8b2e68c93711dff17b39badcb0ab788b768f2",
  phase2GAudit: "f2e175886f888ce3ce42d5b1982f153971b75320",
  phase2G_E1: "2a4d81cefa6b3c32d6970fad8b9f985083fb24da",
  phase2Closure: "ac87286760bc9e0ce65427d98c7b4250ea1dc86f",
  phase3Master: "58439d90cfb0b786137454d21bc88f994fcd0270",
  phase3AImpl: "087a30ff6fcf75eec695825593e1a1f98ee383f4",
  phase3BImpl: "76d106724a129a4101981db88c7c1a4d086fb100",
  phase3BH1Impl: "ad85c9f1262635f9a81b5608b20c198a7b8b489d",
  phase3CImpl: "5deb63e96d9a11d44410e02eafe950d562032cbf",
  phase3CH1Impl: "1136c40ab1667e4a5b70185c8bef68ce67d675a2",
  phase3CH1Evidence: "2a573301f871ae506491ddbfa8f6407521b4b956",
  phase3DMaster: "28efece61800d4b6dd92465d3499e648268365a3",
  phase3DImpl: "4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9",
  phase3PublicAuthorityHardening:
    "5386f349eccd7c69ff696619ffc426757e3e91d0",
  phase3Reaudit: "5606b49ec753b8988213b6c912d7de5de51d52ee",
  phase3Closure: "04591e400f6b8efe7190ce01faef4da97d0eb984",
} as const;
