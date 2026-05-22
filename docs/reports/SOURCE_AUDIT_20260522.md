# BHT 源码审查记录

> 日期: 2026-05-22
> 审查起点: GitHub Actions `a53ca81` CI / Vercel / Android APK 均通过。
> 审查范围: **全源码** — 160+ 源文件, 60 迁移文件, 4 Edge Functions, Service Worker, PWA manifest, Vercel 配置
> 审查方法: 10 路并行审计覆盖所有代码域

---

## 已处理 (已完成修复)

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

### 6. Runtime Supabase 连接设置未阻止 service_role key

- 证据: `supabaseClient.ts` 明确警告 runtime credentials 只能保存 anon key，但 `saveRuntimeCredentials` 原先无条件写入 `localStorage`；`Login.tsx` 也只做 URL/key 非空校验。
- 风险: 管理员或运维误粘 service_role JWT 时，浏览器端会持久化绕过 RLS 的密钥。
- 修复: 保存前解码 Supabase JWT payload，明确识别 `role=service_role` 时拒绝保存；无法解码的 publishable key 不拦截，避免破坏新式公开 key。
- 验证: `npm run test:ci -- supabaseClient.test.ts`、`npm run typecheck`、`npm run lint`。

### 7. create-driver 失败回滚可能留下未绑定 driver 行

- 证据: `create-driver` Edge Function 由 Auth insert trigger 创建 `drivers/profiles`，但业务字段持久化失败时原先只删除 Auth 用户。
- 风险: Auth 删除会级联删除 profile，但不会删除新建的 `drivers` 行，后续再次创建同名司机可能遇到残留数据或脏展示。
- 修复: 创建 Auth 用户前记录 driver 行快照；回滚时如果本次新建 driver 则删除，如果原本存在则恢复 trigger 覆盖的 name/username。
- 验证: `npm run test:ci -- createDriverEdgeFunction.test.ts`、`npm run typecheck`、`npm run lint`。

---

## 审计发现 (待评估/修复)

### 统计摘要

| 域 | HIGH | MEDIUM | LOW |
|---|---|---|---|
| Admin 组件 | 1 | 4 | 6 |
| Driver 应用 | 4 | 6 | 7 |
| Services 层 | 3 | 7 | 5 |
| Hooks/Repos/Contexts | 3 | 10 | 5 |
| Edge Functions | 1 | 6 | 2 |
| 离线队列 (深度) | 6 | 8 | 6 |
| Schema/RLS/迁移 | 5 | 5 | 5 |
| Auth/Session | 0 | 5 | 3 |
| 跨域/PWA/CSP/构建 | 0 | 7 | 12 |
| 剩余文件 | 1 | 4 | 5 |
| **合计** | **24** | **62** | **56** |

---

## HIGH 严重性发现

### H1 — Realtime 广播暴露所有表的完整行数据
**域:** Schema/RLS | **文件:** `supabase/schema.sql:2657-2690`, `migrations/20260328000001_realtime_broadcast_triggers.sql:62-67`

`notify_table_changes()` (SECURITY DEFINER) 通过 `realtime.broadcast_changes()` 将完整 NEW/OLD 行广播到 topic。`realtime.messages` RLS 策略仅按 topic 过滤，任何已认证用户（含司机）可订阅所有 topic 并接收所有行。司机可看到其他司机的 `baseSalary`、`commissionRate`、`remainingDebt`、所有交易金额、所有结算。

**建议:** 实施 Realtime 发布/订阅模式（仅广播 row_id），或限制司机只能订阅过滤后的 channel。

### H2 — `support_audit_log` 允许任意已认证用户插入
**域:** Schema/RLS | **文件:** `supabase/schema.sql:2928-2930`

```sql
CREATE POLICY support_audit_log_insert ON public.support_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);
```

任何已认证用户（含司机）可插入任意审计记录，伪造事件类型和 actor_id。

**建议:** 收紧为仅允许 admin/service_role 写入，类似 `finance_audit_log` 的修复方式。

### H3 — `transaction_audit_log` 允许任意已认证用户插入
**域:** Schema/RLS | **文件:** `migrations/20260522000000_transaction_audit_log.sql:68-70`

与 H2 相同模式 — 异步审计管道表允许任意插入，可注入虚假审计检查结果。

**建议:** 限制 INSERT 权限或限制只能写入自身 driver_id 关联的交易。

### H4 — `amount_validation_audit` 允许任意已认证用户插入
**域:** Schema/RLS | **文件:** `migrations/20260522000000_amount_validation_gate.sql:50-52`

与 H2/H3 相同 — 金额验证审计表允许任意写入。

**建议:** 限制 INSERT 仅允许 RPC `log_amount_validation_failure` 写入，或收紧为 admin 专属。

