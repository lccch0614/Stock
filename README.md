# Stock Market Tycoon V2.2 — Options Terminal

Open `index.html` through GitHub Pages or any static local server. Upload the contents of this folder (not the enclosing directory) into your GitHub repository root.

## New in V2.2
- Integrated Options Chain (11 strikes, 5 expiries) with model-generated Bid/Ask, IV and Delta.
- Black–Scholes Greeks (Delta, Gamma, Theta per trading day, Vega per 1 percentage point IV).
- Risk/cost preview using actual execution Ask, exit Bid.
- Expiry and pre-expiry P&L scenarios; IV and time sliders/selectors.
- Options portfolio mark-to-Bid and unrealized P&L.
- Continued V2.1 equity, shorting, margin and career mechanics.

## Technical limits
- Fictional companies and modeled European cash-settled long options. No naked short options or multi-leg spreads.
- The illustrative simulated IV and Bid/Ask are model assumptions, not real exchange prices.
- Theoretical scenario P&L is not a guaranteed execution quote.
- Uses same V2.1 IndexedDB key and JSON save schema (version 2). Export a JSON backup before upgrading.
- Full brokerage fidelity, American exercise, short-option margin are intentionally excluded.

## Tests
Run `node tests/regression.cjs`, `node tests/v2-regression.cjs`, and `node tests/v22-regression.cjs` from project root.
