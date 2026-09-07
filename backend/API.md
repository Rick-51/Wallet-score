# Credit Reputation Protocol — Backend API

前端对接文档。Base URL 默认 `http://localhost:8787`。

## 1. 概览

- **协议**：JSON over HTTP（REST）。
- **编码**：UTF-8，`Content-Type: application/json`。
- **异步**：`POST /api/wallets/analyze` 会**立即**返回（`202`），真正的数据采集在后台 worker 里进行。前端应轮询 `GET /api/wallets/:address` 看 `latestRequest.status` 变化。
- **CORS**：已开启（dev 允许 `*`）。
- **鉴权**：只有 `/api/admin/*` 需要，见 §5。

## 2. 枚举

| 枚举 | 取值 |
|---|---|
| `WalletType` | `PERSONAL` · `AI_AGENT` · `BUSINESS` · `DAO` |
| `RequestStatus` | `PENDING` · `ANALYZING` · `READY_FOR_REVIEW` · `APPROVED` · `REJECTED` |
| `RiskLevel` | `LOW` · `MEDIUM` · `HIGH` |
| `eventType`（证据） | `BORROW` · `REPAY` · `LIQUIDATION` |
| `proofStatus`（验证） | `PENDING` · `VERIFIED` · `FAILED` |

## 3. 单位约定（重要）

- `creditLimitUsdMinor`：美元金额 × 100（整数）。`1500000` = $15,000.00
- `aprBps`：基点（整数）。`850` = 8.50%
- `collateralBps`：基点（整数）。`7000` = 70.00%（允许 >10000，表示超额抵押）
- `reputationScore`：0–1000（整数）
- 链上余额/借贷金额：**十进制字符串**（避免浮点精度丢失），可能为 `null`（数据尚未采集到）

## 4. 公共接口

### 4.1 提交钱包评估 — `POST /api/wallets/analyze`

请求体：

```json
{
  "walletAddress": "0x0000000000000000000000000000000000000001",
  "walletType": "AI_AGENT"
}
```

响应 `202 Accepted`：

```json
{
  "requestId": 2,
  "walletAddress": "0x0000000000000000000000000000000000000001",
  "status": "PENDING"
}
```

- 后端会同时把评估请求提交到链上 `ReputationRegistry`（异步）。
- 对发现的 Aave 借贷事件，后端会从 Creditcoin Proof Builder 获取真实的
  Merkle inclusion proof 与 continuity proof；证明会由 Creditcoin 原生
  Attestcoin verifier 验证，合约随后再校验钱包地址、Aave Pool 和事件类型。
- 后台 worker 依次：`PENDING → ANALYZING → READY_FOR_REVIEW`。

### 4.2 查询钱包数据 — `GET /api/wallets/:address`

响应 `200`：

```json
{
  "wallet": {
    "id": 1,
    "address": "0x0000000000000000000000000000000000000001",
    "walletType": "AI_AGENT",
    "firstSeen": null,
    "lastActive": null,
    "createdAt": "2026-09-07T04:45:48.183Z"
  },
  "metrics": {
    "ethBalance": null,
    "stablecoinBalance": null,
    "transactionCount": null,
    "activeDays": null,
    "totalBorrowed": null,
    "totalRepaid": null,
    "outstandingDebt": null,
    "borrowCount": 0,
    "repaymentCount": 0,
    "liquidationCount": 0,
    "liquidatedAmount": null,
    "largestLoan": null,
    "averageLoanSize": null,
    "currentCollateral": null
  },
  "latestRequest": {
    "id": 1,
    "walletId": 1,
    "status": "READY_FOR_REVIEW",
    "submittedAt": "2026-09-07T04:45:48.185Z",
    "reviewedAt": null
  }
}
```

`metrics` 里字段为 `null` 表示该数据尚未采集（未配置 RPC/Etherscan key，或该钱包无此活动）。

普通地址交易统计使用 Etherscan API V2，需要在后端配置
`ETHERSCAN_API_KEY`。Attestcoin 用于验证已经定位到的关键交易，不负责按
钱包地址搜索交易历史。

### 4.3 查询评估结果 — `GET /api/wallets/:address/assessment`

响应 `200`：

