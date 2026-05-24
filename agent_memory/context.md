# 项目上下文

> 📅 生成: 2026-05-24 | 基于 5 路子 agent 并行分析

---

## 项目概述

**BHT (Bahati Jackpots)** — 坦桑尼亚老虎机收款路线管理系统。司机每日巡回收集各机器硬币读数 → 拍照 → 服务端权威计算营业额/佣金/净付额 → 管理员审核结算。离线优先（Offline-First），React + Supabase 全栈。

**双角色系统**：Driver(司机) 负责收款/日结/债务查看；Admin(管理员) 负责审批/报表/司机管理/网点管理。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 19 + TypeScript 6 + Vite 8 |
| **状态管理** | @tanstack/react-query 5 (staleTime=5min) |
| **后端** | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| **API** | Vercel Serverless (4个 API routes) |
| **样式** | Tailwind CSS v4 + CSS 自定义属性 |
| **地图** | Leaflet + react-leaflet |
| **图表** | Recharts |
| **移动端** | Capacitor 8 (Android/iOS) |
| **测试** | Jest 30 + Testing Library + Playwright |
| **监控** | Sentry + Vercel Analytics |
| **移动端能力** | @capacitor/geolocation |

**构建脚本关键项**：
- `dev/build` — Vite (4GB heap)
- `typecheck` — tsc --noEmit
- `test:unit/integration/e2e` — 三级测试
- `cap:build:android` — Capacitor 打包

---

## 核心架构

### 1. Provider 层级（根组件树）

```
index.tsx
└─ QueryClientProvider
   └─ ErrorBoundary → ToastProvider → ConfirmProvider → App
      ├─ [未登录] → <Login />
      ├─ [需改密] → <ForcePasswordChange />
      └─ [已认证] → <AuthenticatedApp>
           └─ NotificationProvider → AuthProvider → DataProvider → MutationProvider
              ├─ UpdatePrompt / AppUpdateModal
              └─ AppRouterShell (lazy load admin/driver Shell)
```

**Provider 分层逻辑**：
- 无认证层（Toast/Confirm）：Login 页也需要 toast 提示
- 认证层（Notification → Auth → Data → Mutation）：逐级依赖，按需加载

### 2. Shell 布局（统一模式）

```
AppShell (flex h-screen)
├─ ShellSidebar (桌面端, w-[240px], 深色) → Brand + Nav + SyncStatus
├─ 右侧 flex-1
│  ├─ ShellHeader → title + SyncStatusPill + 操作区
│  ├─ ShellMainContent → [路由页面]
│  └─ ShellMobileNav (md:hidden) → bottom(Driver) / top(Admin)
```

**Admin vs Driver 差异**：Driver 用固定底部导航，Admin 用侧边栏 + 顶部 tabs。

### 3. 核心数据流

```
Driver操作
  └─ orchestrateCollectionSubmission (总控)
     ├─ 在线 → submitCollectionV2 (RPC, 服务端权威财务计算)
     │   ├─ evidenceStorage.upload (照片→Supabase Storage)
     │   └─ supabase.rpc('submit_collection_v2') (原子写入)
     └─ 离线 → offlineQueue (IndexedDB/localStorage 双存储)
          └─ 联网后 flushQueue → 按序重播到服务端
```

**Service ↔ Repository ↔ RPC 三层模型**：
- **Repository**：纯函数，直接调用 supabase REST/RPC
- **Service**：业务编排（authService, financeCalculator, collectionSubmissionOrchestrator）
- **RPC (PostgreSQL)**：`SECURITY DEFINER` 函数，服务端权威执行

---

## 模块关系总图

### 目录结构

| 目录 | 职责 | 文件数 |
|------|------|--------|
| `hooks/` | 自定义 Hook（12个） | ~12 |
| `services/` | 业务逻辑服务（18个） | ~18 |
| `repositories/` | 数据访问层（9个） | ~9 |
| `utils/` | 工具函数（15个） | ~15 |
| `components/` | 共享组件（~38个） | ~38 |
| `driver/` | 司机端页面/组件（~25个） | ~25 |
| `admin/` | 管理端页面/组件（~9个） | ~9 |
| `shared/` | 布局壳/通用组件（~10个） | ~10 |
| `api/` | Vercel Serverless API（4 routes + 3 libs） | 7 |
| `i18n/` | 国际化翻译（sw/zh，427 keys） | 3 |
| `types/` | TypeScript 类型定义 | 7 |
| `supabase/` | 数据库迁移 SQL + Edge Functions | 18张表 |
| `__tests__/` | 测试文件（~95个） | ~95 |

### Hook 关系矩阵

| Hook | React Query | offlineQueue | supabase | localDB | 核心职责 |
|------|:-----------:|:------------:|:--------:|:-------:|---------|
| `useAuthBootstrap` | | | ✓ | | 认证状态机（SET_USER/LOGOUT/SET_LANG） |
| `useSupabaseData` | ✓ | | ✓ | ✓ | 核心数据读取（6个 useQuery） |
| `useSupabaseMutations` | ✓ | ✓ | ✓ | ✓ | 写操作（15个 Mutation）+ optimistic update |
| `useRealtimeSubscription` | ✓ | | ✓ | | Supabase Broadcast 实时订阅 |
| `useOfflineSyncLoop` | | ✓ | ✓ | | 离线同步主循环 + GPS 心跳 |
| `useSyncStatus` | | ✓ | | | 同步状态状态机 + 死信管理 |
| `useCollectionSubmission` | | | | | 收款提交流程编排 |
| `useAdminAI` | | | | | AI 助手 + 系统快照 + 告警 |
| `useAppUpdateCheck` | | | | | APK/Web 版本检测（15min 轮询） |
| `useDevicePerformance` | | | | | 设备性能分级（high/medium/low） |

