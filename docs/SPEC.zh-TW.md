# Quick Transfer 系統規格書

[English](SPEC.md)

| | |
|---|---|
| 版本 | 1.0 |
| 日期 | 2026-09-14 |
| 狀態 | 已實作；以下每條規則均已對執行中的系統逐一驗證 |
| 程式碼 | `shared/rules.js`（規則）、`api/server.js`（API）、`web/src/App.jsx`（介面） |

## 1. 目的

Quick Transfer 是本 repo 中 Playwright 測試所使用的受測系統（System Under Test, SUT），刻意維持精簡。
系統模擬一個金融情境：從自己的帳戶轉帳給他人。其業務規則足以支撐實際的測試設計，
包括等價類劃分、邊界值分析、錯誤路徑、API 失敗及介面狀態。

本系統並非正式產品，未實作身分驗證、資料庫與資料持久化（詳見第 8 節）。

每條規則均有編號（`R-xx`、`A-xx`、`E-xx`）。撰寫測試案例時應引用這些編號，以便將涵蓋範圍追溯至規格。

## 2. 架構

```
瀏覽器（Chromium，headless）
   │  http://127.0.0.1:5273
   ▼
Vite 開發伺服器 ── 提供 React 介面
   │  /api/*（代理轉發，同源，無需設定 CORS）
   ▼
Node API（node:http）── http://127.0.0.1:8281
   │
   ▼
記憶體中的帳戶與轉帳紀錄（重新啟動即重置）
```

驗證規則集中於 `shared/rules.js`，由介面與 API 共同引用，兩者對「何謂合法輸入」的判斷因此不會分歧。
介面檢查過的項目，API 一律重新檢查，因為用戶端永遠可以被繞過。

## 3. 初始資料

API 啟動時僅有下列帳戶。呼叫 `POST /api/test/reset` 可還原至此狀態（見 6.5）。

| 帳號 | 戶名 | 期初餘額（新台幣） | 測試用途 |
|---|---|---:|---|
| `1000000001` | Alice Chen | 30,000 | 已登入的轉出方（介面中固定） |
| `1000000002` | Bob Lin | 5,000 | 有效收款方 |
| `1000000003` | Carol Wu | 0 | 餘額為零的有效收款方 |
| `1000000099` | — | — | 格式正確但**不存在** |

期初餘額（30,000）刻意低於單筆上限（50,000）。金額落在 30,001～50,000 時可通過格式驗證，
但會因餘額不足而失敗，因此兩條規則可以分開測試。

## 4. 業務規則

系統中所有金額均為新台幣整數，不存在小數。

### 4.1 收款帳號

| 編號 | 規則 | 錯誤代碼 | 訊息 |
|---|---|---|---|
| R-01 | 必填。先去除前後空白，因此僅含空白的輸入視為空值。 | `RECIPIENT_REQUIRED` | Enter a recipient account. |
| R-02 | 去除空白後須恰為 10 位數字（`^\d{10}$`）。API 中須為 JSON 字串，傳入數字一律拒絕。 | `RECIPIENT_FORMAT` | Account number must be 10 digits. |
| R-03 | 不得與轉出帳號相同。 | `SAME_ACCOUNT` | You cannot transfer to your own account. |
| R-08 | 帳號須存在。僅由 API 檢查。 | `RECIPIENT_NOT_FOUND` | Recipient account not found. |

### 4.2 金額

| 編號 | 規則 | 錯誤代碼 | 訊息 |
|---|---|---|---|
| R-04 | 必填。 | `AMOUNT_REQUIRED` | Enter an amount. |
| R-05 | 須為整數。 | `AMOUNT_NOT_INTEGER` | Amount must be a whole number. |
| R-06 | 最小值為 1。 | `AMOUNT_TOO_SMALL` | Amount must be at least 1. |
| R-07 | 單筆最大值為 50,000。 | `AMOUNT_TOO_LARGE` | Amount cannot exceed 50,000 per transfer. |
| R-09 | 不得超過轉出方目前餘額；等於餘額可以。僅由 API 檢查。 | `INSUFFICIENT_FUNDS` | Insufficient balance. |

### 4.3 金額輸入框的解讀方式（介面）

輸入文字先去除前後空白，再依下表解讀：

| 輸入 | 解讀為 | 結果 |
|---|---|---|
| *（空白）* | 無值 | R-04 |
| `100`、`0100` | 100（忽略前導零） | 合法 |
| `0` | 0 | R-06 |
| `-5` | -5 | R-06（不是 R-05：它是整數，只是太小） |
| `10.5`、`10.0`、`1,000`、`1e3`、`abc`、`+5` | 非整數 | R-05 |
| `50001`、`999999999999999999999` | 超過上限 | R-07 |

### 4.4 邊界值彙整

