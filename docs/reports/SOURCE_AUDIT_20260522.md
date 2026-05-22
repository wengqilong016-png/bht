# BHT 源码审查记录

> 日期: 2026-05-22
> 当前验证基线: GitHub Actions `4c2aae2` CI / Vercel / Android APK 均通过。

## 已处理

### 1. 司机缺少 `driverId` 时读写缓存 key 不一致

- 现象: `App.tsx` 读取数据时使用 `currentUser.driverId ?? currentUser.id`，但 `useSupabaseMutations` 乐观更新只使用 `currentUser.driverId`。
- 风险: 司机账号没有独立 `profile.driver_id` 时，收款成功后交易和结算会写入 `driver:pending` 缓存，当前司机视图读取 `driver:<user.id>`，导致页面不刷新或数据短暂消失。
- 修复: `useSupabaseMutations` 内统一计算 `activeDriverId`，与 `useSupabaseData` 作用域保持一致。
- 验证: `npm run test:ci -- __tests__/hooks/useSupabaseMutations.test.tsx`、`npm run typecheck`、`npm run lint`。

## 待处理

### 2. 离线队列重复交易回放与后端幂等语义不一致

- 证据: `offlineQueue.ts` 注释要求重复 `txId` 回放视为成功并标记 synced；`collectionSubmissionService.ts` 对 RPC 返回 `tx_conflict` 时返回失败。
- 风险: 已在服务端成功写入但客户端未确认的离线记录，重放时可能进入失败/死信，而不是清队列。
- 建议: 针对 `tx_conflict` 增加幂等成功分支，并补真实 `submitCollectionV2` 回放测试。

### 3. Money 值对象被当作 number 传给司机收款 UI

- 证据: `financeCalculator.ts` 返回 `Money`，但 `FinanceSummarySections.tsx`、`SubmitReview.tsx` 类型仍按 number 渲染，调用 `toLocaleString()`。
- 风险: 金额显示可能变成对象字符串或重复单位，数字比较/加减可能出现错误。
- 建议: 在 UI 边界统一用 `Money.toNumber()` 或 `Money.format()`，移除 `as unknown as` / `as any` 类型逃逸。

### 4. 公共 AI API 缺少服务端鉴权与限流

- 证据: `api/scan-meter.ts`、`api/admin-ai.ts`、`api/translate.ts` 公开 POST 后直接使用服务端 AI key。
- 风险: 公开调用者可消耗 AI 配额；当前主要是成本和滥用风险，不是直接数据泄露。
- 建议: 增加会话校验、角色校验和基础限流。

### 5. 司机更新站点信息的 RLS 范围偏宽

- 证据: schema/migration 允许司机更新分配给自己的 location 行，但未限制列级权限。
- 风险: 持有 anon key + driver JWT 的客户端可尝试更新非 UI 暴露字段。
- 建议: 改为受限 RPC 或列级授权，只开放司机可维护字段。
