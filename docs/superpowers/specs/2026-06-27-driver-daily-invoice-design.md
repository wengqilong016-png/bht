# 司机日账单对账明细与机器工作状态/交易备注补写功能设计规格说明书

📅 生成日期: 2026-06-27
🧑‍💻 状态: 已批准 (Approved)

本设计文档旨在为 **Bahati Jackpots** 路线收款管理系统构建一套完整、美观、离线友好的**司机当日对账明细单**功能。通过让司机在进行每日结算（Daily Settlement）前极度明晰地对账、修改今日账差备注、一键更新对应机器的物理工作状态（Active / Broken / Maintenance / Inactive），彻底解决坦桑尼亚本地巡检收款极不稳定的账目痛点。

---

## 1. 业务目标与价值

* **消除账差疑虑**：司机在巡回 5-10 台老虎机抄数、收款后，可通过发票账单直接获知 `Metra ya Leo (今日抄表)` 与 `Metra ya Jana (昨日累计)` 计算所得的差额与营业额收益，而无需司机自行繁复计算。
* **物理状态反馈闭环**：司机若在现场发现机器漏水、故障、断电，可在一键对账时快捷对机器物理状态（`locations.status`）做权威变更（Active ➡ Broken 等），便于车队远程实时维护。
* **离线友好补写**：交易备注（`transactions.notes`）补写支持纯离线乐观更新，网络断开时备注进本地 IndexedDB 离线队列，联网重播时一并购回。

---

## 2. 界面设计、布局与国际化 (Swahili / 简体中文 / English)

该功能深度集成于 **司机端日结面板** (`components/dashboard/SettlementTab.tsx` 的 Driver 视图模块中）。

### 2.1 账单展开入口
若当日存在收款数据（`todayDriverTxs.length > 0`），在金额汇总卡片紧随下方植入一个手风琴面板（Accordion Box）：
```
+-------------------------------------------------------------+
| 🧾 Mkusanyiko wa Ankara za Kila Siku / 每日收款对账单          |
|    - Kagua mita ya mashine, hali na uandike maelezo.         |
|    - (5 Mashine / 5 台机器已收)                       [展开▼] |
+-------------------------------------------------------------+
```

### 2.2 账单明细卡片（展开后的明细展示）
列表中的每一个卡片对应今天该司机录入的一笔收款交易（`Transaction`），并根据 `locationMap` 获取最新机器。卡片排版逻辑如下：

```
+-------------------------------------------------------------+
| Spot 12 - Mashine #M54 (机器名称)         [ Hali: 🟢 Active ] |
|                                                             |
| * Metra ya Leo (今日抄数): 84,250                           |
| * Metra ya Jana (上期抄数): 83,900                          |
| * Utofauti wa Metra (抄表差值): +350                        |
|                                                             |
| TZS Money: TZS 70,000  (350 币 × 200/币)                    |
|                                                             |
| Maelezo ya Ankara (工作备注):                                 |
| "Mashine ilikwama sarafu 3, imerekebishwa."          [Badili] |
+-------------------------------------------------------------+
```

### 2.3 字段快捷编辑交互图示
1. **状态切换 (`locations.status`)**：
   * 在 Hali (状态) 标签中，点击该 Hali 标贴弹出内联选项（Select dropdown）：
     * `🟢 Kazi Kawaida (Active)`
     * `🟡 Matengenezo (Maintenance)`
     * `🔴 Imeharibika (Broken)`
     * `⚫ Imefungwa (Inactive)`
   * 触发 `updateLocations` 进行同步。

2. **交易备注补写 (`transactions.notes`)**：
   * 卡片底部提供 **[✍️ Badili Maelezo / 补写备注]** 交互按钮。
   * 点击展开可编辑的 `textarea` 内联输入框。
   * 司机在其中输入并补写今日对账出现的特殊说明后，点击 **保存 (Hifadhi / Save)**、或者 **取消 (Futa / Cancel)**。
   * 点击保存调用 `updateTransaction({ txId, updates: { notes: value } })`。

---

## 3. 技术设计与数据流转

### 3.1 数据依赖桥接
* 数据依赖均位于 `SettlementTab.tsx` 共享给 Driver 的现有上下文：
  * `todayDriverTxs`: 由外层 `DataContext` 解构而来，作为只读数据集。
  * `locationMap`: 用于在对账单列表中以 `tx.locationId` 极速查找对应的 `Location` 实体以更新极其物理状态。
  * `lang`: 多语言标签（`'zh'` 或 `'sw'`）。

### 3.2 变更链路与 API 触发
1. **修改备注 (`transactions.notes`)**：
   * 调用 `MutationContext` 或外层传递的更新方法（在 `useSupabaseMutations.ts` 中定义为 `updateTransaction`）。
   * 即使在离线状态：
     * `updateTransaction.onMutate` 提供乐观更新：本地 React Query 缓存 `['transactions', scope]` 的 notes 即时展示。
     * 写入本机构建的 IndexedDB 的 `pending_transactions` 回放事务列表中。
     * 当司机身处坦桑尼亚弱网恢复连接时，`useOfflineSyncLoop` 的 `flushQueue()` 进行原子串重播提交至服务端 RPC `submit_collection_v2` / `upsertTransaction` 落库。

2. **修改机器状态 (`locations.status`)**：
   * 需要通过获取到的 `Location` 实体变更为最新，并调用外层 `updateLocations` 变更该 Location。
   * 当司机身在离线时，界面可以给予友好弱提示 `Bila Mtandao (离线状态下状态更新将在联网后推送)`，并做本地乐观状态渲染，待联网同步。

---

## 4. 国际化翻译字典配制 (i18n Mapping)

我们将对 `i18n/sw.ts` (斯瓦希里语) 和 `i18n/zh.ts` (中文) 进行以下翻译 Key 追加：

| Translation Key | 中文 (zh) | 斯瓦希里 (sw) |
|---|---|---|
| `dailyInvoiceTitle` | 每日收款对账单 | Daftari la Ankara za Kila Siku |
| `dailyInvoiceDesc` | 核对抄表走数差额、工作状态并补写工作备注 | Kagua utofauti wa mita, hali kazini na uandike maelezo |
| `currentMetra` | 今日最新读数 | Metra ya Leo |
| `previousMetra` | 昨日累计读数 | Metra ya Jana |
| `metraDiff` | 抄表走字差值 | Utofauti wa Metra |
| `editDailyNotes` | 补写日结备注 | Andika Maelezo ya Ankara |
| `machineStatus` | 机器实体状态 | Hali ya Mashine |
| `saveChanges` | 保存修改 | Hifadhi Mabadiliko |
| `writeNotesPlaceholder` | 在此输入补写备注(卡币、掉损、找差说明)... | Andika maelezo ya ankara hapa... |

---

## 5. 安全防护与回归验证守护

* **Lamport 时钟隔离 (ADR-004)**：
  交易备注作为增量 Patch 的一部分，如果存在多次修改，必须要保证修改时间戳、回放事务和后台数据处理在离线同步时保持相同的因果序列。`updateTransaction` 自带时间标记。
* **自动化 Jest 测试防护**：
  在 `__tests__/` 创建或追加单元测试：
  * 检测 `SettlementTab.tsx` 在有今日跑盘交易时，折叠款对账单能正常拉起。
  * 检测计算比对逻辑的健全度，确保 `TZS 200` 换算的科学无精度溢出（ADR-001 安全金字塔）。
