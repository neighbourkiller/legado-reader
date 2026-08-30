# Agent 书源兼容性审计流程

本流程只面向 Tauri 开发环境。目标是先取得可复现证据，再补充通用书源引擎；不得根据在线空结果直接修改规则或引擎。

## 1. 静态盘点

```bash
cd modules/web-reader
pnpm audit:sources:static -- /绝对路径/legado_reader.db > /tmp/source-static-audit.json
```

静态报告的 `kind` 是 `source-static-audit`。它不访问网络，所有运行阶段均为 `untested`，不能作为在线通过证明。

## 2. 真实 Tauri 批测

```bash
pnpm audit:sources:live -- \
  --db /绝对路径/legado_reader.db \
  --output /绝对路径/source-audit.json \
  --diagnostics /绝对路径/source-audit-private \
  --mode quick \
  --scope enabled \
  --concurrency 1
```

- `--db` 可省略；省略时使用当前 Tauri 开发数据库。外部数据库始终以 SQLite 只读模式打开。
- `--mode` 为 `quick` 或 `full`；`--scope` 为 `all`、`enabled`、`text` 或 `image`；并发限制为 1-3。
- 自动审计使用独立的 `127.0.0.1:1421` 和用户缓存目录下的 Cargo target，不覆盖普通开发客户端的 `target/debug`；测试期间不要直接运行审计缓存中的二进制，也不要并发启动第二个在线审计或重放。
- 普通报告不含 URL、Cookie、规则正文或响应体。
- 普通报告中的 `RULE_SYNTAX_ERROR` 只是归一化路由类别，不等于已经确认“书源规则写错”。`INVALID_XPATH`、`INVALID_SELECTOR`、`RULE_EXECUTION_FAILED` 等底层错误都可能归入此类。
- 只有显式传入 `--diagnostics` 才捕获失败响应；新建目录权限为 `0700`，文件为 `0600`；已有目录若允许组用户或其他用户访问会被拒绝。
- 私有诊断包的 `cases[].failures[stage]` 会保留受控的 `rawCode`、`field`、`stage` 和兼容模式，但不会保存异常消息、规则正文或 `cause`。Agent 应优先使用这里的底层码继续调查，不得把它复制到公开报告。
- 诊断包可能含网站返回的私人内容，只能留在本机临时目录，禁止提交 Git 或作为普通报告分享。
- 单个响应最多捕获 512 KiB，每个书源最多保留 8 条请求轨迹，全批次响应正文最多保留约 32 MiB；达到上限后仍保留请求元数据并标记截断。
- 批测使用不持久化变量的 `SourceEngine`，不会把 `@put/java.put` 的测试变量写回书源数据库。
- 退出码 `0` 表示没有 `failed` 阶段，`1` 表示报告中存在失败，`2` 表示参数、载入或报告写入失败；无论退出码如何都应优先读取输出 JSON。
- 审计前端在 45 秒内没有接管时，Rust 看门狗会写入 `kind=source-audit-error`、`code=FRONTEND_START_TIMEOUT` 的私有报告并退出，外层 Agent 不应继续无限等待。
- 开发期 Vite 首次优化依赖造成 `Importing a module script failed` 时，客户端会自动刷新恢复一次；同一错误短时间内再次发生则写错误报告或显示真实的界面加载错误，避免刷新循环。

## 3. 离线重放

```bash
pnpm audit:sources:replay -- \
  --input /绝对路径/source-audit-private/diagnostics-v1.json \
  --output /绝对路径/source-replay.json
```

重放继续运行在真实 Tauri WebView/QuickJS 环境，但不会再次请求网站。当前可重放搜索、发现、详情、目录和正文解析；登录、安全挑战和图片下载标记为 `NOT_REPLAYABLE`。

重放结果还会输出：

- `originalCategory`：在线批测的归一化类别；
- `rawCode`、`field`：来自私有诊断包的受控底层错误位置；
- `attribution.state`：记录候选、未决、响应不合格、缺目标数据、缺字段或已具备差分条件；重放器不会自动确认引擎缺口；
- `attribution.candidateCause`：候选边界；
- `attribution.confirmationRequired`：下一步必须补充的证据。
- `responseEligibility`：在规则归因前判定响应是目标数据、普通响应、HTTP 错误、登录壳、安全挑战还是空响应；不合格响应不会进入规则差分队列。
- `summary`：按重放状态、归因状态、候选边界和响应类别汇总，并给出 `readyForDifferential` 数量。