### H5 — 存储桶标记为 PUBLIC（evidence + kiosk-photos）
**域:** Schema/RLS | **文件:** `schema.sql:29,78`, `migrations/20260404030000_create_evidence_bucket.sql:5`, `migrations/20260515001000_kiosk_photos_bucket.sql:7`

两个存储桶 `public = TRUE`，任何拥有 URL 的人可直接访问文件而无需通过 RLS。`kiosk-photos` 甚至没有 SELECT 策略——完全依赖桶公开性。证据照片包含机器位置、收款证明、GPS 嵌入数据。

**建议:** 设为 `public = FALSE`；通过签名 URL（临时过期）或服务器端代理提供访问。

### H6 — NaN 静默传播至所有金融字段
**域:** Services | **文件:** `services/collectionSubmissionService.ts:206-253`

`Number(row['someField'] ?? 0)` 不捕获 NaN — JavaScript `??` 运算符对 NaN 穿透（`NaN ?? 0` 求值为 `NaN`）。如果 RPC 返回意外 null 或 NaN numeric，以下字段全部静默变为 NaN：`previousScore`、`currentScore`、`revenue`、`commission`、`ownerRetention`、`debtDeduction`、`startupDebtDeduction`、`expenses`、`tip`、`coinExchange`、`extraIncome`、`netPayable`。NaN 进入 IndexedDB、显示给用户、参与后续算术，从不被检测。

**建议:** 替换 `?? 0` 为 `?? 0` 后加 NaN-guard；或在事务构造后做完整性检查 `if (fields.some(f => !Number.isFinite(tx[f])))`。

### H7 — driverManagementService 缺少授权检查
**域:** Services | **文件:** `services/driverManagementService.ts:86-105`

`persistDriverBusinessFields(driverId, fields)` 更新前从不验证已认证用户是否匹配目标 `driverId`。完全依赖 RLS 做访问控制。如果 RLS 策略被意外放宽，已认证司机可修改任何其他司机的 `initialDebt`、`remainingDebt`、`commissionRate`、`dailyFloatingCoins`、`baseSalary`。另外 `remainingDebt ?? fields.initialDebt` 可能静默抹去已偿还债务。

**建议:** 更新前加 `supabase.auth.getUser()` 断言匹配；调用者必须显式提供 `remainingDebt`。

### H8 — RPC 输入中的 IDOR：客户端提供 driverId
**域:** Services | **文件:** `services/collectionSubmissionService.ts:152-155`

`submit_collection_v2` 接收 `p_driver_id` 作为客户端参数，无不匹配检测。如果 RPC 函数信任 `p_driver_id` 而不与 `auth.uid()` 交叉验证，攻击者可代表其他司机提交收款。

**建议:** 服务器端 RPC 必须用 `auth.uid()` 独立验证司机身份。

### H9 — 离线队列：存储配额超出导致静默数据丢失
**域:** 离线队列 | **文件:** `offlineQueue.ts:226,414`

IDB 和 localStorage 都因超出配额失败时，`enqueueTransaction` 回退到 `memoryQueueCache`（纯 JS Map）。页面刷新时数据静默丢失。无 Sentry 捕获或 UI 警报告知存储不足。

**建议:** 添加 Sentry 捕获存储饱和事件；在 UI 中暴露存储状态警告。

### H10 — 离线队列：跨标签页完全无保护
**域:** 离线队列 | **文件:** `offlineQueue.ts:654,831`

`_isFlushing` 标志是每个 JS 执行上下文（标签页）本地变量。两标签页同时打开时都通过守卫，同时刷新相同待处理项目。无 `BroadcastChannel`、`SharedWorker`、或 `storage` 事件监听。非幂等遗留条目可能产生重复行。

**建议:** 实现跨标签页互斥（BroadcastChannel 或 IDB 级锁）。

### H11 — 离线队列：IDB 读取-修改-写入事务自动提交错误
**域:** 离线队列 | **文件:** `offlineQueue.ts:496-513,526-547,996-1021,1491-1504`

`markSynced`、`updateQueuedEvidencePhoto`、`recordRetryFailure`、`_updateDeadLetterError` 都执行 IDB `get` → `await` → `put`。IDB 事务在 `await` 交出控制权时自动提交，后续 `put` 抛出 `TransactionInactiveError`。错误被空 `catch {}` 吞噬。导致已同步项目在每次刷新循环被重复处理。

**建议:** 在单个 IDB 事务内完成 get+put（不要在之间 await）；或使用 non-transactional 模式。

### H12 — 离线队列：服务器确认与 markSynced 之间的窗口
**域:** 离线队列 | **文件:** `offlineQueue.ts:705,722`