| 欄位 | 下界外（不合法） | 合法範圍 | 上界外（不合法） |
|---|---|---|---|
| 收款帳號長度 | 9 位 | 10 位 | 11 位 |
| 金額（單筆上限） | 0 | 1～50,000 | 50,001 |
| 金額（Alice 的餘額） | — | 1～30,000 | 30,001（R-09） |

## 5. 使用者介面

### 5.1 頁面元素

測試應優先以無障礙角色（role）與名稱定位元素；只有沒有無障礙名稱的數值才使用 `data-testid`。

| 元素 | 定位方式 | 內容 |
|---|---|---|
| 頁面標題 | `page` 的 title | `Quick Transfer` |
| 主標題 | role `heading`，名稱 `Quick Transfer` | — |
| 轉出帳號 | test id `sender-account` | `1000000001` |
| 餘額 | test id `balance` | `Loading...` → `30,000 TWD` 或 `Unavailable` |
| 收款帳號輸入框 | label `Recipient account` | 文字 |
| 金額輸入框 | label `Amount (TWD)` | 文字 |
| 送出按鈕 | role `button`，名稱 `Transfer`（送出中為 `Sending...`） | — |
| 欄位錯誤 | 輸入框 `aria-describedby` 所指向的元素 | 第 4 節的訊息 |
| 成功提示 | role `status` | 見 U-06 |
| 錯誤提示 | role `alert` | 見 U-07 |

### 5.2 行為

| 編號 | 行為 |
|---|---|
| U-01 | 頁面載入時呼叫 `GET /api/accounts/1000000001`，等待期間餘額顯示 `Loading...`。 |
| U-02 | 若該呼叫失敗（網路錯誤或非 2xx），餘額顯示 `Unavailable`，送出按鈕維持停用。 |
| U-03 | 餘額以 `en-US` 千分位格式顯示，並加上 ` TWD`，例如 `30,000 TWD`、`0 TWD`。 |
| U-04 | 送出時，介面對**兩個**欄位檢查 R-01～R-07，並**同時**顯示所有未通過的欄位。有錯誤的欄位會帶 `aria-invalid="true"`。任一欄位未通過即不發送請求。 |
| U-05 | 請求進行中，按鈕顯示 `Sending...` 並停用，因此無法從介面重複送出。 |
| U-06 | 收到 `201` 時：提示（role `status`）顯示 `Sent {amount} TWD to {toAccount}. Reference: {id}`（例如 `Sent 1,000 TWD to 1000000002. Reference: TX-000001`），餘額更新為 `balanceAfter`，兩個輸入框清空。 |
| U-07 | 收到其他回應時，提示（role `alert`）顯示該錯誤代碼於第 4 節對應的訊息。未知代碼、無法解析的回應、HTTP 500 或網路失敗，一律顯示 `Something went wrong. Please try again.`，輸入內容保留。 |
| U-08 | 每次重新送出時，會先清除前一次的提示再進行驗證。 |
| U-09 | 收款帳號在送出前會去除前後空白（` 1000000002 ` 送出為 `1000000002`）。 |

## 6. API

### 6.1 共通約定

- 基底網址為 `http://127.0.0.1:8281`；介面透過 Vite 代理以 `/api` 存取。
- 請求與回應內容皆為 JSON，編碼 UTF-8。
- 所有錯誤使用同一種格式：

```json
{ "error": { "code": "AMOUNT_TOO_LARGE", "message": "Amount cannot exceed 50,000 per transfer.", "field": "amount" } }
```

僅當錯誤屬於某一輸入欄位（`fromAccount`、`toAccount`、`amount`）時才會帶 `field`。

### 6.2 端點

| 編號 | 方法與路徑 | 成功 | 錯誤 |
|---|---|---|---|
| A-01 | `GET /api/health` | `200 {"status":"ok"}` | — |
| A-02 | `GET /api/accounts/{id}` | `200 {"id","owner","balance"}` | `404 ACCOUNT_NOT_FOUND` |
| A-03 | `POST /api/transfers` | `201` 轉帳物件（見 6.4） | 見 6.3 |
| A-04 | `POST /api/test/reset` | `204`（僅限測試掛勾，見 6.5） | 掛勾未啟用時 `404 NOT_FOUND` |
| A-05 | 其他任何路徑 | — | `404 NOT_FOUND` |

### 6.3 `POST /api/transfers`：請求內容與檢查順序

```json
{ "fromAccount": "1000000001", "toAccount": "1000000002", "amount": 1000 }
```

檢查依下列順序進行，**僅回傳第一個失敗項目**。因此同時有多個問題的請求只會回報最早的一個
（例如收款帳號格式錯誤且金額為零，回傳 `RECIPIENT_FORMAT`）。
這點與介面不同：介面會同時顯示所有欄位錯誤（U-04）。

