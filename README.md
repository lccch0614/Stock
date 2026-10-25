# Stock Market Tycoon — V2 trading preview

Static multi-file site. Deploy **the contents of this folder** at the root of a public GitHub Pages repository, with `index.html` alongside `js/` and `styles/`. No build tools or paid services needed.

## V2 functionality
- Prior MVP stock markets, trades, candlestick chart, career, news and saved progress
- Short equity positions, restricted short proceeds, initial 50% additional collateral, daily simulated borrow fee and automatic margin liquidation at 30% maintenance ratio
- Long European cash-settled call and put options with 100-share multiplier, simplified Black–Scholes quotes, sell-to-close and automatic expiry settlement
- Portfolio equity includes liabilities and option mark-to-market; new derivatives page and trade ledger
- Save format migrates prior v1 local saves to v2; export a v1 JSON backup before updating.

## Deliberately not included
- Sell-to-open / naked short options, option spread strategies, American early exercise, accurate exchange microstructure, partial margin auto liquidations, real prices, Greeks display, full advanced career levels.
- Not a real brokerage or a research-grade pricing engine. Virtual money only.

## Testing
Run `node tests/regression.cjs` for original MVP regression. Run `node tests/v2-regression.cjs` for derivative calculations and accounting. End-to-end Safari and GitHub Pages deployment still require manual verification.

## Migration
For the same GitHub Pages origin, existing version 1 IndexedDB saves are loaded then enhanced with new derivative fields. If importing old JSON, v1 is supported. Keep an exported save before replacing a deployed version.