服务器确认成功（`result.success === true`）和 `markSynced(entry.id)` 之间如果浏览器崩溃/标签页关闭，项目在服务器已接受但 IDB 中仍为待处理。下次刷新重放。正确性完全依赖服务器幂等性密钥的完整性。

**建议:** 服务器端幂等性必须审计无误；考虑在启动时验证服务器已有记录 vs IDB 待处理。

### H13 — 离线队列：localStorage/IDB 无协调，可能永久分歧
**域:** 离线队列 | **文件:** `offlineQueue.ts:433,499-517`

当 IDB 暂时不可用然后恢复：localStorage 含 IDB 关闭期间的入队/修改项目，IDB 含旧数据加恢复后的新写入。两者从不合并。localStorage 数据变成孤立数据。IDB 再次故障时，读取拾取陈旧的 localStorage 数据。

**建议:** IDB 恢复时合并两个存储；或完全废弃 localStorage 回退，只使用 IDB。

### H14 — 离线队列：遗留 upsert 路径绕过服务器端金额验证
**域:** 离线队列 | **文件:** `offlineQueue.ts:774-786`（代码注释明确承认）

遗留条目绕过 `submit_collection_v2` RPC 的金额验证门。`toTransactionUpsertPayload` 使用本地计算的财务值做原始 upsert。如果本地计算与服务器端预期不同，或 DB CHECK 约束有缺口，可通过离线队列注入不正确的财务数据。

**建议:** 最终移除遗留路径；确保 DB CHECK 约束无缺口。

### H15 — 客户端存储 OpenAI API key 常量
**域:** Types | **文件:** `types/constants.ts:17`

`OPENAI_KEY_STORAGE: 'bahati_openai_key'` 暗示 OpenAI API key 可能存储在客户端 localStorage。如果任何代码在浏览器端直接调用 OpenAI，API key 可被提取。

**建议:** 确认 key 仅服务端使用（通过 `api/_lib/aiClient.ts`）。如果是客户端使用，立即移除并改为服务端代理。

### H16 — 客户端唯一管理员权限检查（普遍存在）
**域:** Admin 组件 | **文件:** `DebtManager.tsx:126,130`, `DashboardPage.tsx:108,132`, `SitesTab.tsx:238-246` 等

所有 admin 限制操作仅由 `currentUser.role === 'admin'` 客户端布尔值门控。如果 Supabase RLS 策略不正确，任何已认证用户可看到全部 admin UI 并执行删除/修改/审批操作。

**建议:** 每个 mutation 必须有服务端 RLS `WHERE EXISTS` 策略检查 `auth.jwt()->>'role' = 'admin'`；客户端检查仅是装饰性的。

### H17 — 司机财务计算完全客户端执行
**域:** Driver | **文件:** `driver/hooks/useCollectionFinancePreview.ts:59-83`, `driver/components/QuickCollect.tsx:140-158`

Revenue、commission、net payable 等本地计算后立即显示。恶意客户端可操纵 `currentScore`、`coinExchange`、`ownerRetention`、`tip` 等自由编辑的文本输入值，在提交前修改财务计算。

**建议:** 服务器端独立重新计算和验证每个财务字段；不信任客户端计算的任何值。

### H18 — ReadingCapture 和 QuickCollect 中无照片压缩
**域:** Driver | **文件:** `driver/components/ReadingCapture.tsx:83-96`, `driver/components/QuickCollect.tsx:390-396`

两组件直接读取照片为 data URL（`FileReader.readAsDataURL(file)`），零压缩或缩放。现代手机照片 3-12MB，data URL 4-16MB。导致浏览器内存压力/崩溃、超额带宽消耗、对照片证据服务的拒绝服务。

**建议:** 统一使用 `compressAndResizeImage(file)` 后再读为 data URL（与 `ResetRequest.tsx` 一致）。

### H19 — resolveCurrentDriver 回退到 drivers[0] 实现跨司机数据访问
**域:** Driver | **文件:** `driver/driverShellViewState.ts:3-11`

`resolveCurrentDriver` 在 `activeDriverId` 为空或未找到时回退到 `drivers[0]`。`useNextQueuedMachine.ts:22` 进一步回退：如果没匹配 `currentDriverId` 的 location，返回 ALL locations。可能暴露远超司机分配范围的机器库存。

**建议:** 不回退到 `drivers[0]`；如果无法解析当前司机，明确报错。

### H20 — 乐观缓存更新在服务器确认前持久化到 localStorage
**域:** Driver | **文件:** `driver/hooks/useDriverSubmissionCompletion.ts:48-58,72-86`

`resetLocked: true` 和 `lastScore` 在 `submitTransaction.mutateAsync(tx)` 后立即写入 Query 缓存和 localStorage，不等待服务器确认。如果服务器拒绝事务，机器错误显示为已锁定且跨页面刷新持久化，司机无法收款。

