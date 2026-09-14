# Crew Builder

Crew Builder turns a natural-language request into a runnable mini app, then lets the user keep using, modifying, and controlling that same app by voice.

> Describe it. Use it. Change it.

## Architecture

Crew Builder is a standalone Android app. It does **not** require Crew Pocket, Codex, Antigravity, Termux, or a localhost server.

```text
Crew Builder APK
  ├─ Builder UI
  ├─ Gemini builder
  │    ├─ preferred model
  │    ├─ automatic model fallback
  │    └─ one bounded repair pass after deterministic validation
  ├─ Gemini Live voice runtime
  ├─ Generated App Runtime
  ├─ App Library / Versions / Undo
  └─ Native capability bridge
       ├─ storage
       ├─ vibration
       └─ Android share
```

Android application id / namespace:

```text
com.crewpocket.crewbuilder
```

The Android native layer calls Gemini `generateContent` for complete mini-app generation. Generated apps remain offline and sandboxed.

Gemini Live provides realtime voice interaction. New generated apps expose semantic actions and compact state through `crew.live`, while older apps still fall back to DOM control discovery.

## Models

Default `Auto` builder order:

1. `gemini-3.6-flash`
2. `gemini-3.5-flash`
3. `gemini-3.5-flash-lite`
4. `gemini-3.1-pro-preview`
5. `gemini-2.5-flash`

Complete mini-app code generation uses `generateContent`. Gemini Live is reserved for low-latency voice interaction and runtime app control.

## API key / BYOK

V1 uses BYOK. The Gemini API key is stored locally and encrypted with Android Keystore AES/GCM before being persisted in SharedPreferences. Legacy plaintext preferences are migrated automatically.

The key is never injected into generated HTML.

For a future service-managed public release, use an authenticated backend / short-lived credential flow rather than distributing a shared Gemini service key inside the APK.

## Generated app sandbox

Generated mini apps are HTML/CSS/JS rendered in a sandboxed iframe. Crew Builder injects a restrictive CSP that blocks external network access and dynamic external resources.

Generated apps can use:

```js
await crew.storage.get(key, fallback)
await crew.storage.set(key, value)
await crew.storage.remove(key)
await crew.storage.all()

await crew.vibrate(pattern)
await crew.share({ title, text, url })
```

### Semantic Live contract

Interactive generated apps are instructed to register intent-level actions instead of exposing only screen coordinates:

```js
crew.live.registerActions([
  {
    name: 'add_score',
    description: 'Add points to a player',
    parameters: { player: 'string', amount: 'number' }
  },
  {
    name: 'reset_game',
    description: 'Reset all scores',
    parameters: {}
  }
], async (name, args) => {
  // perform the same state update as the visible UI
});

crew.live.updateState({
  players: [
    { name: 'Amy', score: 3 },
    { name: 'Leo', score: 4 }
  ]
});
```

Live receives these actions and state when the session starts and can refresh them with `inspect_app`. Older apps continue to work through generic `click`, `set_input`, and `page_state` fallback actions.

## Validation and repair

Before a generated app becomes active, Crew Builder performs deterministic checks for:

- complete HTML structure and title
- maximum document size
- forbidden external scripts/styles/network APIs
- forbidden browser storage and parent/top access
- JavaScript syntax errors in inline scripts

If the first output fails validation, Crew Builder performs **one** focused Gemini repair pass. It does not run an open-ended agent loop.

## Persistence migration

Current browser storage uses `crew-builder.*` keys. Existing `crew-forge.*` app library, model preference, active app id, Live preferences, runtime state, and native Gemini key are migrated forward so upgrades do not wipe user data.

## Product loop

1. Describe a small tool or app.
2. Gemini generates one complete self-contained HTML app.
3. Crew Builder validates it and, only when needed, performs one repair pass.
4. Crew Builder immediately runs it full-screen.
5. `Modify` sends the current authoritative HTML plus the requested change to Gemini.
6. The updated HTML becomes a new local version.
7. `Undo` restores the previous version without conversation-state drift.
8. `Live` can inspect state and operate semantic app actions by voice.

## Android build

From the repository root:

```bash
gradle :app:assembleDebug
```

On Termux:

```bash
sh scripts/build-apk.sh
```

APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The build syncs root web runtime files into Android assets, and `MainActivity` inlines all runtime scripts into the WebView document.

## Branding

The launcher uses the selected **Magic Window** direction: a dark tilted app window, central creation spark, and generated UI blocks. Android 8+ uses an adaptive launcher icon with separate foreground/background layers.

## Current scope

Crew Builder is intentionally optimized for small instant apps: scoreboards, timers, decision tools, trackers, quizzes, flash cards, checklists, simple calculators, and lightweight games.

The generated-app contract forbids external network calls, external scripts, downloads, dynamic script loading, credential collection, payments, and other high-risk flows.
