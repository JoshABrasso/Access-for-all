# Access for All

MIT-licensed accessibility-first website starter for teams who want to clone a repo and start building immediately.

Built from a cleaned production engine, this repo ships a static frontend starter in [`frontend/`](frontend/) with:

- A full accessibility settings engine
- Token-driven CSS architecture
- A minimal keeper page plus optional demo and reference pages
- No build step required

## Why This Repo Exists

Most starters still treat accessibility as something to add later.

This one starts with it already wired in:

- Theme, palette, contrast, font, spacing, motion, transparency, and reading controls
- Talkback and page read-aloud support where the browser allows it
- Landmark highlighting, focus boosting, and media dimming
- A reusable modal/drawer UI already connected to the runtime engine

## Quick Start

Open [`frontend/index.html`](frontend/index.html) directly, or serve the folder locally:

```bash
cd frontend
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## What You Get

- [`frontend/index.html`](frontend/index.html) is the clean starter page to build from.
- [`frontend/pages/demo.html`](frontend/pages/demo.html) is an optional proof page for checking engine behaviour.
- [`frontend/pages/engine.html`](frontend/pages/engine.html) is an optional implementation reference.
- [`frontend/scripts/accessibility-engine.js`](frontend/scripts/accessibility-engine.js) contains the runtime state engine.
- [`frontend/scripts/site-ui.js`](frontend/scripts/site-ui.js) wires the modal, drawers, consent UI, and form helpers.
- [`frontend/styles/`](frontend/styles/) contains the token, layout, component, and accessibility layers.

## Structure

- `frontend/index.html` is the minimal keeper page for new builds.
- `frontend/pages/demo.html` is an optional proof page for checking engine behavior.
- `frontend/pages/engine.html` is an optional implementation reference.
- `frontend/scripts/accessibility-engine.js` contains the runtime state engine.
- `frontend/scripts/site-ui.js` wires the modal, drawers, consent UI, and form helpers.
- `frontend/styles/` contains the token, layout, component, and accessibility layers.

## Verified Starter State

- HTML entry pages load locally with no build tooling required.
- Shared CSS imports resolve correctly from `styles/master.css`.
- Core engine and UI scripts are present and linked on all shipped pages.
- Bundled accessibility fonts are included in the repo.
- Optional demo/reference pages are marked as optional and can be removed later.

## Notes

- The internal `--gm-*`, `gm-accessibility-*`, and `gm-consent-*` prefixes are retained for runtime stability and backwards compatibility.
- The repo license is MIT, but bundled third-party assets keep their own licenses where required.
- See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for bundled asset notices.

## License

Project code is released under the [MIT License](LICENSE).
