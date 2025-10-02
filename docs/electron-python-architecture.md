# Electron + Python Architecture Overview

## 1. Overall Architecture

### 1.1 Runtime Components
```
┌───────────────┐        IPC (contextBridge)        ┌────────────────────┐
│ Electron Main │ ─────────────────────────────────▶│ Renderer (web UI)  │
│  (Node.js)    │◀──────────────────────────────────┤  + preload bridge   │
└─────┬─────────┘                                   └─────────┬──────────┘
      │                                                        │
      │ spawn + stream stdout/stderr                           │ HTTPS/WebSocket
      ▼                                                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Managed Python env (.venv) + ComfyUI server (uv-managed interpreter) │
└──────────────────────────────────────────────────────────────────────┘
```
- `AppWindow` creates the single `BrowserWindow`, queues messages until the renderer sets itself ready, and exposes helpers for ComfyUI loading.【F:src/main-process/appWindow.ts†L1-L113】【F:src/main-process/appWindow.ts†L188-L227】
- `ComfyServer` owns process orchestration for the bundled `main.py`, wiring logs and status updates back to the UI through IPC while waiting for the HTTP API to come online.【F:src/main-process/comfyServer.ts†L21-L193】
- The preload script exposes a typed bridge so renderer code never touches Node APIs directly but instead talks to main through channelled IPC calls.【F:src/preload.ts†L1-L195】

### 1.2 Communication Layer
- IPC channel names and install progress enums are centralised in `constants.ts`, ensuring renderer and main stay in sync for telemetry, install validation, and download events.【F:src/constants.ts†L60-L160】
- The preload bridge forwards progress, logs, download controls, validation requests, and lifecycle commands, while also letting the renderer request system paths and restart actions.【F:src/preload.ts†L113-L209】【F:src/preload.ts†L216-L341】
- When Python starts, `ComfyServer` streams stdout/stderr into Electron logs and relays them over IPC so the renderer’s installer UI can present live feedback.【F:src/main-process/comfyServer.ts†L136-L155】

## 2. Python & AI Dependencies

### 2.1 Bundled Assets and Version Pinning
- Versions for ComfyUI core, frontend, ComfyUI-Manager, and the `uv` Python tool are pinned inside `package.json` so every build pulls the same Git tags and binaries.【F:package.json†L12-L23】
- `make:assets` clones the exact repositories and commits, builds the frontend, fetches UV for every OS, and applies local patches so the packaged bundle is reproducible across machines.【F:scripts/makeComfy.js†L5-L24】
- Electron Builder copies ComfyUI sources, UV binaries, and UI assets into the packaged application via `extraResources`, guaranteeing they ship alongside the app on all platforms.【F:builder-debug.config.ts†L3-L26】

### 2.2 Virtual Environment Provisioning
- `VirtualEnvironment` wraps UV to create a `.venv`, select Python versions per OS, and set interpreter paths (`Scripts/python.exe` on Windows vs `bin/python` elsewhere).【F:src/virtualEnvironment.ts†L109-L206】
- The class builds OS-specific paths to the bundled `uv` binary and compiled `requirements` snapshots, allowing offline installation when possible.【F:src/virtualEnvironment.ts†L185-L231】
- Environment creation reuses existing venvs when healthy, otherwise runs `uv venv`, `ensurepip`, and targeted requirement installs with fallback to manual pip installs (including macOS-specific flows for MPS).【F:src/virtualEnvironment.ts†L266-L385】
- GPU selection influences package mirrors (CUDA vs Metal vs CPU) by adjusting Torch download URLs and mirrors at install time.【F:src/virtualEnvironment.ts†L77-L101】【F:src/virtualEnvironment.ts†L159-L183】

### 2.3 AI Model Handling
- During first launch users choose a ComfyUI base path; config and model locations are persisted per-OS so large checkpoints live outside the app bundle.【F:README.md†L63-L81】
- The `DownloadManager` centralises checkpoint downloads, keeps them inside the configured models directory, exposes pause/resume/cancel IPC hooks, and renames temporary files only after successful completion to avoid corruption.【F:src/models/DownloadManager.ts†L35-L174】

