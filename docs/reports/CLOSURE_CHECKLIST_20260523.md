# BHT 收尾清单

日期: 2026-05-23

## 当前结论

- `H1` 已修复: `offlineQueue.flushQueue()` 改为按 `timestamp` 升序回放，`lamportTs` 仅作为同时间戳的次排序键。
- `M1` 已修复: `calculateCollectionFinancePreview()` 在 RPC 契约漂移时输出明确告警，包含 `locationId` 和请求参数数量。
- `M3` 已修复: 收款金额字段增加前端 `max` 约束；超限输入提交前必须确认；预览与提交边界统一按前端安全上限截断。
- `M5` 已收口: 文档状态与当前有效迁移/验证结果同步，不再保留“未产出任何结果”这类失效描述。

## 修改范围

- 代码:
  - `offlineQueue.ts`
  - `services/financeCalculator.ts`
  - `services/collectionSubmissionOrchestrator.ts`
  - `driver/components/SubmitReview.tsx`
  - `driver/components/QuickCollect.tsx`
  - `driver/components/finance/FinanceSummarySections.tsx`
  - `types/constants.ts`
  - `utils/collectionAmountLimits.ts`
- 测试:
  - `__tests__/offlineQueueReplay.test.ts`
  - `__tests__/financeCalculator.test.ts`
  - `__tests__/collectionSubmissionOrchestrator.test.ts`
  - `__tests__/SubmitReview.test.tsx`
  - `__tests__/QuickCollect.test.tsx`

## 验证状态

| 项目 | 命令 | 结果 |
|------|------|------|
| 定向回归 | `npm test -- --runInBand __tests__/financeCalculator.test.ts __tests__/offlineQueueReplay.test.ts __tests__/collectionSubmissionOrchestrator.test.ts __tests__/SubmitReview.test.tsx __tests__/QuickCollect.test.tsx` | 通过，153/153 |
| 类型检查 | `npm run typecheck` | 通过 |
| Lint | `npm run lint` | 通过（仓库现有 warning 未新增 error） |
| 全量覆盖测试 | `npm run test:coverage:ci` | 通过，100 suites / 1066 tests |
| 安全审计 | `npm run security:audit` | 通过（1 个 moderate，不阻塞当前 CI） |
| 构建 | `npm run build` | 通过 |
| E2E | `npm run test:e2e` | 未通过，当前环境 Playwright/Chromium 启动权限失败 |
| 远端 Actions | `push origin main` 后检查 GitHub Actions | 通过：`CI` / `Build Android APK` / `Deploy to Vercel` / `Push on main` 全部 success |

## E2E 阻塞说明

失败不是业务断言失败，而是浏览器进程在建页前崩溃，关键日志如下：

- `libGLESv2.so: cannot open shared object file: Permission denied`
- `sandbox_linux.cc:616 ... Permission denied`
- `GPU process isn't usable. Goodbye.`

这说明当前执行环境无法正常启动 Playwright Chromium，不能据此判断本轮业务改动存在功能回归。

## 剩余风险

- 本地 `npm run test:e2e` 仍受当前环境的 Chromium 权限限制，后续若要在本机复现 E2E，需要先修复 Playwright 浏览器运行环境。
- `npm audit` 仍有 1 个 `moderate` 级 `brace-expansion` 告警，本轮未升级依赖。
