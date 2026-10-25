# Stock Market Tycoon — MVP 1.0

A standalone single-page virtual stock market career game (Traditional Chinese UI), containing no external dependencies.

## Start

Open `index.html` in a current desktop or mobile browser, or serve the folder using `python -m http.server 8000`. For reliable IndexedDB persistence, GitHub Pages or an HTTP localhost server is recommended.

For GitHub Pages: upload `index.html` to the repository root, and in Settings → Pages select Deploy from a branch → main → / (root).

## MVP features

- 15 fictional companies and fundamentals-aware stochastic daily price simulation, news, quarterly changes, regime shifts.
- Simulation pause, play, 1×/2×/5× and jump to next trading day.
- Interactive stock selection and candlestick chart with MA20, account equity chart.
- Market orders, limit orders, stop-sell orders, cancel orders.
- Cash ledger, cost-basis positions, realized and unrealized P&L, trade history, orders.
- Basic risk score, portfolio overview, level 1→2 career conditions.
- IndexedDB autosave (localStorage fallback); JSON export/import.
- Responsive desktop/mobile interface.

## Limitations / known simplifications

- Fictional companies and simulation only; no real stock trading or investment advice.
- V2 features (options, short selling, margin) and V3 (fund management) are NOT implemented.
- Daily OHLC candles are simulated from daily time steps. Intraday matching is approximated and has no actual order book or volume-depth fills. Gap fills are approximations.
- Stop orders are sell-stop only; no trailing stops or stop-buy orders.
- Simplified model for quarterly EPS/revenue; not audited accounting statements.
- A browser-only save is not tamper-proof. Multiple tabs should not be used concurrently; robust cross-tab ownership is future work.
- File access restrictions and storage quotas vary by browser. Export JSON backups.
- MVP charts include MA20; MA50 / RSI / MACD are deferred.
- Historical equity sampling occurs at daily close, so on-demand intraday trades do not immediately append to history until the next day.

## Verification

Ran a Node VM engine smoke test: initial account equity; buy 10 shares; sell 5 shares; reject short sale without shares; advance 400 market days; confirm positive stock prices and valid state structure. Browser end-to-end tests could not be completed in the present sandbox due to browser navigation restrictions; test in actual deployment before considering mobile/save/GUI interactions fully verified.
