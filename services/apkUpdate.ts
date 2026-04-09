import { registerPlugin } from '@capacitor/core';

export interface ApkUpdatePlugin {
  /**
   * Download the APK from a URL and prompt the system installer.
   * The system will still require user confirmation; silent installs are not allowed.
   */
  downloadAndInstall(options: { url: string }): Promise<void>;

  /**
   * For Android 8+ this opens "Install unknown apps" settings for this app.
   * No-op on other platforms.
   */
  openUnknownSourcesSettings(): Promise<void>;
}

export const ApkUpdate = registerPlugin<ApkUpdatePlugin>('ApkUpdate');

