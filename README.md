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

## Architecture

Crew Forge is the product UI and runtime. It intentionally does **not** duplicate Crew Pocket's provider/session infrastructure.

```text
Crew Forge
  ├─ App Library
  ├─ Generated App Runtime
  ├─ Version / Undo
  └─ Modify UI
        │
        ▼
Crew Pocket backend
  └─ POST /api/chat
        │
        ▼
Codex / Antigravity / other providers
```

By default the frontend expects the Crew Pocket API to be available at the same origin. The next integration step is to make the backend origin configurable so Crew Forge can run as a completely separate shell while still using Crew Pocket as its AI service.

## Runtime bridge

Generated apps do not receive same-origin access to Crew Forge. Small capabilities are exposed through a narrow bridge:

```js
await crew.storage.get(key, fallback)
await crew.storage.set(key, value)
await crew.storage.remove(key)
await crew.storage.all()

await crew.vibrate(pattern)
await crew.share({ title, text, url })
```

Runtime state is scoped per generated app and survives code revisions.

## V0 limitations

- Generated app metadata, HTML, versions, and runtime state currently live in browser `localStorage`.
- No cloud sync or import/export yet.
- Runtime capabilities are intentionally small: storage, vibration, and share.
- The frontend currently expects Crew Pocket API routes on the same origin.
- Generated apps are HTML/CSS/JS only; no dynamic native code generation.

## Development direction

The immediate goal is to validate one question: does the loop of **describe → use → modify → reuse** feel useful enough that people start creating small one-off software instead of searching for an existing app?
