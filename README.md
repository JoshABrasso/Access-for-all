# Access for All

> An accessibility engine built to help reopen digital doors that checkbox accessibility has quietly closed.

Access for All is an MIT-licensed accessibility engine designed to be built into a site from the start, not bolted on afterwards.

It gives people meaningful control over presentation, readability, comfort, and orientation without breaking the design, without forcing a framework, and without requiring a build step just to get started.

## Why It Matters

Most websites still treat accessibility as a checklist item.

That leaves people stuck with interfaces that may technically pass a standard while still being hard to read, tiring to use, or impossible to adapt to individual needs.

Access for All starts from a harder truth: many digital doors have been closed again.

Tick-box accessibility has too often helped create a world where digital surfaces, public interactions, sign-ins, forms, kiosks, booking journeys, and service touchpoints are called accessible while still shutting people out in practice.

We want those doors reopened.

Access for All takes a different approach:

- Let people change the page to suit them
- Keep those preferences consistent across pages
- Preserve the site structure instead of replacing it with a separate experience
- Make accessibility part of the product, not an apology after launch
- Treat accessibility as practical access, not paperwork

## What The Engine Does

Built into this starter already:

- Theme controls: default, light, dark
- Colour controls: palette changes, contrast levels, visual filters
- Reading controls: text size, line spacing, paragraph spacing, letter spacing, word spacing
- Font controls: site font, hyperlegible, dyslexia-friendly, system sans
- Comfort controls: motion reduction, transparency reduction, depth reduction
- Orientation controls: reading mode, reading guide, landmark highlighting, stronger focus states
- Media controls: dim imagery to reduce visual noise
- Talkback support: spoken feedback and page read-aloud where the browser supports it
- Preference persistence: saved locally so the experience stays consistent

## Why Teams Use It

- Static-first and framework-agnostic
- No dependency on React, Vue, or a component library
- Easy to branch, clone, and adapt for client work
- Token-driven CSS structure that is simple to reskin
- Built-in demo and reference pages for onboarding teams quickly
- MIT licensed so it can be adopted, extended, and commercialised freely
- Designed as an engine model that can be carried into websites, apps, tools, kiosks, portals, and other digital surfaces

## Who It Is For

- Freelancers who want a stronger starting point for accessible client sites
- Agencies that need a reusable frontend engine across projects
- Founders who want accessibility built in before launch
- Developers who want practical controls instead of an empty “accessible by default” claim
- Organisations that want to show accessibility as a visible product strength

## Repo At A Glance

- [`frontend/index.html`](frontend/index.html): the clean keeper page for new builds
- [`frontend/pages/demo.html`](frontend/pages/demo.html): optional demo page to show the engine in action
- [`frontend/pages/engine.html`](frontend/pages/engine.html): optional implementation reference
- [`frontend/scripts/accessibility-engine.js`](frontend/scripts/accessibility-engine.js): runtime engine state and preference handling
- [`frontend/scripts/site-ui.js`](frontend/scripts/site-ui.js): modal, drawer, consent UI, and interaction wiring
- [`frontend/styles/`](frontend/styles/): token, layout, component, and accessibility layers

## Quick Start

Clone it, open the starter, and begin building:

```bash
cd frontend
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

No build step is required.

## What Makes This Different

Most accessibility overlays try to sit on top of a finished website.

This engine is meant to live inside the site itself.

That means:

- the controls are part of the real interface
- the layout, tokens, and components respond together
- the visitor keeps the same page, just adapted to their needs
- your team can extend the engine rather than work around it

It is also meant to grow beyond a single website.

The idea behind Access for All is bigger than one frontend starter: it is an engine model that can be built upon and adapted to run across anything with a digital interface.

That includes:

- websites
- web apps
- internal tools
- booking systems
- customer portals
- kiosk-style public interfaces
- service check-in flows
- future desktop or mobile surfaces that need the same accessibility logic

## Ready To Sell, Ready To Build On

This repo is set up so you can:

- use it as a public starter
- branch it for client work
- customise the look without rebuilding the engine model
- keep the optional demo and documentation pages during development
- remove the demo/reference pages later and ship only the production-facing build
- build on the engine concept itself and carry it into other platforms and interaction models

## Verified Starter State

- HTML entry pages serve correctly as static files
- Shared CSS imports resolve correctly from `styles/master.css`
- Core engine and UI scripts are linked and parse cleanly
- Bundled accessibility fonts are included in the repo
- Optional demo and reference pages are already wired and working

## Licensing

Project code is released under the [MIT License](LICENSE).

Bundled third-party assets keep their own licenses where required. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Positioning Line

If you want a short repo description for GitHub’s sidebar, use:

`Accessibility engine built to reopen digital doors with real user controls for reading, contrast, motion, focus, and comfort.`
