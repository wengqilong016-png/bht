# BHT 项目扫描报告
> 生成时间: 2026-05-22

## 总体评估：✅ 中等健康

| 维度 | 状态 | 说明 |
|------|------|------|
| 测试覆盖 | ✅ 优 | 96 测试文件 vs 17 源文件 |
| 类型安全 | ⚠️ 中 | 5 个 TS 编译错误待修 |
| Lint | ✅ 干净 | 0 错误 |
| 遗留 TODO | ✅ 干净 | 几乎无残留 |
| 架构加固 | ✅ 已完成 | Money/EventBus/AuditConsumer 已实现 |

---

## P0 - 必须修复

### 1. TypeScript 编译错误（5 处）
Money 类型已引入但部分文件未适配：

| 文件 | 行 | 错误 |
|------|----|------|
| `driver/components/QuickCollect.tsx` | 575 | `toNumber()` 不存在于 `number` 类型 |
| `driver/pages/DriverCollectionFlow.tsx` | 461 | `toNumber()` 不存在于 `number` 类型 |
| `services/financeCalculator.ts` | 186 | `Money` 不能赋值给 `number` |
| `services/financeCalculator.ts` | 193 | `isNegative()` 不存在于 `number` 类型 |

**原因**：Money 值对象已实现 (`utils/money.ts`)，但调用方未从 number 迁移到 Money。

---

## P1 - 建议处理

### 2. 未暂存的改动（22 个文件）
```
M  __tests__/offlineQueueReplay.test.ts
M  __tests__/transactionBuilder.test.ts
M  components/DebtManager.tsx
M  components/dashboard/SitesTab.tsx
M  driver/components/QuickCollect.tsx
M  driver/components/SubmitReview.tsx
M  driver/pages/DriverCollectionFlow.tsx
M  offlineQueue.ts
M  package.json
M  services/collectionSubmissionOrchestrator.ts
M  services/financeAuditService.ts
M  services/financeCalculator.ts
M  supabase/schema.sql
M  tsconfig.json
M  types/constants.ts
M  types/models.ts
M  utils/transactionBuilder.ts

新文件:
?? __tests__/auditConsumer.test.ts
?? __tests__/eventBus.test.ts
?? __tests__/scoreEventSourcing.test.ts
    utils/auditConsumer.ts
    utils/eventBus.ts
    utils/money.ts
    services/collectionSubmissionAudit.ts
```

需要 review 后 commit。

### 3. docs/adr/ 目录未创建
`docs/ADR-phase0-authority-lock.md` 存在但不在标准的 `docs/adr/` 目录下。

---

## P2 - 观察项

- `console.warn` 全部用于 error handling，是合理的
- 测试覆盖率高（96 vs 17），但不确定是否覆盖了新增的架构代码
- 无 `as any` / `@ts-ignore` 等类型逃逸，类型纪律好
- 依赖版本较新（React 19, Supabase JS v2）
