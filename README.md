# Crew Forge

Crew Forge turns a natural-language request into a runnable mini app, then lets the user keep using and modifying that same app.

> Describe it. Use it. Change it.

## Gemini-only V1

Crew Forge is now a standalone Android app. It does **not** require Crew Pocket, Codex, Antigravity, Termux, or a localhost server.

```text
Crew Forge APK
  ├─ Forge UI
  ├─ Gemini builder
  │    ├─ preferred model
  │    └─ automatic model fallback
  ├─ Generated App Runtime
  ├─ App Library / Versions / Undo
  └─ Native capability bridge
       ├─ storage
       ├─ vibration
       └─ Android share
```

The Android native layer calls the Gemini `generateContent` REST API. This keeps Gemini networking outside generated mini apps and avoids WebView CORS issues.

## Models

The model strategy follows the resilient fallback approach used in `crew-story`.

Default `Auto` order:

1. `gemini-3.6-flash`
2. `gemini-3.5-flash`
3. `gemini-3.5-flash-lite`
4. `gemini-3.1-pro-preview`
5. `gemini-2.5-flash`

The user may select a preferred model. If it is unavailable, Forge automatically falls back through the compatible list.

Gemini Live is intentionally not the HTML generation transport in this version. Live is a better fit for a future realtime voice layer; complete mini-app code generation uses `generateContent` so Forge can reliably receive one full HTML document.

## API key / BYOK

V1 uses BYOK for development and private testing. The Gemini key is stored in Crew Forge's own Android `SharedPreferences` and is never injected into generated HTML.

For a public production release, replace BYOK with an authenticated backend / short-lived credential flow before distributing a shared service credential. Do not hard-code a production Gemini API key into the APK.

## Generated app sandbox

Generated mini apps are HTML/CSS/JS rendered in a sandboxed iframe. Forge injects a restrictive CSP that blocks external network access and dynamic external resources.

Generated apps can use:

```js
await crew.storage.get(key, fallback)
await crew.storage.set(key, value)
await crew.storage.remove(key)
await crew.storage.all()

await crew.vibrate(pattern)
await crew.share({ title, text, url })
```

Generated apps cannot directly receive the Gemini API key.

## Product loop

1. Describe a small tool or app.
2. Gemini generates one complete self-contained HTML app.
3. Forge immediately runs it full-screen.
4. `Modify` sends the current authoritative HTML plus the requested change to Gemini.
5. The updated HTML becomes a new local version.
6. `Undo` restores the previous version without conversation-state drift.

## Android build

```bash
cd android
./gradlew assembleDebug
```

APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The build syncs the root web runtime into Android assets, so the root HTML/CSS/JS remains the single source of truth.

## Current V1 scope

Crew Forge is intentionally optimized for small instant apps: scoreboards, timers, decision tools, trackers, quizzes, flash cards, checklists, simple calculators, and lightweight games.

The generated-app contract currently forbids external network calls, external scripts, downloads, dynamic script loading, credential collection, payments, and other high-risk flows.
