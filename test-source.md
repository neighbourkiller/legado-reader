你是协调 Agent。可以把以下任务并行委派给子 Agent：
- Agent A：静态盘点和在线批测汇总；
- Agent B：诊断包离线重放和失败聚类；
- Agent C：Android 原版语义与共享夹具验证。

只有主 Agent 可以修改引擎代码。子 Agent 先返回证据，不得分别对同一引擎文件并发修改。主 Agent 汇总三方证据后，再实施通用修复并完成统一回归。

你正在 /home/syusuke/projects/legado 仓库工作。

目标：
使用现有书源审计工具测试已导入书源，汇总失败模式；通过离线重放和 Android Legado 行为对照确认真正的引擎兼容缺口；然后对 modules/web-reader 的 Tauri 书源引擎做最小、通用修补，并完成回归验证。

输入与输出配置:

1. 输入数据库
   - 书源数据库：
     /home/syusuke/.local/share/io.legado.reader/legado_reader.dev.db
2. 输出目录
   - 批次根目录：
     /home/syusuke/.local/state/legado-reader/source-audit/2026-08-30-agent-run-01
   - 普通测试报告：
     /home/syusuke/.local/state/legado-reader/source-audit/2026-08-30-agent-run-01/report.json
   - 敏感诊断目录：
     /home/syusuke/.local/state/legado-reader/source-audit/2026-08-30-agent-run-01/diagnostics
3. 测试参数
   - 测试范围：enabled
   - 初始模式：quick
   - 并发数：1

工作原则：
1. 使用中文沟通。
2. 先读取仓库 AGENTS.md 和 modules/web-reader/docs/source-audit-agent-workflow.md。
3. 保留工作区现有未提交修改，不覆盖、回滚或格式化无关文件。
4. 允许对目标书源发起网络请求；禁止上传、公开或提交诊断包。
5. 不修改数据库中的书源配置；外部 SQLite 必须只读。
6. 不因为 EMPTY_RESULT 就直接修改引擎或 CSS 规则。
7. NETWORK_ERROR、DNS_ERROR、TIMEOUT、HTTP_ERROR、SECURITY_CHALLENGE、NEEDS_LOGIN 默认不是引擎兼容缺口。
8. 只有在保存的响应可以稳定离线重放，并且 Android 对同一最小输入可以得到不同结果时，才确认引擎缺口。
9. 修复必须是通用语义修复，禁止根据特定域名、书源名或固定页面内容打补丁。
10. Android 专属能力无法安全跨平台实现时，保留明确的 UNSUPPORTED_ANDROID_API，不得伪装支持。
11. 跨平台能力通过 src/platform/ 抽象；页面不能直接耦合 Tauri API。
12. 诊断包可能含私人响应内容，不要在回复中粘贴完整正文、Cookie、Token、Authorization 或敏感 URL。

第一阶段：静态盘点

从 modules/web-reader 执行：

pnpm audit:sources:static -- <BOOK_SOURCE_DB_ABSOLUTE_PATH> \
  > <PRIVATE_OUTPUT_DIR_ABSOLUTE_PATH>/static-audit.json

读取报告并汇总：
- 书源总数、启用数、类型分布；
- XPath、JSONPath、JavaScript、mainJs、WebView、图片解密等能力分布；
- 静态不支持项及其数量；
- 后续在线测试应重点覆盖的能力群。

注意：静态报告不是在线测试结果。

第二阶段：真实 Tauri 快速批测

确保私有输出目录权限为 0700，然后执行：

pnpm audit:sources:live -- \
  --db <BOOK_SOURCE_DB_ABSOLUTE_PATH> \
  --output <PRIVATE_OUTPUT_DIR_ABSOLUTE_PATH>/quick-audit.json \
  --diagnostics <PRIVATE_OUTPUT_DIR_ABSOLUTE_PATH>/quick-diagnostics \
  --mode quick \
  --scope enabled \
  --concurrency 1

退出码含义：
- 0：没有 failed 阶段；
- 1：报告生成成功，但存在测试失败；
- 2：参数、载入或写入失败。

退出码为 1 时必须继续读取 JSON，不得把它当作工具运行失败。

按以下维度汇总：
- 阶段：static/login/search/explore/bookInfo/toc/content/image；
- 错误码；
- 书源能力；
- 请求通道：reqwest/webview；
- 相同字段位置；
- 同一响应特征或同一种规则语法。

普通报告的错误码只用于初步分流。`RULE_SYNTAX_ERROR` 不等于已经确认书源规则错误。读取私有诊断包中的 `cases[].failures[stage]`，记录：
- `category`：在线归一化分类；
- `rawCode`：例如 `INVALID_XPATH`、`INVALID_SELECTOR`、`RULE_EXECUTION_FAILED`；
- `stage` 和 `field`；
- `compatibilityMode`。

诊断包不会保存异常消息、规则正文或 cause。不得为了取得这些内容而把未脱敏异常写入普通报告。

不要逐个网站盲修。优先寻找能解释多个失败源的共同最早故障。

第三阶段：离线重放和归因

执行：

pnpm audit:sources:replay -- \
  --input <PRIVATE_OUTPUT_DIR_ABSOLUTE_PATH>/quick-diagnostics/diagnostics-v1.json \
  --output <PRIVATE_OUTPUT_DIR_ABSOLUTE_PATH>/quick-replay.json

