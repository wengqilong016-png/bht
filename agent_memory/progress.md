# 当前任务进度

## 当前目标
实现管理端司机工作信息快速补录

## 状态
completed

## 已完成步骤
- [x] 读取 `AGENTS.md`、`agent_memory/context.md`、`agent_memory/progress.md`、`agent_memory/bugs.md`
- [x] 确认 `submit_collection_v2` RPC 已支持 admin 代任意司机提交，且 `p_gps`、`p_photo_url` 可为 `NULL`
- [x] 保留司机端证据要求：`submitCollectionV2` 默认仍强制照片，仅显式 `requireEvidencePhoto: false` 时允许无照片
- [x] 新增 `submitManualCollection` mutation：在线提交、复用同一 RPC、跳过照片/GPS、刷新交易/机器/结算缓存
- [x] 将管理端“采集录入”从复用司机拍照流程改为专用 `ManualCollectionEntryPage`
- [x] 表单支持司机、机器、当前读数、支出、零钱兑换、小费/现场扣款、商户债务扣回、店主留存、机器状态和备注
- [x] 补录备注自动写入 `[admin_manual_entry]`、管理员姓名/ID、无照片/GPS验证说明，便于审计
- [x] 补充服务层和 mutation hook 单测

## 下一步
- 如需要进一步增强审计，可新增数据库字段或独立审计表记录 admin actor；当前版本通过交易 `notes` 标记。
- 如需保留旧的管理端“完整司机流程/注册机器”入口，可另加二级入口；当前“采集录入”已切换为快速补录。

## 阻塞项
- 无

## 最后更新
2026-06-02 — 管理端快速补录已实现并通过 typecheck、目标单测、lint、生产构建