**建议:** 仅在服务器确认后写入 localStorage；或分离乐观 UI 和持久化状态。

### H21 — Driver 类型含 password 字段
**域:** Hooks | **文件:** `hooks/useSupabaseData.ts:15-21`

`sanitizeDrivers` 显式 `delete safeDriver.password`，说明 TypeScript `Driver` 类型含 `password` 字段。虽然 `driverRepository.ts` 的 SELECT 列表不含 password，类型中的存在是危险信号——任何代码路径可能无意中设置或序列化此字段。

**建议:** 从 `Driver` 类型移除 `password` 字段。

### H22 — reviewSettlement 非原子突变
**域:** Hooks | **文件:** `hooks/useSupabaseMutations.ts:460-475`

`reviewSettlement` 的两个独立操作：(1) RPC 调用 → (2) `updateDriverCoins`。如果第一个成功第二个失败，数据库提交了结算审核但司机金币未更新。造成服务器端数据不一致。

**建议:** 将司机金币更新移入 `review_daily_settlement_v1` RPC 保持原子性。

### H23 — upsertTransaction 无字段过滤
**域:** Repositories | **文件:** `repositories/transactionRepository.ts:70-73`

`upsertTransaction` 接收 `Partial<Transaction>` 直接传给 `.upsert(tx)`，无字段白名单。仅移除 `isSynced` 和 `stats`。如果 RLS 允许写入，可设置任意列值。

**建议:** 实施字段白名单，类似 `toDriverUpdatePayload()`。

### H24 — create-driver TOCTOU 竞态
**域:** Edge Functions | **文件:** `supabase/functions/create-driver/index.ts:116-133 vs 149-184`

两个并发 admin 请求相同 `driver_id` 都会通过查重检查（都看不到已有 profile），然后都创建 Auth 用户。第二个触发数据库级约束违反，产生混乱的部分失败状态。

**建议:** 数据库级唯一约束 + 将查重加创建包装在原子存储过程中。

---

## MEDIUM 严重性发现

### 数据完整性与金融

**M1 — 金融审计写入即发即弃且静默失败**
`services/collectionSubmissionService.ts:256-288`, `services/financeAuditService.ts:49-78`
审计写入错误被空 catch 吞噬。无重试、无死信队列、无 UI 指示审计不完整。

**M2 — 金融审计日志读取缺少应用层授权**
`services/financeAuditService.ts:89-108`
`fetchFinanceAuditLog()` 无应用层角色检查。仅依赖 RLS 做访问控制。

**M3 — 通知读写缺少应用层访问控制**
`services/adminNotifications.ts:98-141`
`fetchAdminNotifications` 和 `markAdminNotificationsRead` 无应用层授权。如果 RLS 策略错误，司机可读/标记管理员通知。

**M4 — upsert:true 允许覆盖证据文件**
`services/evidenceStorage.ts:85,48-51`
对象路径 `{category}/{driverId}/{entityId}.{ext}` 是确定性的。知道路径格式的攻击者可覆盖证据照片。

**M5 — 证据文件通过永久公开 URL 访问**
`services/evidenceStorage.ts:137`
`getPublicUrl` 返回无需认证的公开 URL。URL 模式可预测。攻击者可遍历实体 ID 收集照片。

**M6 — Money.tzs().toNumber() 精度损失风险**
`services/collectionSubmissionOrchestrator.ts:190`, `services/financeCalculator.ts:77`
整数硬币计数经过不必要的 `Money.tzs()` → `BigInt` → `toNumber()` 转换链。对极端值可能产生意外浮点效应。

**M7 — GPS 输入验证不足**
`services/collectionSubmissionService.ts:37-42`
`isValidGps` 不检查范围。lat 可 >90 或 < -90，lng 可 >180 或 < -180。

**M8 — 非原子的逐循环批量更新**
`repositories/driverRepository.ts:62-71`
`updateDrivers` 循环逐条更新无事务包装。第三次失败时前两次已提交，服务器状态与客户端缓存不一致。

**M9 — upsertSettlement 无字段过滤**
`repositories/settlementRepository.ts:36-39`
`upsertSettlement` 将 `Partial<DailySettlement>` 直接传给 `.upsert(settlement)`，可能允许覆写 `adminId`、`timestamp` 等服务器管理字段。

**M10 — 管理员和司机交易字段完全相同**
`repositories/transactionRepository.ts:7-27`
`DRIVER_TX_FIELDS` 和 `ADMIN_TX_FIELDS` 选择完全相同的列。如果意图是限制司机查看某些字段（`payoutAmount`、`commission`），此白名单无效。