### 2.4 Distribution of Large Dependencies
- UV archives for Windows, macOS, and Linux are downloaded once, unpacked under `assets/uv/<platform>`, and slimmed during packaging (non-target binaries removed), keeping installers smaller while retaining offline Python provisioning.【F:scripts/downloadUV.js†L12-L82】【F:scripts/todesktop/afterPack.cjs†L20-L56】
- Compiled requirement files allow bulk dependency installation without hitting PyPI for every package; the app falls back to vanilla requirements when mismatches are detected, which keeps upgrades resilient.【F:src/virtualEnvironment.ts†L363-L385】【F:src/virtualEnvironment.ts†L279-L309】

## 3. Operating System–Specific Handling

### 3.1 Windows
- Packaged via NSIS with resources under `%APPDATA%\Local\Programs\comfyui-electron` and user data in `%APPDATA%\ComfyUI`, isolating binaries from user-generated models.【F:README.md†L39-L49】
- Build hooks install a compatible Python 3.12 runtime on CI/CD hosts before `yarn install`, and ensure Windows PATH includes the user script directory when running `make:assets`.【F:scripts/todesktop/beforeInstall.cjs†L13-L27】【F:scripts/preMake.js†L22-L37】
- The venv logic automatically chooses `Scripts/python.exe` and PowerShell activation scripts, shielding users from manual environment tweaks.【F:src/virtualEnvironment.ts†L202-L256】
- After packing, only the Windows UV binary is retained in `resources/uv`, keeping the installer lean while preserving offline execution.【F:scripts/todesktop/afterPack.cjs†L45-L55】
- Custom NSIS script entries manage uninstall options (deleting venv, cached updates, or full base paths) so Python artifacts do not linger after removal.【F:scripts/installer.nsh†L1-L140】

### 3.2 macOS
- Distributed as a DMG, storing user content under `~/Library/Application Support/ComfyUI` while the app lives in `/Applications`, aligning with macOS sandbox expectations.【F:README.md†L51-L58】
- Packaging hook removes `.git` folders, copies assets into `Contents/Resources`, and strips non-macOS UV binaries before fixing execution bits, easing notarisation and codesigning.【F:scripts/todesktop/afterPack.cjs†L20-L43】
- Shell activation strings default to `source <venv>/bin/activate`, keeping Terminal integrations consistent with zsh/bash defaults.【F:src/virtualEnvironment.ts†L249-L256】

### 3.3 Linux
- User data is stored under `~/.config/ComfyUI`; AppImage is configured as the target format in Electron Builder for broad distro compatibility.【F:README.md†L59-L61】【F:builder-debug.config.ts†L21-L24】
- UV binaries for Linux are bundled and selected at runtime, and activation uses POSIX shell semantics identical to macOS paths.【F:src/virtualEnvironment.ts†L207-L220】【F:src/virtualEnvironment.ts†L249-L252】

### 3.4 Abstracting Environment Differences
- `getAppResourcesPath` resolves to `process.resourcesPath` in packaged mode vs local `assets` during development, so the same code paths locate Python, UV, and requirements files across OSs.【F:src/install/resourcePaths.ts†L1-L6】
- UV commands inherit a curated environment (`UV_PYTHON_INSTALL_MIRROR`, `VIRTUAL_ENV`) supplied by `VirtualEnvironment`, ensuring consistent behavior regardless of shell defaults or PATH differences.【F:src/virtualEnvironment.ts†L126-L156】

