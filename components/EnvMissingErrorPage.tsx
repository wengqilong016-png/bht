import React from 'react';

interface EnvMissingErrorPageProps {
  lang: 'zh' | 'sw';
}

const COPY = {
  zh: {
    title: '缺少前端配置',
    body:
      '当前构建缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，应用暂时无法连接 Supabase。',
    stepsTitle: '处理方式',
    steps: [
      '本地开发：复制 .env.example 为 .env.local，并填写 Supabase URL 与 anon key。',
      'Vercel 部署：进入 Settings -> Environment Variables，补齐这两个变量后重新部署。',
      '变量值可在 Supabase Dashboard -> Settings -> API 中找到。',
    ],
    footer: '更多说明见 .env.example 与 docs/DEPLOYMENT.md。',
  },
  sw: {
    title: 'Frontend Config Missing',
    body:
      'This build is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY, so the app cannot connect to Supabase yet.',
    stepsTitle: 'How To Fix',
    steps: [
      'Local development: copy .env.example to .env.local and fill in the Supabase URL and anon key.',
      'Vercel deployment: open Settings -> Environment Variables, add both variables, then redeploy.',
      'You can find both values in Supabase Dashboard -> Settings -> API.',
    ],
    footer: 'See .env.example and docs/DEPLOYMENT.md for the full setup guide.',
  },
} as const;

const EnvMissingErrorPage: React.FC<EnvMissingErrorPageProps> = ({ lang }) => {
  const copy = COPY[lang];

  return (
    <div
      className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-6"
      role="alert"
      aria-live="polite"
    >
      <div className="w-full max-w-lg bg-[#f5f7fa] rounded-card shadow-silicone border border-white/60 p-8 text-center space-y-5">
        <div className="mx-auto w-16 h-16 rounded-card bg-amber-50 border border-amber-100 flex items-center justify-center text-2xl text-amber-500 shadow-silicone-sm">
          !
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-wide">
            {copy.title}
          </h1>
          <p className="text-sm font-bold text-slate-500 leading-relaxed">
            {copy.body}
          </p>
        </div>

        <div className="bg-white/70 rounded-3xl border border-white/70 shadow-silicone-sm p-5 text-left space-y-3">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            {copy.stepsTitle}
          </p>
          <ol className="space-y-2 text-xs font-bold text-slate-600 leading-relaxed list-decimal pl-5">
            {copy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <p className="text-[11px] font-bold text-slate-400">{copy.footer}</p>
      </div>
    </div>
  );
};

export default EnvMissingErrorPage;
