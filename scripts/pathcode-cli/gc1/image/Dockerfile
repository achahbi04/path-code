# PATH Code Engineering Image — GC1-b (v4)
# Extends Google's headless Cloud Workstations base (NO IDE).
# Toolchains only. Project dependencies stay in the repository.
#
# CONTRACT (do not violate):
# - Preserve /google/scripts/entrypoint.sh (inherited; do NOT override ENTRYPOINT)
# - Preserve /etc/workstation-startup.d/* (010_add-user.sh, 020_start-sshd.sh, …)
# - Do NOT set final USER to a runtime-created account (users are added at start)
# - Do NOT treat build-time /home/user as runtime authority (persistent home mounts dynamically)
# - Install toolchains into durable system paths (/usr/local, /opt), not /root/.cargo

# Pin upstream Workstations base by immutable digest (GC1-b provenance).
# Digest: sha256:50086f15b59f375ccc755659bd1b0c2e38347af4c6d739fff6fda8941fb19c38
FROM us-central1-docker.pkg.dev/cloud-workstations-images/predefined/base@sha256:50086f15b59f375ccc755659bd1b0c2e38347af4c6d739fff6fda8941fb19c38

USER root
ENV DEBIAN_FRONTEND=noninteractive

# Durable toolchain PATH — never /root/.cargo or build-stage-only HOME paths.
ENV PATH="/usr/local/go/bin:/usr/local/cargo/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin" \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    GOTOOLCHAIN=local

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl wget gnupg unzip zip \
    git git-lfs openssh-client bash \
    build-essential gcc g++ make cmake pkg-config \
    ripgrep fd-find jq \
    python3 python3-pip python3-venv \
    openjdk-17-jdk-headless \
    && ln -sf "$(command -v fdfind || echo /usr/bin/fdfind)" /usr/local/bin/fd || true \
    && git lfs install --system \
    && rm -rf /var/lib/apt/lists/*

# Node via NodeSource 22.x + corepack package managers (system-wide)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && corepack enable \
    && npm install -g npm@latest bun \
    && corepack prepare pnpm@latest --activate \
    && corepack prepare yarn@stable --activate \
    && rm -rf /var/lib/apt/lists/*

# Python tooling into system locations (pipx binaries → /usr/local/bin)
RUN python3 -m pip install --break-system-packages --no-cache-dir pipx uv \
    && PIPX_BIN_DIR=/usr/local/bin PIPX_HOME=/opt/pipx pipx install poetry || true \
    && ln -sf "$(command -v uv || true)" /usr/local/bin/uv || true \
    && (command -v pipx >/dev/null && ln -sf "$(command -v pipx)" /usr/local/bin/pipx || true)

# Go (system /usr/local/go) — also shim into /usr/local/bin because Cloud
# Workstations login profiles rewrite PATH and may drop image ENV ordering.
ARG GO_VERSION=1.23.6
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tgz \
    && rm -rf /usr/local/go \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz \
    && ln -sf /usr/local/go/bin/go /usr/local/bin/go \
    && ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt

# Rust — shared /usr/local/{rustup,cargo}. Workstations SSH commands are often
# non-login, so image ENV is not authoritative; wrap proxies with RUSTUP_HOME /
# CARGO_HOME and install a profile.d snippet for login shells.
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal \
    && /usr/local/cargo/bin/rustup component add rustfmt clippy \
    && /usr/local/cargo/bin/rustup default stable \
    && chmod -R a+rX /usr/local/rustup /usr/local/cargo \
    && for t in rustc cargo rustfmt rustup; do \
         printf '#!/bin/sh\nexport RUSTUP_HOME=/usr/local/rustup\nexport CARGO_HOME=/usr/local/cargo\nexport PATH="/usr/local/cargo/bin:/usr/local/go/bin:/usr/local/bin:$PATH"\nexec /usr/local/cargo/bin/%s "$@"\n' "$t" \
           > "/usr/local/bin/$t" \
         && chmod 0755 "/usr/local/bin/$t"; \
       done \
    && printf '#!/bin/sh\nexport RUSTUP_HOME=/usr/local/rustup\nexport CARGO_HOME=/usr/local/cargo\nexport PATH="/usr/local/cargo/bin:/usr/local/go/bin:/usr/local/bin:$PATH"\nexec /usr/local/cargo/bin/cargo clippy "$@"\n' \
         > /usr/local/bin/cargo-clippy \
    && chmod 0755 /usr/local/bin/cargo-clippy \
    && printf '%s\n' \
         'export RUSTUP_HOME=/usr/local/rustup' \
         'export CARGO_HOME=/usr/local/cargo' \
         'export PATH="/usr/local/go/bin:/usr/local/cargo/bin:/usr/local/bin:${PATH}"' \
         > /etc/profile.d/zz-pathcode-toolchains.sh \
    && chmod 0644 /etc/profile.d/zz-pathcode-toolchains.sh

# Maven + Gradle under /opt with /usr/local/bin shims
ARG MAVEN_VERSION=3.9.9
ARG GRADLE_VERSION=8.12.1
RUN curl -fsSL "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" -o /tmp/maven.tgz \
    && tar -C /opt -xzf /tmp/maven.tgz \
    && ln -sf "/opt/apache-maven-${MAVEN_VERSION}/bin/mvn" /usr/local/bin/mvn \
    && rm /tmp/maven.tgz \
    && curl -fsSL "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -o /tmp/gradle.zip \
    && unzip -q /tmp/gradle.zip -d /opt \
    && ln -sf "/opt/gradle-${GRADLE_VERSION}/bin/gradle" /usr/local/bin/gradle \
    && rm /tmp/gradle.zip

# Contract self-check at build time: Google startup model must remain intact.
RUN test -x /google/scripts/entrypoint.sh \
    && test -d /etc/workstation-startup.d \
    && test -e /etc/workstation-startup.d/010_add-user.sh \
    && test -e /etc/workstation-startup.d/020_start-sshd.sh \
    && echo "GC1B_IMAGE_CONTRACT_OK"

# Intentionally NO:
# - USER user          (user is created by 010_add-user.sh at runtime)
# - WORKDIR /home/user (persistent home is dynamically mounted)
# - ENTRYPOINT override (inherit /google/scripts/entrypoint.sh)
# - mkdir /home/user as runtime authority

# Stay as root for image metadata; Workstations entrypoint + startup scripts
# create the runtime user and switch context after persistent-home attach.
USER root
