# Stock Market Tycoon V2.3.0 — Strategy Academy

以原版 `Stock-Market-Tycoon-V2.2.zip` 為基礎的完整多檔案更新。原 ZIP SHA-256：`28f8a6df157f934ca8660e68b7ab78cc3177ad901081cde1d6b7afcd419dcc12`。

保留原版的 15 間虛構公司、可重播市場模擬、K 線及 MA20、市價／限價／止蝕賣單、股票買賣、沽空及借股費、期權鏈、IV／時間損益情境、Lv.1–3 生涯、新聞、交易紀錄、自動存檔與 JSON 匯入／匯出。

## 開始使用與 GitHub Pages

這是無需建置的靜態網站，遊戲本身沒有套件、CDN、API 或伺服器依賴。

1. 解壓 ZIP。
2. 將專案資料夾**內所有內容**上傳原本 GitHub repository 的網站根目錄，讓 `index.html` 位於根目錄，保留 `js/`、`styles/` 結構及 `.nojekyll`。
3. 沿用原本的 Pages 設定；若尚未設定，在 repository Settings → Pages 選擇 Deploy from a branch，再選分支及 `/ (root)`。
4. 開啟原本的 Pages 網址。檔案均使用 `./` 相對路徑，支援 `username.github.io/repository/` 子路徑。

本機測試可在專案目錄執行 `python3 -m http.server 8080`，再開啟 `http://localhost:8080/`。建議透過 HTTP 使用，避免直接開啟 `file://` 時的瀏覽器儲存限制。

這份交付沒有替你上傳或部署 GitHub Pages；請用原網站網址升級，瀏覽器儲存以來源網域為單位。不同網址或瀏覽器請以 JSON 備份搬移進度。

## V2.3.0 新增功能

- **重新開始生涯**：設定頁開啟確認視窗，可取消，可選先匯出 JSON。確認後重設現金、股價、日期、掛單、持倉、帳簿、歷史、生涯與教學狀態；先等候舊寫入完成。新存檔寫入失敗時保留記憶體中的舊生涯。備份下載由瀏覽器處理，按重啟前請保留實際下載檔案。
- **保護型 Sell to Open**：Covered Call 需每張 100 股未被使用的正股；Cash-secured Put 預留行使價 × 100 現金；Covered Put 需每張 100 股既有沽空股份，另預留行使價現金。禁止裸賣。
- **四種垂直價差**：Bull Call、Bear Put、Bull Put、Bear Call。同股、同到期、等量合約，一次確認整組成交或全部取消。
- **整組開平倉及到期結算**：支援部分組數平倉，全部腿同比例減少。禁止直接拆掉價差的一條腿。備兌認購可選擇連抵押股票一併平倉。
- **整組 P&L / Greeks**：多倉按 Bid、空倉按 Ask 估值；Delta、Gamma、Theta 和 Vega 依買賣方向及 100 股乘數相加。備兌策略另顯示含對應股票部位的 P&L 及 Delta。
- **8 步互動新手教學**：股票買入與賣出、沽空與回補、Call／Put／IV／DTE、Greeks、風險小測驗、建立價差及整組平倉。必須完成實際操作才推進。練習使用獨立帳戶；離開後回復生涯。可退出、略過、重玩，練習交易不會寫入生涯存檔。

## 模擬會計與結算規則