### 关键 Service 调用链

```
collectionSubmissionOrchestrator (收款总控)
  ├─ submitCollectionV2 → evidenceStorage → supabase.rpc('submit_collection_v2')
  │                      → financeAuditService (fire-and-forget)
  └─ fallback → offlineQueue (enqueueTransaction → IndexedDB)
              → collectionSubmissionAudit (localStorage 审计日志)

financeCalculator (财务计算)
  ├─ calculateFinancePreview → supabase.rpc('calculate_finance_v2') (优先)
  └─ fallback → calculateCollectionFinanceLocal (本地公式)

offlineQueue (离线队列)
  ├─ flushQueue → 逐条 flushSingleItem (120s 全局超时)
  │   ├─ rawInput → submitCollectionV2 (60s 单个超时)
  │   ├─ reset_request → submitResetRequest
  │   ├─ payout_request → submitPayoutRequest
  │   └─ legacy → supabase.upsert
  └─ 错误分类: transient (退避重试 5 次) / permanent (立即 dead-letter)
```

---

## 数据模型（18张表）

### 核心业务表

| 表名 | 主键 | 关键字段 | 说明 |
|------|------|---------|------|
| **transactions** | TEXT id | 50+ 字段：营收/佣金/债务抵扣/费用/GPS/type/approvalStatus/anomalyFlag/auditStatus | 核心交易流水 |
| **drivers** | TEXT id | name, phone, remainingDebt, commissionRate, currentGps, baseSalary | 司机信息 |
| **locations** | UUID id | machineId(UNIQUE), coords, assignedDriverId, lastScore, resetLocked, dividendBalance | 机器/网点 |
| **profiles** | UUID → auth.users | role(admin/driver), driver_id → drivers, must_change_password | 用户身份 |

### 辅助表

| 表名 | 说明 |
|------|------|
| **daily_settlements** | 日结算：签到/签退 GPS，营收汇总，短缺 |
| **monthly_payrolls** | 月薪：底薪+佣金−贷款−短缺，UNIQUE(driverId, month) |
| **finance_audit_log** | 财务变更审计（10种 event_type），append-only |
| **transaction_audit_log** | ADR-002 异步审计，含重试 |
| **score_events** | 事件溯源：每次 score 变更 |
| **score_snapshots** | 定期快照加速恢复 |
| **queue_health_reports** | 设备级离线队列健康 |
| **driver_flow_events** | 司机 UX 流程埋点 |
| **notifications** | 通知系统 |

### Storage Buckets

| 桶 | 公开 | 限制 | 用途 |
|----|------|------|------|
| evidence | 私有 | 5MB JPEG/PNG/WebP | 收款证据照片 |
| kiosk-photos | 私有 | 5MB JPEG/PNG/WebP | 机器/网点照片 |

---

## 核心设计原则

1. **服务端权威财务模型**：客户端禁止预计算财务总额，所有金额写入通过 RPC `SECURITY DEFINER` 在 PostgreSQL 完成
2. **Money 类型安全（ADR-001）**：基于 BigInt 的 Money 值对象，杜绝浮点数精度问题
3. **事件驱动审计（ADR-002）**：EventBus + AuditConsumer 异步管道，含语义校验 + 幂律去重
4. **Lamport 时钟（ADR-004）**：离线操作因果排序，保证 replay 顺序正确
5. **离线优先**：在线 RPC / 离线 IndexedDB → 联网自动同步
6. **防御纵深**：前端校验 + RLS + SECURITY DEFINER RPC 多层安全

---

## API 路由

| 路由 | 认证 | 频率限制 | 职责 |
|------|------|----------|------|
| `POST /api/admin-ai` | admin | 30/min | AI 管理助手（OpenAI/Gemini） |
| `POST /api/scan-meter` | admin/driver | 20/min | Vision API 识别 7 段 LED 读数 |
| `POST /api/translate` | admin/driver | 60/min | AI 翻译（sw ↔ zh/en） |
| `GET /api/tz-pulse` | 无 | 无 | 坦桑尼亚资讯聚合（缓存 5min） |

---

## 重要约定

- **默认最小改动**，不做无关重构
- **push 前必须 `git pull --rebase origin main`**（多人推代码）
- 代码保持英文，注释/文档用中文
- `refetchInterval` 保持 30s（降低轮询频率），离线队列单条超时 60s
- 网络超时考虑坦桑尼亚网络环境，不宜太短
- 低端设备适配：CSS 性能降级（`data-perf` 属性）+ 图片压缩自动调整

---

## 外部依赖

| 服务 | 用途 |
|------|------|
| Supabase | 数据库 + 认证 + 存储 + 实时 + Edge Functions |
| Vercel | Web 前端托管 + Serverless API |
| OpenAI / Gemini | AI 仪表扫描 + 翻译 + 管理助手 |
| Sentry | 错误监控 |
| Leaflet (OSM) | 地图服务 |

---

最后更新：2026-05-24 — 项目全貌初次建立