对每组失败按以下规则归因：

先读取重放结果中的：
- `originalCategory`、`rawCode`、`field`；
- `attribution.state`；
- `attribution.candidateCause`；
- `attribution.evidence`；
- `attribution.confirmationRequired`。

`attribution.state=candidate` 只代表候选方向，不代表已经确认。重放器不会自动输出“已确认引擎缺口”。

A. 在线失败，离线通过：
优先检查传输、Cookie、字符编码、重定向、响应转换、WebView 或安全挑战，不修改声明式解析器。

B. 在线和离线均失败：
检查响应是否确实包含目标数据，再检查字段规则和 Tauri 解析边界。

C. EMPTY_RESULT：
先确认真实响应不是登录页、验证码、空壳、加密外壳或错误页面。只有 Android 对同一响应能解析出结果，才列为引擎缺口。

D. RULE_SYNTAX_ERROR：
定位 RuleParser、RuleCompiler、RuleEvaluator、XPathConverter、JSONPath 或组合/索引语义。
即使 `rawCode=INVALID_XPATH` 或 `INVALID_SELECTOR`，也不能直接判定书源规则错误；Android 可能支持 Tauri 尚未转换的合法 Legado 语义。

E. JS_EXECUTION_ERROR / UNSUPPORTED_ANDROID_API：
定位 QuickJS 宿主 API、变量、java.* 兼容桥或响应转换钩子。评估能力是否能安全、独立地跨平台实现。

F. WEBVIEW_ERROR：
定位 WebView 生命周期、执行上下文、Cookie 同步和页面加载完成边界。

每个候选引擎缺口都必须记录：
- 失败阶段和字段；
- 脱敏请求信息；
- 响应是否成功捕获；
- 离线重放结果；
- Android 期望；
- Tauri 当前结果；
- 最早因果故障；
- 受影响的其他书源或能力群。
- 在线归一化类别和私有诊断底层错误码；
- 重放候选原因、证据状态和仍需补充的确认步骤。

归因状态必须使用以下三层，不得跳级：
- `unresolved`：缺少可重放响应或证据不足；
- `candidate`：已定位候选边界，但尚无 Android 差分；
- `confirmed_engine_gap`：同一最小输入由 Android 实际执行通过，而 Tauri 稳定失败或结果不同。

第四阶段：建立最小 Android/Tauri 差分夹具

为确认的兼容缺口：
1. 从真实失败响应提取最小、脱敏、稳定输入；
2. 加入 testdata/source-compat/ 对应夹具；
3. Android expected 必须来自 Android AnalyzeRule/Rhino 的实际执行结果，不能手工猜测；
4. 先确认新夹具在修复前能稳定暴露差异；
5. 不把整个真实网页、Cookie、Token 或用户数据提交到仓库。
6. 只有 Android 实际结果和 Tauri 实际结果形成稳定差分后，才把状态从 `candidate` 更新为 `confirmed_engine_gap`。

运行基线：

pnpm audit:sources:fixtures
pnpm audit:sources:android-fixtures

第五阶段：修补引擎

仅修复状态为 `confirmed_engine_gap` 且已经被差分证据确认的通用缺口。`RULE_SYNTAX_ERROR`、`EMPTY_RESULT` 或 `candidateCause=RULE_OR_ENGINE_SEMANTICS` 本身不构成修改引擎的授权证据。

可能的修补位置：
- src/source/engine/RuleParser.ts
- src/source/engine/RuleCompiler.ts
- src/source/engine/RuleEvaluator.ts
- src/source/engine/XPathConverter.ts
- src/source/engine/SearchParser.ts
- src/source/engine/BookInfoParser.ts
- src/source/engine/TocParser.ts
- src/source/engine/ContentParser.ts
- src/source/engine/SourceEngine.ts
- src/platform/sourceScripts.ts
- src-tauri/src/source_script.rs
- src-tauri/src/source_http.rs
- src-tauri/src/cookie_store.rs

要求：
- 做最小正确修改；
- 不修改特定书源 JSON 来掩盖引擎问题；
- 不加入域名判断；
- 保留标准模式与 Legado 兼容模式的边界；
- 新增对应回归测试；
- 保持批测过程不写回书源变量或数据库。

第六阶段：验证修复

至少执行：

pnpm test
pnpm build:web
pnpm build:desktop-ui
pnpm exec vue-tsc --build --force
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
pnpm audit:sources:fixtures
pnpm audit:sources:android-fixtures
git diff --check

然后重新执行原诊断包的离线重放，确认目标差异已消失。

再对最初失败的同能力书源群执行快速在线批测。必要时对通过快速测试的代表源运行 full 模式，但登录、验证码、付费和安全挑战不得自动绕过。

最终回复必须包含：

1. 测试范围和书源数量；
2. 按阶段、错误码、能力分类的汇总；
3. 确认的引擎缺口与证据链；
4. 排除的网络、登录、站点失效或书源规则问题；
5. 修改的文件及通用语义；
6. 新增的 Android/Tauri 共享夹具；
7. 修复前后重放和在线批测变化；
8. 实际执行的测试及结果；
9. 仍不支持或未验证的边界；
10. 明确说明是否没有真实发布、打包、提交或推送。

不要只报告“测试通过”。必须区分：
- 已确认事实；
- 根据证据作出的推断；
- 尚未验证的假设。