- 一張期權對應 100 股；每腿每張開倉、平倉各收 $1；到期無額外期權結算費。
- 多腿的現金流、ID、持倉及帳簿在私有副本完成後才提交；拒單或例外全部回復。
- 淨值 = 現金 + 正股市值 − 沽空負債 + 期權有號市值。空期權以負數入帳。抵押金仍屬資產，不能再從淨值扣一次。
- 可用資金 = max(0, 現金 − 受限沽空所得 − 沽空現值 × 50% − 買單預留 − 期權現金抵押)。賣出掛單和備兌期權亦分別鎖定股數，不能重複使用。
- 淨收入價差預留**整個行使價寬度 × 100 × 組數**；權利金收入仍在現金內，因此新增所需資金等於寬度減去淨收入。淨支出價差已支付最大到期風險，無額外現金抵押。
- Cash-secured Put 預留全數行使價現金；Covered Put 同樣預留全數行使價現金，並保留原本沽空保證金。這是本遊戲採用的保守規則，並非真實券商的組合保證金模型。
- 期權沿用原版的**歐式、到期現金結算**。沒有提早行使、提前指派或自動獲發股票。Cash-secured Put 到期會支付價內差額，股票持倉不增加。
- Covered Call 到期價內時，系統在同一交易中按現價出售對應抵押股票，並支付短 Call 的現金結算；合計收到行使價 × 股數，該結算股票出售不另收費。價外時保留及解鎖股票。提早連股票平倉則用一般股票 Bid 及交易費。
- 沽空沿用 50% 初始額外保證金、30% 維持比例、年化 3% 借股費。借股費每模擬日只記一次。強制回補前先整組平掉相關 Covered Put。跳空仍可造成負資產，Covered Put 並不限制股票沽空向上的虧損。
- 到期損益預覽已計開倉費，未計提早平倉費及未來借股費。即時 P&L 已計開倉費；真正平倉再計平倉費。Greeks：Delta 為股數、Gamma 為 Delta / $1、Theta 為 $ / 交易日、Vega 為 $ / IV 上升 1 百分點。跨股票 Delta 合計僅供查看，並非等價避險。
- Risk Management Score 延續原版的集中度及回撤評分，並非價差最大損失或券商風險評級。所有報價、IV 及財務資料都是模型模擬值。

## 存檔遷移

沿用 IndexedDB `stock-tycoon-mvp-v1` → store `saves` → key `main`，以及 localStorage `stock-tycoon-mvp-state`。V1、V2／V2.2 存檔讀取後遷移至 **schema 3 / gameVersion 2.3.0**；現金、RNG、市場價格、歷史及交易不重算。原期權各自成為一個長倉組別，原合約 ID 保留。

升級前請先匯出原版 JSON。新版本存檔不能保證由舊版讀回。格式損壞的存檔會停止自動覆寫，設定頁提供匯出原始資料。教學中的練習帳戶不自動保存；重新整理會載入生涯帳戶。

## 檔案與測試

- `index.html`、`styles/main.css`：入口與原有響應式介面。
- `js/core.js`、`trading.js`、`market.js`：原有核心、市場及股票交易。
- `js/options-pricing.js`、`options-market.js`：原有 Black–Scholes、IV 及期權鏈。
- `js/derivatives.js`：股票沽空、借股費及維持保證金。
- `js/options-strategies.js`：策略、原子交易、抵押、整組 P&L / Greeks 及到期。
- `js/derivatives-ui.js`、`onboarding.js`、`ui.js`：衍生品介面、教學及整體頁面。
- `js/storage.js`、`bootstrap.js`：存檔、遷移、重啟及啟動。
- `tests/`：原有三組回歸測試、新會計／遷移／重啟測試、DOM 操作測試。舊測試只調整模組載入及 schema 預期。
- `tests/fixtures/v22-save.json`：由原 V2.2 引擎產生的測試存檔，並非你的私人遊戲存檔。
- `TEST_REPORT.json`、`TEST_RESULTS.md`、`test-results/`：這次實際執行結果及驗證限制。

核心測試不需安裝套件：`npm test` 或 `node tests/run-all.cjs`。

DOM 測試先執行 `npm install` 安裝開發用 jsdom，再執行 `npm run test:ui`。完整測試及產生報告：`node tests/run-all.cjs --ui --report`。jsdom 驗證 DOM 事件與操作，不等於瀏覽器畫面或實機測試。

策略結構參考 Options Industry Council 教材：[Covered Call](https://www.optionseducation.org/strategies/all-strategies/covered-call-buy-write)、[Cash-secured Put](https://www.optionseducation.org/strategies/all-strategies/cash-secured-put)、[Bull Put Spread](https://www.optionseducation.org/strategies/all-strategies/bull-put-spread-credit-put-spread)。本遊戲的結算及抵押規則以上文為準。