### 离线队列

**M11 — 死信项目无限累积**
`offlineQueue.ts:619,632,1066-1076`
`pruneOldSynced` 只清理已同步项目，跳过死信。死信永不自动清除。遭受队列投毒时 IDB 存储持续增长。

**M12 — nextRetryAt 无效日期字符串导致无限重试**
`offlineQueue.ts:878`
`new Date(invalid).getTime()` 返回 NaN；`NaN > now` 为 false，守卫始终放行。损坏数据导致每次刷新都尝试。

**M13 — 入队时无验证**
`offlineQueue.ts:375-416`
无 `tx.id` 存在性、类型一致性、`dependsOn` 格式、或数据大小在 IDB 限制内的检查。

**M14 — onProgress 回调可中断刷新**
`offlineQueue.ts:908,913`
如果提供的 `onProgress` 抛出异常，刷新循环提前退出，未刷新项目遗留。

**M15 — IDB 损坏静默无限期阻塞同步**
`offlineQueue.ts:293,433,499`
如果 IDB 部分损坏（打开成功但查询返回损坏数据），`flushQueue` 反复失败，项目推入死信，无用户可见警报。

**M16 — 多个 catch 块无 Sentry 报告**
`offlineQueue.ts:516,549,640,1032,1169,1239`
静默数据丢失、无限重试循环等生产场景中调试困难。

**M17 — 队列存储财务明细+GPS+base64 图像**
`offlineQueue.ts:29,47-49,75,306-361`
Transaction 完整数据（revenue、commission、GPS 坐标、base64 图像）在 IDB 中以明文存储。base64 图像可能含嵌入式 EXIF GPS 数据。

**M18 — 设备 ID 重置使队列跨存储不一致**
`offlineQueue.ts:1528-1547`
清除 localStorage 后 `deviceId` 变更。IDB 中现有队列项目保留旧 deviceId。管理员无法追溯死信项目至来源设备。

### Schema/RLS/Edge Functions

**M19 — apply_location_change_request 应用任意 JSONB 补丁**
`schema.sql:795-855`
补丁内容无数据库端验证。如果 `patch` 含恶意条目（`assignedDriverId: "malicious"`、`dividendBalance: "999999"`）且被 admin 批准，意外字段被盲目应用。

**M20 — notifications SELECT 策略暴露 driverId IS NULL 行给所有司机**
`schema.sql:2888-2894`
任何司机可看到所有 `driverId IS NULL` 的系统通知。如果某通知因 bug driverId 为 NULL，所有设备可见。

**M21 — resolve_support_case_v1 使用 SECURITY INVOKER**
`schema.sql:2140-2209`
不寻常模式——调用依赖 RLS。如果 RLS 被意外放宽，此函数成为提权载体。

**M22 — Edge Function 原始数据库错误消息泄露给客户端**
`supabase/functions/create-driver/index.ts:143,181,229,243,269`, `supabase/functions/delete-driver/index.ts:47-68,109,118,137,146`
所有错误路径直接将 Supabase 错误消息插入 JSON 响应体。可能含关系名、列名、约束名。

**M23 — create-driver 缺少输入验证**
`supabase/functions/create-driver/index.ts:58,96,97,98,103-106`
`vehicleInfo` 任意 JSON 无验证、`driver_id` 无 UUID 格式检查、`email` 无格式验证、`password` 无复杂度要求、`username` 无字符集验证。

**M24 — 原始 Phase 2 SECURITY DEFINER 函数缺少 auth.uid() 检查**
`migrations/20240105000000_phase2_ledger_reconciliation.sql:143-209`
（已在 `20260506110000` 修复）`record_task_settlement` 和 `submit_daily_reconciliation` 原始版本完全缺少 `auth.uid()` 验证。

**M25 — SECURITY DEFINER 函数 search_path 含不必要的 auth schema**
多个迁移文件。违反 SECURITY DEFINER 最小 search_path 原则。

### Admin/Driver UI

**M26 — TransactionHistory DOM 直接操作**
`components/TransactionHistory.tsx:296-308`
`btn.innerHTML = '翻译中...'` 使用 innerHTML 绕过 React 渲染周期。React 重新渲染时 DOM 变更消失。

**M27 — 多处表单输入验证不足**
`components/MachineRegistrationForm.tsx:354,430`, `components/SitesTab.tsx:687`, `components/DriverForm.tsx:156-176`
`commissionRate` 无上限（可设 5000%）、`baseSalary` 可为负、`initialDebt` 无界。数据直接流入金融计算。

