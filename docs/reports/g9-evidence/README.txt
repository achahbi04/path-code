G9 evidence layout
==================

cold/          Rust + Java cold-start prepare + compile/test proofs
scip/          Monorepo SCIP fingerprint + MCP prepare
docker/        Compose detection (Docker missing on acceptance host)
live-repos/    Tiny fixtures (rust-cold, java-cold, scip-mono, compose-svc)
run-prepare.mjs  Harness for prepareEngineeringEnvironment captures

runtime-*/     PATH-owned mise toolchains (gitignored; regenerable)
