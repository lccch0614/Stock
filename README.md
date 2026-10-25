# Stock Market Tycoon MVP 1.1

Modular refactor of the tested single-file MVP 1.0. No options/shorting yet.

## Play

Deploy **the entire directory contents** to a GitHub Pages repo root (index.html, js/, styles/). Or use a local server: `python3 -m http.server 8000` from this directory and open http://localhost:8000.

The old single-file 1.0 works independently. Do not upload index.html alone for 1.1.

## Compatibility

IndexedDB name remains `stock-tycoon-mvp-v1` and save version remains 1 to load existing 1.0 saves on **the same GitHub Pages origin and repository URL**. Always export a JSON backup from 1.0 before updating. Different domains or repo paths do not automatically share local saves.

## Structure

- `index.html`: page shell
- `styles/main.css`: responsive styles
- `js/core.js`: initial state, deterministic RNG, account and trade primitives
- `js/trading.js`: orders and fulfillment
- `js/market.js`: market turns, macro events, career rules
- `js/storage.js`: IndexedDB/localStorage, export/import, schema verification
- `js/ui.js`: charts, navigation, forms, display and interaction
- `js/bootstrap.js`: initialization and backward compatible test hooks
- `tests/regression.cjs`: Node + VM checks for trade rules, market and compatibility

**Architecture note:** Scripts are separated into ordered plain scripts and intentionally share top-level bindings. This keeps behavior identical to MVP 1.0 without requiring a build step. Future versions should replace shared globals with explicit ES module exports and dependency injection.

## Test

`node tests/regression.cjs` tests the market/trading core in an isolated VM. Browser smoke tests should cover UI, reload, and file import/export.

## Roadmap

V2: short selling and options (not included here).
