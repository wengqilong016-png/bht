# BHT 源码审查记录

> 日期: 2026-05-22
> 审查起点: GitHub Actions `a53ca81` CI / Vercel / Android APK 均通过。

## 已处理

### 1. 司机缺少 `driverId` 时读写缓存 key 不一致

- 现象: `App.tsx` 读取数据时使用 `currentUser.driverId ?? currentUser.id`，但 `useSupabaseMutations` 乐观更新只使用 `currentUser.driverId`。
- 风险: 司机账号没有独立 `profile.driver_id` 时，收款成功后交易和结算会写入 `driver:pending` 缓存，当前司机视图读取 `driver:<user.id>`，导致页面不刷新或数据短暂消失。
- 修复: `useSupabaseMutations` 内统一计算 `activeDriverId`，与 `useSupabaseData` 作用域保持一致。
- 验证: `npm run test:ci -- __tests__/hooks/useSupabaseMutations.test.tsx`、`npm run typecheck`、`npm run lint`。

### 2. 离线队列重复交易回放与后端幂等语义不一致

- 证据: `offlineQueue.ts` 注释要求重复 `txId` 回放视为成功并标记 synced；`collectionSubmissionService.ts` 对 RPC 返回 `tx_conflict` 时返回失败。
- 风险: 已在服务端成功写入但客户端未确认的离线记录，重放时可能进入失败/死信，而不是清队列。
- 修复: `submitCollectionV2` 将 `tx_conflict` 视为幂等成功，返回服务端已有交易行并标记 `idempotentReplay`；回放不会重复写 finance audit。
- 验证: `npm run test:ci -- collectionSubmissionService.test.ts`、`npm run test:ci -- offlineQueueReplay.test.ts`、`npm run test:ci -- collectionSubmissionOrchestrator.test.ts`、`npm run typecheck`、`npm run lint`。

### 3. Money 值对象被当作 number 传给司机收款 UI

- 证据: `financeCalculator.ts` 返回 `Money`，但 `FinanceSummarySections.tsx`、`SubmitReview.tsx` 类型仍按 number 渲染，调用 `toLocaleString()`。
- 风险: 金额显示可能变成对象字符串或重复单位，数字比较/加减可能出现错误。
- 修复: 在司机收款 UI 边界引入 `FinanceAmount` 兼容层，显示/比较统一转为 number；移除 `DriverCollectionFlow` 对 `financeResult` 的类型逃逸，并修复 `QuickCollect` 的直接 `Money.toLocaleString()`。
- 验证: `npm run test:ci -- FinanceSummary.test.tsx`、`npm run test:ci -- DriverCollectionFlow.test.tsx`、`npm run test:ci -- SubmitReview.test.tsx`、`npm run test:ci -- QuickCollect.test.tsx`、`npm run typecheck`、`npm run lint`。

### 4. 公共 AI API 缺少服务端鉴权与限流

- 证据: `api/scan-meter.ts`、`api/admin-ai.ts`、`api/translate.ts` 公开 POST 后直接使用服务端 AI key。
- 风险: 公开调用者可消耗 AI 配额；当前主要是成本和滥用风险，不是直接数据泄露。
- 修复: 新增服务端 `requireApiUser` 会话/角色校验和内存窗口限流；客户端请求自动带 Supabase session bearer token；扫描、翻译允许 admin/driver，管理员 AI 仅允许 admin。
- 验证: `npm run test:ci -- apiAuth.test.ts`、`npm run test:ci -- scanMeterService.test.ts`、`npm run test:ci -- translateService.test.ts`、`npm run test:ci -- useAdminAI.test.ts`、`npm run typecheck`、`npm run lint`。

### 5. 司机更新站点信息的 RLS 范围偏宽

- 证据: schema/migration 允许司机更新分配给自己的 location 行，但未限制列级权限。
- 风险: 持有 anon key + driver JWT 的客户端可尝试更新非 UI 暴露字段。
- 修复: 新增 `enforce_driver_location_update_fields` 触发器，仅当业务角色为 driver 时限制可变更列；司机只能维护当前 UI 使用的店主姓名、电话、店主照片，admin 和 service 维护路径不受影响。
- 验证: `git diff --check`、schema/migration 读回验证；当前未连接本地 Supabase 数据库，未实际执行迁移。
