-- TZ Pulse：资讯快照（snapshots）与文章（articles）两表。
-- 背景：这两张表此前在生产库手工创建（out-of-band），未纳入追踪 schema，
--       导致 migrations / schema.sql 与生产漂移。本迁移将其纳入版本控制。
-- 与生产现状逐列、逐约束、逐 RLS 策略一致（经 information_schema / pg_policies 自省核对）。
-- 消费方：api/tz-pulse.ts，以 anon 角色只读查询（公开资讯摘要）。
-- 幂等：表已存在的生产库上 push 为安全 no-op；fresh 重建则创建。

CREATE TABLE IF NOT EXISTS public.tz_pulse_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date        DATE NOT NULL UNIQUE,
    highlights  JSONB,
    raw_summary TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tz_pulse_articles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source       TEXT NOT NULL,
    title        TEXT NOT NULL,
    url          TEXT,
    category     TEXT NOT NULL,
    summary      TEXT,
    published_at DATE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tz_pulse_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tz_pulse_articles  ENABLE ROW LEVEL SECURITY;

-- 公开只读：anon 角色可 SELECT（资讯为公开数据，无敏感字段）。
DROP POLICY IF EXISTS anon_read_snapshots ON public.tz_pulse_snapshots;
CREATE POLICY anon_read_snapshots ON public.tz_pulse_snapshots
    FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS anon_read_articles ON public.tz_pulse_articles;
CREATE POLICY anon_read_articles ON public.tz_pulse_articles
    FOR SELECT TO anon USING (true);