**M28 — 管理员审批视图中的 SSRF（img URL）**
`components/AdminApprovalTaskList.tsx:207-208,296-299,319`, `components/DashboardPage.tsx:448-453`
`transferProofUrl`、`paymentProofUrl`、`photoUrl` 来自数据库渲染为 `<img src>`。如果 URL 指向内网资源，管理员浏览器盲发 SSRF。

**M29 — 草稿状态在 localStorage 持久化敏感财务数据**
`driver/hooks/useCollectionDraft.ts:59-67,101-115`
`currentScore`、`coinExchange`、`ownerRetention`、`tip`、`startupDebtDeduction` 保留在 localStorage 中无限期。

**M30 — 遥测暴露 PII 和敏感财务数据**
`driver/components/QuickCollect.tsx:297-335`, `driver/pages/DriverCollectionFlow.tsx:129-148`
`recordDriverFlowEvent` 发送 `driverName`、`locationName`、`previousScore`、`currentScore`、`revenue`、`netPayable`。离线时存入离线队列。

**M31 — 分数输入缺少上界验证**
`driver/components/ReadingCapture.tsx:125-133`, `driver/components/QuickCollect.tsx:532-541`
`parseInt(score, 10)` 接受任意大数值。分数差值 × COIN_VALUE_TZS (200) 可溢出安全整数范围。

**M32 — GPS 回退到 null island 坐标**
`driver/components/QuickCollect.tsx:255`, `driver/components/SubmitReview.tsx:383`
GPS 不可用时回退 `{ lat: 0, lng: 0 }`。数十笔交易可提交完全相同的 null island 坐标。

**M33 — Admin AI Assistant 发送完整运营数据给第三方 AI**
`admin/components/AdminAIAssistant.tsx:78-80`, `hooks/useAdminAI.ts:262-269`
完整 locations、drivers、transactions、dailySettlements 发送给外部 AI 提供商（OpenAI/Gemini）。含收入、佣金、GPS、电话号。

### Auth/Session

**M34 — JWT Session Token 存储在 localStorage**
`supabaseClient.ts:124-125`
Supabase 配置 `persistSession: true` 将 JWT（access_token+refresh_token）存入 localStorage。同源 XSS 可读取全部 token。

**M35 — Auth Bootstrap 在 hasCachedUser + non-session 错误时卡死**
`hooks/useAuthBootstrap.ts:80-97`
当 `cachedUser` 非 null 且错误非 `'No active session'` 时（Timeout、Profile fetch failed、Supabase not configured），不 dispatch 任何 action，`isInitializing` 永久为 true。

**M36 — 服务端限流器在 Serverless 平台无效 + 内存泄漏**
`api/_lib/apiAuth.ts:127-162`
`globalThis` Map 在 Vercel Edge Functions 每次冷启动重建，限流器为 no-op。在长运行服务器上忘记清理过期条目导致内存泄漏。

**M37 — Runtime credentials 在登出时不清除**
`hooks/useAuthBootstrap.ts:183-192`, `supabaseClient.ts:86-90`
`handleLogout` 清除 `bht-cached-user` 但从不调用 `clearRuntimeCredentials()`。Supabase URL 和 anon key 在共享设备上残留。

**M38 — Auth 恢复中短暂展示过期缓存用户**
`hooks/useAuthBootstrap.ts:136-153`
页面加载时立即读取 localStorage 缓存的用户并 dispatch `SET_USER`，然后验证 session。无效 session 时存在最多 8 秒的错误已认证状态窗口。

### 跨域/PWA/CSP

**M39 — CSP 仅在 Vercel 部署时生效，无 meta 标签后备**
`vercel.json:36-38`, `index.html` 无 `<meta>` CSP
Capacitor 原生壳或本地开发服务器中 CSP 完全缺失。

**M40 — CSP 含 `'unsafe-inline'` + `'unsafe-eval'`**
`vercel.json:37`
两指令使 CSP 不能防御 XSS ——内联脚本和 eval 都已被允许。

**M41 — index.html 内联脚本无 nonce/hash**
`index.html:84-125,130-181`
两个内联 `<script>` 块无完整性机制。尽管 `'unsafe-inline'` 已被允许，依赖此机制意味着脚本注入可执行。

**M42 — 图片上传无 MIME 类型或文件大小验证**
`utils/imageUtils.ts:16-69`
`compressAndResizeImage` 接受任意 `File` 无 MIME 检查或大小限制。100MB 图像炸弹在尺寸检查前被完整读入内存。

**M43 — ErrorBoundary 可能泄露错误消息**
`App.tsx:23-49`
生产环境 UI 中渲染 `err?.message || String(err)`。可能含 Supabase 错误消息、SQL 片段、文件路径。

**M44 — tz-pulse 端点无认证 + 错误泄露**
`api/tz-pulse.ts:6-7,27-35`
GET 端点公开可访问无认证。数据库错误消息原样返回（含 Supabase URL 和 anon key）。