## 4. Local User Execution
- First-run setup guides users through base path selection and environment validation; IPC channels surface validation results so the renderer can block until Python is ready.【F:src/constants.ts†L86-L115】【F:src/preload.ts†L385-L416】
- Creating or repairing the Python environment is fully automated: UV downloads Python, installs requirements, validates imports, and reports errors with Sentry links when something unexpected occurs.【F:src/virtualEnvironment.ts†L266-L327】
- Once the venv is ready, `ComfyServer` launches `main.py`, streams logs to the renderer, and waits for the `/queue` endpoint before signalling readiness, meaning end-users never touch Python CLIs manually.【F:src/main-process/comfyServer.ts†L136-L193】
- Model downloads, log viewing, and base path changes are exposed via preload helpers, making advanced file operations accessible from the UI without shell knowledge.【F:src/preload.ts†L155-L209】【F:src/preload.ts†L170-L186】
- Auto-updates pull newer ComfyUI builds and UV binaries via the asset pipeline, leveraging the same pinned version metadata used during development builds.【F:README.md†L18-L25】【F:package.json†L12-L40】

## 5. Maintainability & Reproducibility
- Dependency versions (Node, Electron, ComfyUI, UV) are locked in `package.json`, while scripts (`make`, `make:nvidia`, `verify:build`) provide a single entry point for cross-platform packaging and verification runs.【F:package.json†L24-L60】
- Asset generation scripts clone exact tags/commits, download deterministic binaries, and clean Git metadata before packaging, producing consistent artifacts across CI and local machines.【F:scripts/makeComfy.js†L11-L24】【F:scripts/todesktop/afterPack.cjs†L20-L55】
- The virtual environment verifies installed packages via dry-run `pip install --dry-run` checks and targeted import tests, catching drift before users encounter runtime failures.【F:src/virtualEnvironment.ts†L279-L323】【F:src/virtualEnvironment.ts†L357-L385】
- Downloaded UV archives can be shared across builds (`downloadUV all`), making multi-platform CI/CD jobs deterministic even without native Python installed on the agents.【F:scripts/downloadUV.js†L31-L82】
- Electron Builder configuration and platform-specific hooks (preMake, ToDesktop hooks) encapsulate OS quirks in scripts, so the same `yarn make` pipeline can drive Windows, macOS, and Linux outputs reproducibly.【F:builder-debug.config.ts†L3-L26】【F:scripts/preMake.js†L6-L39】

## 6. Setting Up a Similar Multi-OS App
1. **Define version sources** in `package.json` (or similar manifest) so both build scripts and runtime code know which Python/AI assets to ship.【F:package.json†L12-L40】
2. **Download and stage Python/AI assets** during a pre-build step, mirroring `make:assets` to clone repositories, fetch models/tooling, and normalise folders per OS.【F:scripts/makeComfy.js†L11-L24】
3. **Bundle platform-specific helpers** via Electron Builder `extraResources`, then prune foreign binaries post-pack (`afterPack`) to keep installers slim and notarisation-friendly.【F:builder-debug.config.ts†L5-L25】【F:scripts/todesktop/afterPack.cjs†L20-L56】
4. **Wrap Python execution** in a dedicated controller that provisions venvs, installs requirements, and surfaces logs/events over IPC so the renderer can visualise progress like Comfy Desktop does.【F:src/virtualEnvironment.ts†L266-L385】【F:src/main-process/comfyServer.ts†L136-L193】
5. **Expose renderer APIs** through a preload bridge that mirrors all Python lifecycle controls, downloads, and telemetry, keeping the frontend framework agnostic of Node internals.【F:src/preload.ts†L113-L341】
6. **Handle OS quirks via scripts** (installers, PATH setup, notarisation) and keep them isolated—Windows-specific Python bootstrapping lives in build hooks and NSIS scripts, macOS permissions in after-pack steps, and Linux targets in builder config.【F:scripts/todesktop/beforeInstall.cjs†L13-L27】【F:scripts/installer.nsh†L1-L140】【F:builder-debug.config.ts†L21-L24】

Following these patterns yields an Electron desktop app that ships a managed Python environment, heavyweight AI dependencies, and GPU-specific optimisations without requiring end-users to install or configure Python manually.
