# AGENTS.md — SillyTavern-DirectInjector

## What this is
A SillyTavern third-party extension (client-side JS). Adds a floating panel with injection buttons and scenario chains for directing AI roleplay.

**No build, test, lint, or CI.** Edit files → restart/reload SillyTavern to verify.

## Key files
| File | Role |
|---|---|
| `index.js` | All logic (~1140 lines). Entry point is the jQuery `$(async () => {...})` block at the bottom. |
| `style.css` | Panel and settings styles. |
| `manifest.json` | SillyTavern extension manifest. `display_name` is "Lorebook Keys" (legacy name). `js: "index.js"`, `css: "style.css"`. |
| `settings.html` | Empty / unused. |

## Architecture notes
- **Runtime:** Browser JS inside SillyTavern. Uses jQuery, SillyTavern's `extension_settings`, `eventSource`, and `SlashCommandParser`.
- **Import paths** in `index.js` are relative to SillyTavern's `data/default-user/` root (e.g. `../../../extensions.js`). Do NOT change these.
- **Settings persistence:** Stored in `extension_settings["lorebook_keys"]`. The extension key is `lorebook_keys` (legacy name). Saved via `saveSettingsDebounced()`.
- **Slash commands used:** `/inject`, `/flushinject`, `/delete 1`, `/trigger`. Relies on SillyTavern-LALib for `/flushinject`.
- **Events:** Listens to `MESSAGE_RECEIVED` (advances chains, clears ephems) and `CHAT_CHANGED` (full state reset).

## Conventions / gotchas
- Button IDs are derived from labels via `.replace(/[^a-zA-Z0-9]/g, '_')`. Non-alphanumeric labels will collide if they sanitize to the same ID.
- Chains are **always ephemeral** regardless of the UI toggle.
- `settings.html` is empty and unused — all settings UI is injected dynamically from `index.js` via `injectSettingsMenu()`.
- The manifest `display_name` ("Lorebook Keys") and `extensionKey` differ from the repo/folder name ("DirectInjector"). This is intentional legacy naming.

## How to verify changes
1. Edit `index.js` or `style.css`.
2. Restart SillyTavern or reload the page.
3. Open the extension via the bolt (⚡) icon in the top bar.
4. Check browser devtools console for `[Lorebook Keys] Loaded.` and any errors.