```json
{
  "wallet": { "…同 4.2…" },
  "metrics": { "…同 4.2…" },
  "assessment": {
    "reputationScore": 862,
    "riskLevel": "LOW",
    "creditLimitUsdMinor": 1500000,
    "aprBps": 850,
    "collateralBps": 7000,
    "reviewerNotes": "Good repayment history.",
    "onchainTxHash": "0x8388…",
    "createdAt": "2026-09-07T06:36:55.144Z"
  },
  "attestations": [
    {
      "id": 1,
      "chainId": 11155111,
      "sourceTxHash": "0x…",
      "eventType": "BORROW",
      "proofStatus": "VERIFIED",
      "onchainTxHash": "0x…",
      "verifiedAt": "2026-09-07T06:35:55.000Z"
    }
  ],
  "loanTerms": {
    "approved": true,
    "collateralBps": 5000,
    "aprBps": 700
  }
}
```

- `assessment`：人工审核后的最终结果，审核前为 `null`。
- `loanTerms`：从链上 `DemoLending.getLoanTerms` 读出的贷款条件，审核未上链/未开通链上同步时为 `null`。分层规则见 §6。

## 5. 管理接口（需鉴权）

所有 `/api/admin/*` 请求需带请求头：

```
X-Admin-Key: <ADMIN_API_KEY>
```

默认值 `dev-admin-key`（由后端 `.env` 的 `ADMIN_API_KEY` 决定）。错误时返回 `401 {"error":"Unauthorized"}`。

### 5.1 评估请求列表 — `GET /api/admin/assessments?status=`

`status` 可选，按 `RequestStatus` 过滤。响应 `200`：

```json
{
  "assessments": [
    {
      "request": { "id": 1, "walletId": 1, "status": "READY_FOR_REVIEW", "submittedAt": "…", "reviewedAt": null },
      "wallet": { "address": "0x…", "walletType": "AI_AGENT", "…" }
    }
  ]
}
```

### 5.2 评估详情 — `GET /api/admin/assessments/:id`

返回 `{ request, wallet, metrics, attestations, assessment }`，各字段同 §4。

### 5.3 提交人工评分 — `POST /api/admin/assessments/:id/review`

请求体（**全部用 §3 的单位**）：

```json
{
  "reputationScore": 862,
  "riskLevel": "LOW",
  "creditLimitUsdMinor": 1500000,
  "aprBps": 850,
  "collateralBps": 7000,
  "reviewerNotes": "Good repayment history."
}
```

响应 `201`：

```json
{
  "assessment": { "…同 4.3 的 assessment…", "onchainTxHash": "0x8388…" },
  "onchainTxHash": "0x8388…"
}
```

- 后端同时把结果写到链上 `reviewAssessment`；`onchainTxHash` 为链上交易哈希（链上同步关闭时为 `null`）。
- 提交后该请求状态变为 `APPROVED`。

## 6. DemoLending 贷款分层

`loanTerms` 由 `reputationScore` 决定（与审核员填的 apr/collateral 无关，是合约内置的演示分层）：

| reputationScore | approved | collateralBps | aprBps |
|---|---|---|---|
| `< 500` | `false` | 0 | 0 |
| `500–699` | `true` | 12000 (120%) | 1500 (15%) |
| `700–849` | `true` | 8000 (80%) | 1000 (10%) |
| `≥ 850` | `true` | 5000 (50%) | 700 (7%) |

## 7. 错误格式

统一返回：

```json
{ "error": "错误描述" }
```

| 状态码 | 含义 |
|---|---|
| `400` | 参数非法（地址/枚举/数值越界） |
| `401` | admin 鉴权失败 |
| `404` | 钱包或评估不存在 |
| `500` | 服务器内部错误 |

## 8. 前端对接提示

- 提交后**轮询** `GET /api/wallets/:address` 的 `latestRequest.status`，直到 `READY_FOR_REVIEW`（表示后台采集完成、待审核）或 `APPROVED`。
- 用户结果页用 `GET /api/wallets/:address/assessment`，展示 `assessment` + `loanTerms`。
- 后台页用 `/api/admin/*`，记得带 `X-Admin-Key` 头。
- 金额/利率展示时按 §3 的单位换算（`aprBps / 100` 得百分数）。