候选边界解释：

- `ONLINE_PIPELINE`：在线失败但离线通过，检查传输、Cookie、编码、响应转换或 WebView；
- `NETWORK_OR_SITE`：网络、站点、登录或安全挑战候选；
- `RULE_OR_ENGINE_SEMANTICS`：规则错误与引擎语义缺口尚未区分，必须执行 Android 差分；
- `SCRIPT_OR_HOST_SEMANTICS`：书源脚本与 QuickJS 宿主语义尚未区分，必须执行 Android 差分；
- `WEBVIEW_RUNTIME`：检查 WebView 生命周期和页面上下文；
- `ANDROID_API_CAPABILITY`：明确的 Android API 能力边界，需评估能否安全跨平台实现；
- `UNKNOWN`：证据不足。

判断规则：

- 在线失败、离线通过：优先检查 HTTP、Cookie、编码、重定向和 WebView 通道。
- 在线与离线都失败，但 Android 对同一 fixture 通过：属于候选引擎兼容缺口。
- Android 与 Tauri 都失败：优先检查书源规则或测试样本。
- `NETWORK_ERROR`、`DNS_ERROR`、`TIMEOUT`、`NEEDS_LOGIN`、`SECURITY_CHALLENGE` 不能直接归因于规则引擎。
- `EMPTY_RESULT` 只有在保存的真实响应能被 Android 解析时，才能确认是引擎缺口。
- `RULE_SYNTAX_ERROR` 即使离线稳定复现，也只能标记为 `RULE_OR_ENGINE_SEMANTICS`；Android 对同一最小输入失败才偏向书源规则错误，Android 通过而 Tauri 失败才确认引擎兼容缺口。

生成候选清单：

```bash
pnpm audit:sources:candidates -- \
  --input /绝对路径/source-replay.json \
  --output /绝对路径/source-candidates.json
```

只有 `state=ready_for_differential` 的候选可以进入下一阶段；HTTP 错误体、登录壳、挑战页会标为 `ineligible_response`，缺少目标数据或失败字段则分别标为 `blocked_missing_target_data`、`blocked_missing_field`。

## 4. 固化 Android/Tauri 兼容契约

把确认过的最小输入加入 `testdata/source-compat/`，然后分别执行：

```bash
pnpm audit:sources:fixtures
pnpm audit:sources:android-fixtures
```

对新候选先在私有目录提取规则级夹具：

```bash
pnpm audit:sources:extract-candidate -- \
  --diagnostics /绝对路径/diagnostics-v1.json \
  --replay /绝对路径/source-replay.json \
  --candidate sourceId:stage \
  --output /绝对路径/private-candidate.json
```

自动提取的夹具固定写入 `privacyReview.minimized=false`、`sanitized=false`。人工最小化并确认不含 Cookie、令牌、用户数据和完整网页后，才能把两项改为 `true` 并执行：

```bash
pnpm audit:sources:differential -- \
  --fixture /绝对路径/private-candidate.json \
  --output /绝对路径/differential.json
```

该命令会让 Tauri 规则求值器和 Android `AnalyzeRule` 执行同一输入，并记录相同的 `fixtureHash`、两端实际结果和差异。已有夹具基线通过不代表候选差分完成；缺少候选夹具时阶段状态必须是 `blocked_missing_candidate_fixture`。

修复应落在规则编译/求值、传输、响应转换或脚本宿主的通用边界，不得写成特定域名补丁。完成后重放原诊断包，再重跑相同能力书源群并检查历史差异。

只有同时满足以下条件，主 Agent 才能把候选状态提升为“已确认引擎缺口”并进入修补：

1. 同一份最小、脱敏输入能稳定离线复现；
2. Android expected 来自 Android `AnalyzeRule`/Rhino 的实际执行；
3. Android 对该输入通过或得到确定结果，而 Tauri 失败或结果不同；
4. 已记录最早差异边界和受影响能力群。
