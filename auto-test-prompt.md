# 书源自动化测试 Prompt 模板

本文档提供执行 `test-source.yaml` 自动化书源测试时的常用提示词（Prompt），覆盖全流程审计、断点继续和修补后复验等场景。

---

## 1. 全新完整审计

> **适用场景**：更换数据库、引擎有较大改动或定期全面检查。

```markdown
根据项目根目录最新的 test-source.yaml，从阶段 1 到阶段 6 执行完整书源测试流程。

输入数据库：
/home/syusuke/.local/share/io.legado.reader/legado_reader.dev.db

本次使用新的私有输出目录：
/home/syusuke/.local/state/legado-reader/source-audit/{新的运行编号}/

测试范围：enabled
初始模式：quick
并发数：1

严格执行响应资格门和 Android/Tauri 同输入差分门槛。只有候选达到 confirmed_engine_gap_candidate，才能实施最小通用引擎修补；否则不得修改引擎。

保留现有未提交修改，不提交、不推送、不发布。最终按 test-source.yaml 的 final_report 要求汇总全部阶段、产物、阻断原因和验证结果。
```

---

## 2. 从现有报告继续

> **适用场景**：在线测试已经完成，只需继续执行阶段 3～6。

```markdown
根据最新 test-source.yaml，使用本次运行目录中的现有在线审计和私有诊断包，从阶段 3 继续执行到阶段 6。

运行目录：
/绝对路径/source-audit/{运行编号}/

先检查 replay 报告是否包含 responseEligibility、attribution.state 和 summary.readyForDifferential。旧格式报告必须重新离线重放，不能直接进入阶段 4。

只处理 ready_for_differential 候选。只有同一最小脱敏输入下 Android 与 Tauri 实际结果不同，才能修补引擎。最终逐项报告候选结果和阻断原因。
```

---

## 3. 修补后复验

> **适用场景**：已经确认并修补了某个引擎缺口。

```markdown
根据最新 test-source.yaml，对已修补的候选执行阶段 6 复验。

运行目录：
/绝对路径/source-audit/{运行编号}/

重新执行候选 Android/Tauri 差分、原诊断包离线重放、相关能力分组在线测试和统一回归。确认原始差异消失且没有引入回归。

不要继续修改其他语义；如发现新差异，将其作为新候选报告，不要自动扩大修补范围。
```

---

## 核心原则

> [!IMPORTANT]
> 1. **独立输出目录**：每次正式执行必须使用新的输出目录，严禁复用上一轮的 `quick-replay.json` 或 `quick-candidates.json`。
> 2. **模板用途**：完整长提示词保留作为“正式全流程模板”，日常测试直接使用上述简短提示词即可。