**M45 — AppRouterShell 无深度防御的认证重校验**
`shared/AppRouterShell.tsx:21`
Shell 组件挂载后无角色重验证。如果路由级检查被绕过，攻击者直接获得完整 admin UI。

---

## LOW 严重性发现

### 数据暴露与隐私

- **L1** — Admin dashboard 广泛显示 PII：司机电话、薪水、GPS 坐标、店主姓名电话 (`DebtManager`, `DriverGrid`, `OverviewTab`, `SitesTab`, `TrackingTab`)
- **L2** — 多处 console.log/console.error 泄露实施细节和堆栈跟踪（11 处 driver 组件 + 多处 admin 组件）
- **L3** — 客户端审计条目存储在 localStorage 不可信 (`collectionSubmissionAudit.ts:31-49`)——离线事件从未离开设备
- **L4** — 通知持久化到 localStorage 含司机姓名、地点、金额 (`NotificationContext.tsx:99-119`)
- **L5** — GPS 坐标和电话号在客户端类型定义中 (`types/models.ts:75,129,17,120,11`)——离线优先架构意味着在设备上持久化
- **L6** — Admin DeadLetterPage 渲染原始错误文本 (`admin/AdminDeadLetterPage.tsx:154`)——可能泄露 SQL 片段和内部路径
- **L7** — DriverFlowDiagnosticsPage 渲染未净化的 payload 字段 (`admin/DriverFlowDiagnosticsPage.tsx:317-325`)
- **L8** — 健康报告发送 driverName 和 locationName 给服务器 (`offlineQueue.ts:1590-1602`)
- **L9** — 背景照片 URL 插入 CSS 无验证 (`driver/components/DriverStatusPanel.tsx:154`)——CSS 注入风险

### 输入验证与数据质量

- **L10** — 多处 admin 表单缺少字符集验证和 maxLength (`MachineRegistrationForm`, `SitesTab`, `DriverForm`)
- **L11** — 司机电话号仅做 `.trim()` 检查，无格式或字符集验证 (`repositories/driverRepository.ts:91-98`, `driver/components/DriverStatusPanel.tsx:167-168`)
- **L12** — 办公贷款金额仅客户端验证 `amount > 0`，无上限 (`driver/components/MachineCard.tsx:110-119`)
- **L13** — 佣金率显示浮点精度问题可能引起司机争议 (`driver/components/MachineCard.tsx:219`)
- **L14** — 费用/小费 `.abs()` 静默翻转负值 (`financeCalculator.ts:154-157`)
- **L15** — CSV 导出文件名含未净化的 driver name (`admin/MonthlyReportPage.tsx:243`)

### Auth/Session

- **L16** — service_role key 拒绝是客户端唯一（已在报告 #6 中记录，`supabaseClient.ts:53-55`）
- **L17** — 登出不清除 runtime credentials（已在 M37 中描述）
- **L18** — 瞬时认证失败触发缓存丢弃 (`hooks/useAuthBootstrap.ts:80-97`)——不必要的重新认证
- **L19** — 用户配置文件数据以纯文本 JSON 存储在 localStorage (`hooks/useAuthPersistence.ts:21-42`)
- **L20** — `isUpdatingGps` 模块级全局变量（`hooks/useOfflineSyncLoop.ts:18`）——多实例时间歇性 GPS 丢失

### Schema/RLS

- **L21** — `queue_health_reports` INSERT 策略允许 `driver_id IS NULL` 行 (`schema.sql:2948-2954`)
- **L22** — `touch_location_relocation_timestamp` 触发器缺少显式 search_path (`schema.sql:185-205`)
- **L23** — 新金额 CHECK 约束创建为 `NOT VALID` (`migrations/20260522000000_amount_validation_gate.sql:458-600`)——现有行未验证
- **L24** — delete-driver 部分失败时无回滚 (`supabase/functions/delete-driver/index.ts:113-147`)

### Edge Functions

- **L25** — CORS 通配符 + 凭据头 (`create-driver/index.ts:27-31`, `delete-driver/index.ts:24-28`)
- **L26** — delete-driver 不可逆操作（Auth 删除）先于可回滚操作执行

### 离线队列

- **L27** — `openDB` 未处理 `onblocked` 事件 (`offlineQueue.ts:269-296`)
- **L28** — dependsOn 循环依赖导致永久停滞 (`offlineQueue.ts:892-899`)
- **L29** — `operationId` 生成使用 `Math.random()` 非加密随机 (`offlineQueue.ts:299-303`)
- **L30** — IDB 连接在某些错误路径中未 close (`offlineQueue.ts:408`)

### PWA/CSP/跨域

