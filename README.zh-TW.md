# playwright-e2e-arm64

[English](README.md)

本專案是在 ARM64 Linux 伺服器（Oracle Cloud Ampere A1）上以 headless 模式執行的 Playwright 端對端測試環境，
並附有專屬的小型受測系統 **Quick Transfer**：一個由 Node API 支援的 React 轉帳表單。

系統完整規格請見 **[docs/SPEC.zh-TW.md](docs/SPEC.zh-TW.md)**，內容包括附編號的業務規則、確切的錯誤訊息、
API 規格與檢查順序、邊界值，以及刻意保留的已知限制。測試案例應可追溯至這些規則編號。

## 目前狀態

| | |
|---|---|
| 環境 | 可正常運作：Playwright 自動啟動兩個伺服器、執行 headless Chromium，並產出 HTML 報告 |
| 測試 | 1 支冒煙測試，通過 |
| 驗證環境 | Ubuntu 24.04.4 LTS · aarch64 · Node 20.20.2 · Playwright 1.62.1 |
| 下一步 | 依規格設計功能測試案例；以 ARM64 runner 執行 GitHub Actions |

```
Running 1 test using 1 worker
  ✓  1 [chromium] › tests/smoke.spec.ts:5:1 › home page loads and shows the balance from the API (1.6s)
  1 passed (5.5s)
```

## 技術選型

| 層級 | 選擇 | 理由 |
|---|---|---|
| 測試框架 | `@playwright/test` 1.62.1 | 自動等待、追蹤紀錄，瀏覽器與 HTTP 測試使用同一套 API |
| 瀏覽器 | Playwright 內建 Chromium | Google 未提供 Linux ARM64 版的 Chrome |
| 介面 | React 19 + Vite 8 | 輕量、啟動快，內建 `/api` 代理 |
| API | Node `node:http`，不使用框架 | 除業務規則本身外，無須額外說明 |
| 資料 | 存於記憶體，可重置 | 每次測試都從已知的初始資料開始 |

所有版本均於 `package.json` 中固定為確切版本。

## 專案結構

```
.
├── api/server.js          API：健康檢查、帳戶、轉帳、測試重置掛勾
├── shared/rules.js        驗證規則與訊息，由介面與 API 共用
├── web/                   React 介面（index.html、src/App.jsx、src/main.jsx）
├── tests/smoke.spec.ts    冒煙測試
├── playwright.config.ts   測試設定，每個選項均附註解
├── vite.config.js         開發伺服器使用 5273，將 /api 轉發至 8281
└── docs/SPEC.zh-TW.md     系統規格書（英文版為 docs/SPEC.md）
```

## 快速開始

需要 Node **20.19 以上**（Vite 8 的要求）。

```bash
npm ci
npx playwright install chromium   # 僅首次需要；已有快取則會略過
npm test
```

Playwright 會自行啟動 API（啟用測試掛勾）與介面，執行測試後再將兩者關閉。
執行前不需要、也不應該有任何服務占用 5273 或 8281 連接埠（原因見下方設定說明）。

在全新的 Ubuntu 主機上，Chromium 另需系統函式庫：
`sudo npx playwright install-deps chromium`。

### 其他指令

| 指令 | 用途 |
|---|---|
| `npm test` | 執行所有測試 |
| `npm run test:smoke` | 僅執行冒煙測試 |
| `npm run report` | 於 `127.0.0.1:9323` 提供最近一次的 HTML 報告 |
| `npm run api` | 單獨啟動 API（測試掛勾**關閉**） |
| `npm run web` | 單獨啟動介面 |

### 從其他電腦檢視

所有服務只綁定 `127.0.0.1`，不會暴露於伺服器的公開 IP。若要從自己的電腦檢視介面或報告，請透過 SSH 轉發連接埠：

```bash
ssh -L 5273:127.0.0.1:5273 -L 9323:127.0.0.1:9323 user@server
```

接著開啟 `http://localhost:5273`（需先執行 `npm run api` 與 `npm run web`），
或 `http://localhost:9323`（需先執行 `npm run report`）。

## 設定決策

`playwright.config.ts` 中每個選項都有註解，以下列出較重要的項目。

| 設定 | 值 | 理由 |
|---|---|---|
| `projects[].use` | `devices['Desktop Chrome']`，不設定 `channel` | 在 Linux ARM64 上 `channel: 'chrome'` 會失敗，因為不存在對應的 Chrome 版本 |
| `headless` | `true` | 伺服器沒有圖形顯示環境 |
| `workers` | `2` | 主機約 12 GB 記憶體，並與其他服務共用 |
| `retries` | 本機 `0`，CI `2` | 本機的失敗應該調查，而非靠重試掩蓋；CI 上不應因一次偶發問題而擋下合併 |
| `trace` | `on-first-retry` | 重試的測試會留下完整時間軸（DOM、網路、console），用以分析不穩定原因 |
| `forbidOnly` | CI 中啟用 | 否則誤提交的 `test.only` 會只跑一支測試卻回報全部通過 |
| `webServer` | API 與介面，`reuseExistingServer: false` | 非由測試啟動的伺服器可能未啟用測試掛勾，或殘留舊資料 |
| Vite `strictPort` | `true` | 5273 被占用時直接失敗，避免在不知情下測到別的伺服器 |

### 測試撰寫慣例

- 優先以角色與標籤定位（`getByRole`、`getByLabel`）；只有沒有無障礙名稱的數值才使用 `data-testid`。一律不使用 CSS class。
- 不使用 `waitForTimeout`，依賴自動等待與 `expect` 的重試機制。
- 會變動金額的測試須先呼叫 `POST /api/test/reset`，且不可與其他變動金額的測試平行執行，因為所有 worker 共用同一個 API（規格 L-05）。
- 在測試中註明所涵蓋的規則編號，使涵蓋範圍可對應回規格。

## 設計說明

- **單一規則模組。** `shared/rules.js` 由介面與 API 共同引用，兩者不會逐漸不一致；API 仍會重新檢查介面檢查過的每條規則。
- **測試掛勾須明確啟用。** 只有設定 `ENABLE_TEST_HOOKS=1` 時才存在 `POST /api/test/reset`，否則與一般路徑一樣回傳 404。
- **冒煙測試驗證資料，而非只看標題。** 即使 API 停止運作，標題檢查仍會通過。斷言初始餘額（`30,000 TWD`）可以證明介面、代理與 API 皆正常。
- **已知缺口明確記載，而非隱藏。** 無身分驗證、無冪等鍵，以及介面與 API 對 `10` 與 `10.0` 的處理差異，均列於規格第 8 節，作為測試標的。

## 規劃

- [x] 環境：Playwright、ARM64 上的 headless Chromium，兩個伺服器由設定檔管理
- [x] 受測系統與規格書
- [x] 冒煙測試
- [ ] 依規格第 4～6 節撰寫功能測試（驗證、邊界值、錯誤路徑，以 `page.route` 模擬網路故障）
- [ ] 使用 Playwright `request` fixture 撰寫 API 層測試
- [ ] 以 ARM64 runner 執行 GitHub Actions
