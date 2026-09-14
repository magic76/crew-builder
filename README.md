# Crew Forge

Crew Forge turns a natural-language request into a runnable mini app, then lets the user keep using and modifying that same app through conversation.

> Describe it. Use it. Change it.

## V0 product loop

1. Describe a small tool or app.
2. Crew Forge sends the request to the Crew Pocket AI backend.
3. The AI returns one complete self-contained HTML app.
4. Crew Forge runs it full-screen inside a sandboxed iframe.
5. `Modify` continues the same AI conversation so changes apply to the existing app.
6. Each accepted result becomes a local version and can be undone.

## Android V0

Crew Forge now has an Android shell under `android/`.

The APK does **not** generate Kotlin for each mini app. The native shell hosts the existing Forge web runtime in a WebView, while generated apps remain HTML/CSS/JS.

```text
Crew Forge APK
  ├─ Android WebView shell
  ├─ Forge UI / library / versions
  ├─ Native bridge
  │    ├─ vibration
  │    └─ share
  └─ Generated app sandbox
        │
        ▼
http://127.0.0.1:8000/api/*
        │
        ▼
Crew Pocket backend
        │
        ▼
Codex / Antigravity / other providers
```

The WebView loads bundled Forge HTML using `http://127.0.0.1:8000/` as its base URL. This keeps `/api/chat` same-origin with Crew Pocket and preserves the existing SSE streaming transport without adding a second backend.

### Build

Crew Pocket must be running locally on the Android device at `127.0.0.1:8000`.

From the repo root:

```bash
gradle :app:assembleDebug
```

On Termux, use the local ARM64-aware wrapper when the Android SDK is stored in the Crew Pocket cache:

```bash
sh scripts/build-apk.sh
```

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

GitHub Actions also builds and uploads a `crew-forge-debug` artifact on pushes and pull requests.

## Single-source web runtime

The root files are the source of truth:

```text
index.html
forge.css
forge.js
native-adapter.js
```

Before Android builds, Gradle copies these files into `android/app/src/main/assets/forge/`. Do not manually maintain a second copy of the UI.

## Runtime bridge

Generated apps are sandboxed. Capabilities are exposed through a narrow API:

```js
await crew.storage.get(key, fallback)
await crew.storage.set(key, value)
await crew.storage.remove(key)
await crew.storage.all()

await crew.vibrate(pattern)
await crew.share({ title, text, url })
```

Browser builds use browser APIs where available. Inside the Android APK, `native-adapter.js` routes vibration and sharing through `CrewNative`.

Runtime state is scoped per generated app and survives code revisions.

## Current V0 limitations

- Crew Pocket must already be running on the same Android device.
- Generated app metadata, HTML, versions, and runtime state currently live in WebView `localStorage`.
- No cloud sync or import/export yet.
- Runtime capabilities are intentionally small: storage, vibration, and share.
- Generated apps are HTML/CSS/JS only; no dynamic native code generation.
- Android V0 is portrait-only.

## Product goal

The immediate question is whether **describe → use → modify → reuse** feels useful enough that people start creating small one-off software instead of searching for an existing app.
