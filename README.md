# TermShift

**Financial Contract Counterexample Lab · v1.0.0**

[![CI](https://github.com/AndyLamyinwik/termshift-finance-lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AndyLamyinwik/termshift-finance-lab/actions/workflows/ci.yml)

**Language / 語言 / 语言:** [English](#english) · [繁體中文](#zh-hant) · [简体中文](#zh-hans)

<a id="english"></a>

## English

[Live Demo](https://andylamyinwik.github.io/termshift-finance-lab/) · [Releases](https://github.com/AndyLamyinwik/termshift-finance-lab/releases) · [Changelog](CHANGELOG.md)

TermShift is an explainable financial contract simulation and counterexample discovery engine. Compare two fictional contracts, find a scenario where their fees differ, reduce that scenario, and inspect independently recalculated evidence of its impact.

All financial calculations run locally in your browser. TermShift is a static frontend with no account connection, backend, database, runtime external API, or AI service.

### Published-rate case study: PayPal USD

[Open the PayPal A/B case study](https://andylamyinwik.github.io/termshift-finance-lab/case-studies/paypal-usd/) · [Method, sources and reproduction](docs/case-studies/PAYPAL_USD.md)

Compare published US Checkout and Static Micropayments fee schedules using synthetic receipts, independent expected values, an engine-derived fee curve, and downloadable verified JSON/Markdown evidence. The case distinguishes Static eligibility from Dynamic pricing and records its source date, exclusions and model rounding assumption. It compares two plans rather than a historical price change; the original three synthetic experiments remain available below.

### Explore the lab

| Module | What you can do |
| --- | --- |
| **Dashboard** | Select a synthetic experiment and inspect old/new totals, signed differences, rule-level fees, and calculation traces. |
| **Financial Diff** | Edit existing monthly, transaction, and late-fee rules on separate working contracts. Apply validated changes or reset the originals. |
| **Counterexample Hunter** | Run deterministic, bounded searches with explicit ranges, seed, and evaluation budget. Inspect search statistics and select real witnesses calculated by the engine. |
| **Proof of Impact** | Reduce a selected witness, verify its original/reduced evidence, inspect accepted steps, and download or independently import portable evidence. |

Start with **The Waiver Trap** in the Dashboard. In **Financial Diff**, change the new monthly purchase-total waiver from $500 to $50 and choose **Apply Changes**: the fixed experiment's difference becomes $0.00. Change it to $60: the difference becomes +$12.00. **Reset to Original** restores the fixture contracts and default controls.

Choose **Run Search** in **Counterexample Hunter**, select a witness, then open **Proof of Impact** and choose **Generate Proof**. **Verify Again** independently checks saved evidence without rerunning the search or minimizer. Changing applied contracts, search settings, or the selected witness clears dependent workspace results; invalid drafts and view navigation preserve still-valid results.

### Three synthetic experiments

These totals are computed from the included fixtures. Positive differences mean the new contract costs more.

| Experiment | Contract change | Fixed scenario | Old fee | New fee | Difference |
| --- | --- | --- | ---: | ---: | ---: |
| **The Waiver Trap** | A $12 monthly fee changes its waiver from at least five purchases to at least $500 in purchases. | Five purchases of $10 each. | $0.00 | $12.00 | **+$12.00** |
| **The Microtransaction Penalty** | A 100-bps fee changes to 60 bps plus $0.20 per purchase. | Ten purchases of $1 each. | $0.10 | $2.10 | **+$2.00** |
| **The Grace Period Shift** | A $15 late fee changes its grace period from three days to one. | Payment due May 15, 2026, completed May 17. | $0.00 | $15.00 | **+$15.00** |

The contracts, transactions, and payment events are fictional. They are examples of this model's behavior and do not describe a real bank product or provide financial advice.

### Run locally

Use **Node.js 24 LTS** and npm. The Node version is recorded in `.nvmrc`; dependencies are pinned in `package-lock.json`.

```sh
git clone https://github.com/AndyLamyinwik/termshift-finance-lab.git
cd termshift-finance-lab
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173/termshift-finance-lab/`.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact locked dependencies. |
| `npm run dev` | Start the local development server. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Check strict TypeScript types without emitting files. |
| `npm test` | Run the Vitest suite once. |
| `npm run build` | Create the static production build in `dist/`. |

Before submitting a change, run all five verification commands:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same checks on pushes and pull requests. The separate Pages workflow verifies main pushes before deployment; pull requests do not publish. See [Contributing](CONTRIBUTING.md).

### Architecture

TermShift uses **React, TypeScript strict mode, Vite, Zod, Vitest, ESLint, and GitHub Actions** in one frontend project. The financial core is independent of React and the browser and runs in Node.js tests.

| Boundary | Responsibility |
| --- | --- |
| [`src/models/`](src/models/) | Strict Contract v1 and Scenario v1 schemas, Gregorian date validation, and structured input errors. |
| [`src/engine/`](src/engine/) | Exact fee evaluation, contract comparison, and calculation traces. |
| [`src/search/`](src/search/) | Deterministic candidate generation and bounded counterexample search. |
| [`src/minimizer/`](src/minimizer/) | Budgeted witness reduction that preserves a nonzero difference and its direction. |
| [`src/proof/`](src/proof/) | Proof Schema v1, independent recalculation, and Markdown report formatting. |
| [`src/scenarios/`](src/scenarios/) | Three formal synthetic experiment inputs. |
| [`src/features/`](src/features/) | Views, exact input/amount presentation, local file handling, and shared in-memory workspace state. |

Public core APIs accept `unknown` inputs and return either validated results or structured issues with code, field path, and message. Unknown fields, invalid dates, unsafe amounts, and unsupported versions are rejected. Calculation errors are displayed as errors rather than converted to zero fees. See [Architecture](docs/ARCHITECTURE.md) and [Financial Model](docs/FINANCIAL_MODEL.md).

### Financial precision

- The model supports **USD only**, represented as safe integer cents. Future currencies would require explicit unit scales; two decimal places are not assumed for every currency.
- Rates use integer **basis points**: 1 bps = 0.01%, and 10,000 bps = 100%.
- Internal `bigint` arithmetic preserves exact monetary results. Each purchase's proportional fee is rounded half-up to cents before adding its fixed fee; totals outside the safe integer range fail explicitly.
- Dates are strict Gregorian calendar dates. Late days use calendar-day comparisons, including leap years and cross-month payments; early payment has zero late days.
- A late fee applies separately to each completed synthetic payment event when its delay exceeds the grace period.
- `effectiveDate` is descriptive contract-version metadata and does not reject counterfactual scenarios.

See [Calculation Engine](docs/CALCULATION_ENGINE.md) for formulas, policies, and traces, and [Financial Diff](docs/FINANCIAL_DIFF.md) for exact input validation.

### Counterexample search and reduction

Search starts from an explicit scenario and applied contracts. The interface creates a neutral starting scenario with no purchases and the experiment's existing payment obligations paid on their due dates. Only **Run Search** performs a search.

The generated family uses equal-sized purchases and one shared payment delay. Search prioritizes rule boundaries and then uses exploration driven by an explicit seed. With the same complete inputs, seed, options, and code revision, candidate order and results are reproducible.

Search allows at most **30 purchases, five payment events, 500 evaluations, and ten retained witnesses**. Generated purchase amounts are bounded to 1–100,000 cents and delays to 0–31 days. Reports disclose actual evaluations, failures, skips, retained witnesses, stopping reason, and generated-family coverage.

No witness means no difference was found within the selected range and budget. A strongest observed witness is not a global maximum. Complete generated-family coverage does not establish general contract equivalence or successful financial evaluation of every candidate.

The minimizer reduces purchase count, purchase total, and nonnegative payment delay under the original bounds while preserving payment obligations and a nonzero delta with the same sign. It uses a deterministic finite strategy with **200 checks by default and a hard maximum of 300**. A reduced witness is not guaranteed to be globally minimal.

See [Search API](docs/COUNTEREXAMPLE_SEARCH.md), [Hunter Interface](docs/COUNTEREXAMPLE_UI.md), and [Minimization and Proof](docs/MINIMIZATION_AND_PROOF.md).

### Portable evidence

In **Proof of Impact → Evidence Actions**, choose **Current Workspace Proof** or **Imported Proof**.

- **Download JSON** saves the complete contracts, options, scenarios, comparisons, reduction steps, policies, and limitations as `termshift-impact-proof.json`.
- **Download Markdown** saves a human-readable, verified report as `termshift-impact-report.md`. Markdown is a report, not a replacement for complete JSON evidence.
- **Import Proof JSON** reads a local UTF-8 file with a **5 MiB limit**, validates the strict proof schema, and independently recomputes its recorded financial evidence against the embedded contracts.
- **Verify Imported Proof Again** repeats verification. **Clear Imported Proof** clears only imported state.

Imports do not replace working contracts, search results, or the current workspace proof. Imported evidence remains separate when working contracts or the experiment change. Download actions perform fresh official verification and are enabled only for verified evidence.

Verification checks schema compatibility, arithmetic, traces, reduction invariants, and accepted step continuity. A changed recorded fee or delta that disagrees with recalculation is rejected. **Verified** means calculation consistency; it does not authenticate the author, establish the inputs' real-world truth, certify historical search activity, or provide a digital signature. Consistently rewritten evidence can constitute a different internally consistent submission.

See [Proof Viewer](docs/PROOF_VIEWER_UI.md) and [Portable Evidence](docs/PORTABLE_EVIDENCE.md).

### Security and privacy

Financial calculations and imported files stay in local page memory. The application does not upload JSON, connect to bank accounts, call AI or financial APIs, include external trackers, or save financial data to browser permanent storage. Reloading discards workspace and imported evidence; explicit downloads save local files.

Imports are inert data: file size is checked before reading and again against actual bytes, invalid UTF-8/JSON is rejected, and imported strings are rendered as text without executing HTML, Markdown, or JavaScript. There is no runtime remote font, image, or CDN dependency. Normal public-site requests load static resources from GitHub Pages; development dependency installation and GitHub Actions use network access.

### Deployment

[GitHub Pages](https://andylamyinwik.github.io/termshift-finance-lab/) serves the static build under `/termshift-finance-lab/`. The Vite base path and local favicon support that project path. The deployed [`build-info.json`](https://andylamyinwik.github.io/termshift-finance-lab/build-info.json) records the exact source commit in its `commit` field; the application does not fetch this metadata during use.

The Pages workflow uses pinned official Actions and the `github-pages` environment with scoped Pages/OIDC deployment permissions. See [Deployment](docs/DEPLOYMENT.md) for verification and troubleshooting.

### Known limitations

- Only USD and the three supported fee-rule categories are modeled; contracts and experiments are synthetic.
- No real bank accounts, balances, pending payments, partial repayments, minimum repayments, full credit-card interest, or compound interest are supported.
- The interface edits existing rule parameters. It does not add/remove rule categories, edit scenarios or general contract metadata, or import/export standalone contracts.
- Search explores a restricted generated family within finite ranges and budgets. Search results are not general contract-equivalence proofs; minimization does not guarantee a global minimum.
- Proof verification is unsigned consistency checking, not authenticated provenance, regulatory certification, or proof that a historical search was run.
- TermShift does not provide financial advice. Real contract interpretation and account-level banking behavior may differ from this model.

### Contribute

Bug reports and focused pull requests are welcome. Include reproducible inputs and the expected versus observed behavior, and preserve exact monetary arithmetic, truthful error reporting, and local-only operation. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development checks and review expectations.

### License

TermShift is available under the [MIT License](LICENSE).

---

<a id="zh-hant"></a>

## 繁體中文

**TermShift — 金融合約反例實驗室**

TermShift 是一個開源的金融合約模擬與反例探索工具。你可以比較新舊合約的費用，尋找「看似更優惠，實際卻更貴」的消費或付款情景，將反例縮減，再查看與分享可獨立重新計算的影響證據。

金融計算與證據驗證都在你的瀏覽器內完成，不需要登入或連接銀行帳戶。專案不使用後端、AI 或外部金融 API，也不會上傳匯入的 JSON 或將財務資料存入瀏覽器永久儲存空間。

### 使用入口

- **[開啟線上實驗室（Live Demo）](https://andylamyinwik.github.io/termshift-finance-lab/)**：直接在瀏覽器使用，無需安裝。
- **[正式版本與發布說明](https://github.com/AndyLamyinwik/termshift-finance-lab/releases)**：查看版本與功能紀錄。
- **[本地安裝與開發方式](#run-locally)**：適合想自行執行或參與開發的人。

目前應用介面為英文；以下保留網站上的按鈕與模組名稱，方便對照操作。本頁提供中文介紹，並非介面語言切換功能。

### 公開費率案例：PayPal USD

[開啟 PayPal A／B 案例](https://andylamyinwik.github.io/termshift-finance-lab/case-studies/paypal-usd/) · [來源、方法與重現說明](docs/case-studies/PAYPAL_USD.md)

使用美國公開的 Checkout 與 Static Micropayments 費率，查看費用曲線、獨立預期／引擎對照表，並下載可重新驗證的 JSON／Markdown 證據。案例清楚區分 Static 核准條件與 Dynamic 自動選價；逐筆捨入列為模型假設。這是兩方案比較，交易情景為虛構資料。

### 四個核心模組

| 模組 | 可以做什麼 |
| --- | --- |
| **Dashboard** | 選擇虛構實驗，查看新舊合約的費用、差額、規則明細與計算過程。 |
| **Financial Diff** | 修改現有費用規則，套用經驗證的變更，或還原原始合約。 |
| **Counterexample Hunter** | 在指定範圍與有限預算內搜尋反例，切換查看實際算出的 Witness 與搜尋統計。 |
| **Proof of Impact** | 縮減選定反例、獨立驗證證據，下載 JSON／Markdown，或匯入 JSON。 |

### 第一次使用

1. 開啟 **Live Demo**，在 **Dashboard → Experiment** 選擇 **The Waiver Trap**。原始情景中，新合約比舊合約多收 **$12.00**。
2. 進入 **Financial Diff**，將 **New Contract** 的 **Monthly purchase total (USD)** 從 `500.00` 改成 `50.00`，按 **Apply Changes**，差額會變成 **$0.00**。再改成 `60.00` 並套用，差額會變成 **+$12.00**。按 **Reset to Original** 還原實驗合約與控制設定。
3. 進入 **Counterexample Hunter**，按 **Run Search**，在 **Witness List** 選擇一個反例，查看其消費／付款情景與費用差異。
4. 進入 **Proof of Impact**，按 **Generate Proof**，查看縮減前後的情景與 **Verified** 驗證結果。按 **Verify Again** 可重新驗證已保存的證據。
5. 在 **Evidence Actions** 按 **Download JSON** 保存完整證據，或按 **Download Markdown** 下載可讀報告。按 **Import Proof JSON** 選取先前下載的 JSON（上限 **5 MiB**），即可在 **Imported Proof** 獨立驗證；匯入不會覆蓋目前的工作合約。

切換頁面會保留仍有效的工作狀態；重新整理網頁會清除記憶體中的操作與證據，請先下載需要保存的檔案。修改已套用的合約、搜尋設定或選定 Witness，會清除受影響的舊搜尋／Proof 結果，避免顯示過期證據。

### 三套虛構實驗

下列金額均為 USD，由正式計算引擎依內建情景算出；正差額代表新合約費用更高。

| 實驗 | 示範的變更 | 新舊費用差額 |
| --- | --- | ---: |
| **The Waiver Trap（月費豁免陷阱）** | 免月費條件由至少 5 筆消費，改為每月消費至少 $500；情景為 5 筆各 $10 的消費。 | **+$12.00** |
| **The Microtransaction Penalty（小額交易懲罰）** | 比例費率由 100 bps 降至 60 bps，但每筆新增 $0.20 固定費；情景為 10 筆各 $1 的消費。 | **+$2.00** |
| **The Grace Period Shift（寬限期縮短）** | $15 遲繳費的寬限期由 3 天縮為 1 天；情景為到期後 2 天完成付款。 | **+$15.00** |

### 使用限制與更多資訊

目前僅支援 **USD**，金額以整數美分、費率以整數 basis points 表示。合約與資料均為虛構，不支援真實銀行帳戶、完整信用卡利息或複利，也不構成金融建議。

搜尋與最小化有明確範圍及有限預算，不能當成全域最佳解或完整的合約等價證明。**Verified** 表示證據的計算與規則一致，不代表來源身份真實，也不是數位簽名。Markdown 是閱讀用報告；獨立驗證需要完整 JSON。

詳見[架構文件](docs/ARCHITECTURE.md)、[金融模型](docs/FINANCIAL_MODEL.md)、[可攜式證據](docs/PORTABLE_EVIDENCE.md)及[貢獻指南](CONTRIBUTING.md)（目前為英文）。專案採用 [MIT License](LICENSE)。

[回到語言選擇](#termshift) · [English](#english) · [简体中文](#zh-hans)

---

<a id="zh-hans"></a>

## 简体中文

**TermShift — 金融合同反例实验室**

TermShift 是一个开源的金融合同模拟与反例探索工具。你可以比较新旧合同的费用，寻找“看似更优惠，实际却更贵”的消费或付款场景，将反例缩减，再查看与分享可独立重新计算的影响证据。

金融计算与证据验证都在你的浏览器内完成，不需要登录或连接银行账户。项目不使用后端、AI 或外部金融 API，也不会上传导入的 JSON 或将财务数据存入浏览器永久存储空间。

### 使用入口

- **[打开在线实验室（Live Demo）](https://andylamyinwik.github.io/termshift-finance-lab/)**：直接在浏览器使用，无需安装。
- **[正式版本与发布说明](https://github.com/AndyLamyinwik/termshift-finance-lab/releases)**：查看版本与功能记录。
- **[本地安装与开发方式](#run-locally)**：适合想自行运行或参与开发的人。

目前应用界面为英文；以下保留网站上的按钮与模块名称，方便对照操作。本页提供中文介绍，并非界面语言切换功能。

### 公开费率案例：PayPal USD

[打开 PayPal A／B 案例](https://andylamyinwik.github.io/termshift-finance-lab/case-studies/paypal-usd/) · [来源、方法与复现说明](docs/case-studies/PAYPAL_USD.md)

使用美国公开的 Checkout 与 Static Micropayments 费率，查看费用曲线、独立预期／引擎对照表，并下载可重新验证的 JSON／Markdown 证据。案例清楚区分 Static 核准条件与 Dynamic 自动选价；逐笔舍入列为模型假设。这是两方案比较，交易场景为虚构数据。

### 四个核心模块

| 模块 | 可以做什么 |
| --- | --- |
| **Dashboard** | 选择虚构实验，查看新旧合同的费用、差额、规则明细与计算过程。 |
| **Financial Diff** | 修改现有费用规则，应用经过验证的更改，或还原原始合同。 |
| **Counterexample Hunter** | 在指定范围与有限预算内搜索反例，切换查看实际算出的 Witness 与搜索统计。 |
| **Proof of Impact** | 缩减选定反例、独立验证证据，下载 JSON／Markdown，或导入 JSON。 |

### 第一次使用

1. 打开 **Live Demo**，在 **Dashboard → Experiment** 选择 **The Waiver Trap**。原始场景中，新合同比旧合同多收 **$12.00**。
2. 进入 **Financial Diff**，将 **New Contract** 的 **Monthly purchase total (USD)** 从 `500.00` 改成 `50.00`，点击 **Apply Changes**，差额会变成 **$0.00**。再改成 `60.00` 并应用，差额会变成 **+$12.00**。点击 **Reset to Original** 还原实验合同与控制设置。
3. 进入 **Counterexample Hunter**，点击 **Run Search**，在 **Witness List** 选择一个反例，查看其消费／付款场景与费用差异。
4. 进入 **Proof of Impact**，点击 **Generate Proof**，查看缩减前后的场景与 **Verified** 验证结果。点击 **Verify Again** 可重新验证已保存的证据。
5. 在 **Evidence Actions** 点击 **Download JSON** 保存完整证据，或点击 **Download Markdown** 下载可读报告。点击 **Import Proof JSON** 选择先前下载的 JSON（上限 **5 MiB**），即可在 **Imported Proof** 独立验证；导入不会覆盖当前的工作合同。

切换页面会保留仍有效的工作状态；刷新网页会清除内存中的操作与证据，请先下载需要保存的文件。修改已应用的合同、搜索设置或选定 Witness，会清除受影响的旧搜索／Proof 结果，避免显示过期证据。

### 三套虚构实验

下列金额均为 USD，由正式计算引擎根据内置场景算出；正差额代表新合同费用更高。

| 实验 | 示范的变更 | 新旧费用差额 |
| --- | --- | ---: |
| **The Waiver Trap（月费豁免陷阱）** | 免月费条件由至少 5 笔消费，改为每月消费至少 $500；场景为 5 笔各 $10 的消费。 | **+$12.00** |
| **The Microtransaction Penalty（小额交易惩罚）** | 比例费率由 100 bps 降至 60 bps，但每笔新增 $0.20 固定费；场景为 10 笔各 $1 的消费。 | **+$2.00** |
| **The Grace Period Shift（宽限期缩短）** | $15 逾期费的宽限期由 3 天缩为 1 天；场景为到期后 2 天完成付款。 | **+$15.00** |

### 使用限制与更多信息

目前仅支持 **USD**，金额以整数美分、费率以整数 basis points 表示。合同与数据均为虚构，不支持真实银行账户、完整信用卡利息或复利，也不构成金融建议。

搜索与最小化有明确范围及有限预算，不能当成全局最优解或完整的合同等价证明。**Verified** 表示证据的计算与规则一致，不代表来源身份真实，也不是数字签名。Markdown 是阅读用报告；独立验证需要完整 JSON。

详见[架构文档](docs/ARCHITECTURE.md)、[金融模型](docs/FINANCIAL_MODEL.md)、[可移植证据](docs/PORTABLE_EVIDENCE.md)及[贡献指南](CONTRIBUTING.md)（目前为英文）。项目采用 [MIT License](LICENSE)。

[回到语言选择](#termshift) · [English](#english) · [繁體中文](#zh-hant)