| 步驟 | 檢查 | 狀態碼 | 代碼 | `field` |
|---:|---|---:|---|---|
| 1 | 請求內容超過 10,000 bytes | 413 | `PAYLOAD_TOO_LARGE` | — |
| 2 | 內容不是合法 JSON，或不是 JSON 物件（`null`、陣列、數字等） | 400 | `INVALID_JSON` | — |
| 3 | `fromAccount` 不是字串，或該帳戶不存在 | 404 | `SENDER_NOT_FOUND` | `fromAccount` |
| 4 | R-01 / R-02 / R-03 | 400 | `RECIPIENT_REQUIRED` / `RECIPIENT_FORMAT` / `SAME_ACCOUNT` | `toAccount` |
| 5 | R-04 / R-05 / R-06 / R-07：`amount` 須為 JSON 數字；字串 `"100"` 視為 `AMOUNT_NOT_INTEGER` | 400 | `AMOUNT_REQUIRED` / `AMOUNT_NOT_INTEGER` / `AMOUNT_TOO_SMALL` / `AMOUNT_TOO_LARGE` | `amount` |
| 6 | R-08 | 404 | `RECIPIENT_NOT_FOUND` | `toAccount` |
| 7 | R-09 | 422 | `INSUFFICIENT_FUNDS` | `amount` |

失敗的請求不會造成任何變更：餘額不變，也不會消耗轉帳編號。

### 6.4 轉帳物件（201）

```json
{
  "id": "TX-000001",
  "fromAccount": "1000000001",
  "toAccount": "1000000002",
  "amount": 1000,
  "balanceAfter": 29000,
  "createdAt": "2026-09-14T09:15:23.170Z"
}
```

| 欄位 | 說明 |
|---|---|
| `id` | `TX-` 加 6 位流水號，從 `TX-000001` 開始，每筆成功轉帳加 1 |
| `toAccount` | 去除空白後的收款帳號 |
| `balanceAfter` | 本筆轉帳後的轉出方餘額 |
| `createdAt` | 伺服器時間，ISO 8601，UTC |

轉出方扣款與收款方入帳同時完成（E-03）。

### 6.5 測試掛勾

| 編號 | 規則 |
|---|---|
| A-06 | `POST /api/test/reset` 將資料還原為初始資料（第 3 節），清空轉帳紀錄，編號重新從 `TX-000001` 起算。 |
| A-07 | 僅在 API 以 `ENABLE_TEST_HOOKS=1` 啟動時存在此端點；否則回傳 `404 NOT_FOUND`，與任何不存在的路徑相同。Playwright 會設定此變數，`npm run api` 則不會。 |

## 7. 環境與非功能性規則

| 編號 | 規則 |
|---|---|
| E-01 | 連接埠：介面 `5273`、API `8281`，均只綁定 `127.0.0.1`。Vite 啟用 `strictPort`，若 5273 已被占用即直接失敗，不會改用其他連接埠。 |
| E-02 | 所有資料存於單一 Node 行程的記憶體中，重啟 API 即全部重置。 |
| E-03 | 一筆轉帳在同一段同步程式中完成。Node 一次只執行一個請求處理函式，因此不會有人讀到「已扣款但尚未入帳」的狀態。 |
| E-04 | 環境變數 `API_PORT` 可同時變更 API 與 Vite 代理所使用的連接埠。 |
| E-05 | 執行環境：Node ≥ 20.19（Vite 8 的要求）。已於 Ubuntu 24.04.4 aarch64、Node 20.20.2 驗證。 |

## 8. 已知限制（刻意保留）

以下項目在正式的支付系統中都是實際存在的缺口。保留它們是為了討論與測試，而非認為可以接受。

| 編號 | 限制 | 影響 |
|---|---|---|
| L-01 | 無身分驗證；介面中轉出方寫死，API 直接信任請求內容中的轉出方。 | 任何呼叫者都能透過 API 從任意帳戶轉出款項。 |
| L-02 | 無冪等鍵（idempotency key）。 | 重複送出僅靠停用按鈕（U-05）防止；兩次相同的 API 呼叫會產生兩筆轉帳。 |
| L-03 | JSON 無法區分 `10` 與 `10.0`，API 會將 `10.0` 視為 10；介面則拒絕文字 `10.0`（R-05）。 | 此一輸入在介面與 API 的結果不同。 |
| L-04 | 無持久化，亦無轉帳紀錄查詢端點。 | 需透過餘額（`GET /api/accounts/{id}`）或 201 回應內容驗證轉帳結果。 |
| L-05 | 所有 Playwright worker 共用同一份記憶體狀態。 | 會變動金額的測試須先重置資料，且彼此不可平行執行。 |
| L-06 | 無頻率限制、無每日限額，僅支援新台幣。 | — |

## 9. 測試涵蓋範圍

| 編號 | 測試 | 涵蓋 | 檔案 |
|---|---|---|---|
| S-01 | 首頁可載入並顯示來自 API 的餘額 | A-01、A-02、U-01、U-03 | `tests/smoke.spec.ts` |

第 4～6 節的功能測試案例尚未撰寫，列為下一階段工作。
