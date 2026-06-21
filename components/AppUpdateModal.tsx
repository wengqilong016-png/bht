import { Capacitor } from '@capacitor/core';
import { CheckCircle2, Download, ExternalLink, Sparkles } from 'lucide-react';
import React, { useState } from 'react';

import { useToast } from '../contexts/ToastContext';
import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck';
import { ApkUpdate } from '../services/apkUpdate';

interface Props {
  lang: 'zh' | 'sw';
}

const AppUpdateModal: React.FC<Props> = ({ lang }) => {
  const { showToast } = useToast();
  const update = useAppUpdateCheck();
  const [localDismissed, setLocalDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installerHandedOff, setInstallerHandedOff] = useState(false);
  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—';
  const updateIdentity = update
    ? [update.latestVersion, update.latestVersionCode, update.latestGitSha].filter(Boolean).join(':')
    : null;

  // Persist dismissal in localStorage keyed by the release identity so that
  // dismissing one release keeps it dismissed across app restarts. A genuinely
  // newer release produces a different identity and will surface again.
  // Wrapped in try-catch: storage can throw in private mode / when disabled.
  let dismissedVersion: string | null = null;
  try {
    dismissedVersion = typeof localStorage !== 'undefined'
      ? localStorage.getItem('update-dismissed-version')
      : null;
  } catch {}
  const isDismissed = update?.hasUpdate && !!updateIdentity && dismissedVersion === updateIdentity;

  const openBrowserDownload = () => {
    const popup = window.open(update?.apkUrl, '_blank', 'noopener,noreferrer');
    if (!popup && update?.apkUrl) {
      window.location.assign(update.apkUrl);
    }
  };

  const _handleDismiss = () => {
    setLocalDismissed(true);
    try {
      if (updateIdentity && typeof localStorage !== 'undefined') {
        localStorage.setItem('update-dismissed-version', updateIdentity);
      }
    } catch {}
  };

  if (!update?.hasUpdate || localDismissed || isDismissed) return null;

  const _handleDownload = async () => {
    setDownloading(true);
    setInstallerHandedOff(false);
    try {
      if (Capacitor.getPlatform() === 'android') {
        showToast(
          lang === 'zh'
            ? '正在下载完整 APK。下载完成后，Android 会弹出安装确认界面。'
            : 'Downloading the full APK. Android will ask you to confirm the install.',
          'info',
        );
        await ApkUpdate.downloadAndInstall({ url: update.apkUrl });
        setInstallerHandedOff(true);
        showToast(
          lang === 'zh'
            ? '已交给 Android 安装器。请点“安装”，完成后重新打开 App。'
            : 'Handed off to Android installer. Tap Install, then reopen the app.',
          'success',
        );
      } else {
        openBrowserDownload();
      }
    } catch (err) {
      const anyErr = err as any;
      const msg = err instanceof Error ? err.message : String(anyErr?.message ?? err);
      if (anyErr?.code === 'INSTALL_PERMISSION_REQUIRED') {
        showToast(
          lang === 'zh'
            ? '请先允许“安装未知应用”，然后再点击更新。'
            : 'Please allow "Install unknown apps" for this app, then try again.',
          'error',
        );
        try {
          await ApkUpdate.openUnknownSourcesSettings();
        } catch {}
      } else {
        showToast(
          lang === 'zh'
            ? `系统安装器未正常拉起，改为浏览器下载安装：${msg}`
            : `Installer did not open. Falling back to browser download: ${msg}`,
          'warning',
        );
        openBrowserDownload();
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 pb-8">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 bg-gradient-to-br from-[#171310] to-[#2a2420] px-5 py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 shadow-lg shadow-amber-500/30">
            <Sparkles size={22} className="text-[#171310]" fill="currentColor" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a09080]">
              {lang === 'zh' ? '发现新版本' : 'Update available'}
            </p>
            <p className="text-lg font-black text-white truncate">v{update.latestVersion}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8c7e6d]">
              {lang === 'zh' ? '当前' : 'Current'} v{currentVersion}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {update.releaseNotes && (
            <p className="text-xs text-[#7a6e5e] leading-relaxed">{update.releaseNotes}</p>
          )}

          <p className="text-xs font-bold text-[#7a6e5e] leading-relaxed">
            {lang === 'zh'
              ? '点下面按钮下载并安装新版本，旧数据不会丢失。'
              : 'Tap below to download and install the new version. Your data stays safe.'}
          </p>

          {installerHandedOff && (
            <div
              data-testid="apk-installer-handed-off"
              className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"
            >
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>
                {lang === 'zh'
                  ? '已打开 Android 安装流程。请完成系统安装后重新打开 App。'
                  : 'Android install flow has started. Finish the system install, then reopen the app.'}
              </span>
            </div>
          )}

          <button
            aria-label="Download and Install"
            type="button"
            aria-disabled={downloading}
            onClick={_handleDownload}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#171310] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            <Download size={16} />
            {downloading
              ? (lang === 'zh' ? '正在下载并准备安装…' : 'Downloading and preparing…')
              : (lang === 'zh' ? '立即下载安装' : 'Download & Install')}
          </button>

          <button
            aria-label="Alternative browser download"
            type="button"
            onClick={openBrowserDownload}
            className="flex w-full items-center justify-center gap-1.5 text-[11px] font-bold text-[#a09080]"
          >
            <ExternalLink size={13} />
            {lang === 'zh' ? '如果系统安装器没有弹出，改用浏览器下载 APK' : 'If the installer does not open, download the APK in your browser'}
          </button>

          <button
            aria-label="Remind me later"
            type="button"
            onClick={_handleDismiss}
            className="w-full py-1 text-[11px] font-bold uppercase tracking-wide text-[#a09080]"
          >
            {lang === 'zh' ? '稍后提醒' : 'Remind me later'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppUpdateModal;