- **L31** — Service Worker message 无 `event.origin` 验证 (`public/sw.js:30-34`)
- **L32** — API 响应在 Cache Storage 中缓存 (`public/sw.js:76-89`)
- **L33** — CSP 缺少 `base-uri`、`form-action`、`report-uri` 指令 (`vercel.json:37`)
- **L34** — `/version.json` 上通配符 CORS (`vercel.json:11`)
- **L35** — Vite dev server 绑定到 `0.0.0.0` (`vite.config.ts:21`)
- **L36** — 无 Trusted Types 策略部署
- **L37** — UUID 回退使用 `Math.random()` (`types/utils.ts:9-18`)
- **L38** — .env.example 暴露 DB_PASSWORD (`env.ts`)
- **L39** — `innerHTML` 用于硬编码字符串 (`TransactionHistory.tsx:299,306`)——未来代码变更的脆弱模式
- **L40** — `innerHTML` 在 tz-pulse.html 中渲染获取的 JSON (`public/tz-pulse.html:63,89,103,105`)
- **L41** — Sentry DSN 暴露在客户端 bundle (`env.ts:15`)
- **L42** — `window.open` 无 `noopener` (`LiveMap.tsx:189`, `TrackingTab.tsx:70-72`, `MachineCard.tsx:279`)
- **L43** — Leaflet `L.divIcon({ html: ... })` 使用 innerHTML (`RouteAuditMap.tsx:101-106`)——未来添加用户数据时的脆弱模式
- **L44** — 机器搜索允许对未验证字段做子串匹配 (`driver/components/MachineSelector.tsx:129-133`)
- **L45** — localStorage 字体大小偏好无过期 (`driver/AppDriverShell.tsx:44-46`)
- **L46** — `dbHealth` 查询可能错误表示在线状态 (`hooks/useSupabaseData.ts:72-77`)

---

## 正确做法（审计中确认安全的设计）

- **无 `dangerouslySetInnerHTML`** — 全代码库零出现
- **无 `eval()` / `new Function()`** — 零出现
- **认证令牌处理** — Supabase SDK 内部管理令牌；应用代码从无直接访问/序列化/持久化
- **React Query 缓存作用域** — 司机和管理员查询键正确隔离（`getTransactionQueryScope` / `getSettlementQueryScope`）
- **乐观更新回滚** — 所有 mutation 在 `onMutate` 中保存先前缓存，在 `onError` 中恢复
- **客户端字段剥离** — `isSynced` 和 `stats` 在发送到服务器前移除
- **实时通道清理** — 正确 `.unsubscribe()` + useEffect cleanup
- **认证重验证** — 实时重连和 syncOfflineData 开始时通过 `supabase.auth.getSession()` 处理
- **服务器端角色验证** — 正确从 DB 查询角色而非信任 JWT claims（`api/_lib/apiAuth.ts:71-125`）
- **密码处理** — 从不存入 localStorage 或日志；通过 HTTPS 传输到 Supabase Auth；仅作为瞬态 React state
- **无硬编码密钥** — 所有敏感密钥来自环境变量
- **Money 类** — 一致使用 BigInt；解析验证正则；除零检查；银行家舍入
- **Edge Function isAdmin** — 正确通过 `auth.getUser(jwt)` 验证（不仅解码 JWT）；admin client 禁用 autoRefreshToken
- **离线队列** — 单标签页 `_isFlushing` 互斥设计正确；单项目失败不阻塞队列；全局 120s 超时
- **SQL 注入** — 所有 DB 操作使用参数化 Supabase 查询构建器；Edge Functions 中无原始 SQL
- **特权升级** — service_role key 仅用于 `supabaseAdmin`；Edge Functions 每个执行路径都经过 `isAdmin()` 门控

---

## 风险优先级排序 (Top 10 待修复)

1. **H1 — Realtime 广播全行数据** (Schema) — 任何司机可看到所有司机薪资/交易
2. **H5 — 公开存储桶** (Schema) — 证据照片无认证可访问
3. **H6 — NaN 传播** (Services) — 金融数据静默损坏
4. **H10 — 离线队列跨标签页无保护** (离线队列) — 非幂等条目重复
5. **H11 — IDB 事务自动提交 bug** (离线队列) — 已同步项目循环重处理
6. **H8 — RPC IDOR** (Services) — 客户端可指定其他司机的 driverId
7. **H18 — 无照片压缩** (Driver) — 内存压力 + 带宽滥用
8. **H2-H4 — 三个审计表允许任意 INSERT** (Schema) — 审计完整性被破坏
9. **H22 — 非原子 reviewSettlement** (Hooks) — 服务器端不一致
10. **H15 — 客户端 OpenAI key** (Types) — 需要确认不是真正的客户端泄露
