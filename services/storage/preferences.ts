import { browser } from 'wxt/browser';
import {
  DEFAULT_SUBTITLE_APPEARANCE, isSubtitleAppearance, SUBTITLE_APPEARANCE_KEY, THEME_KEY,
  type PreferencesResponse, type PreferenceMessage, type SubtitleAppearance,
  type InterfaceTheme,
} from '@/types/preferences';

export async function requestPreferences(message: PreferenceMessage): Promise<PreferencesResponse> {
  const result: PreferencesResponse | undefined = await browser.runtime.sendMessage(message);
  if (result?.ok && (result.theme === 'dark' || result.theme === 'light') && isSubtitleAppearance(result.appearance)) {
    return result;
  }
  return { ok: false };
}

export function observePreferences(
  applyTheme: (theme: InterfaceTheme) => void,
  applyAppearance?: (appearance: SubtitleAppearance) => void,
): () => void {
  let stopped = false;
  let themeChanged = false;
  let appearanceChanged = false;

  const onChange: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local') return;
    if (THEME_KEY in changes) {
      themeChanged = true;
      applyTheme(changes[THEME_KEY]?.newValue === 'light' ? 'light' : 'dark');
    }
    if (SUBTITLE_APPEARANCE_KEY in changes) {
      appearanceChanged = true;
      const value = changes[SUBTITLE_APPEARANCE_KEY]?.newValue;
      applyAppearance?.(isSubtitleAppearance(value) ? value : DEFAULT_SUBTITLE_APPEARANCE);
    }
  };

  browser.storage.onChanged.addListener(onChange);
  void requestPreferences({ type: 'get-preferences' }).then((result) => {
    if (stopped || !result.ok) return;
    if (!themeChanged) applyTheme(result.theme);
    if (!appearanceChanged) applyAppearance?.(result.appearance);
  }).catch(() => {
    // Leave the default appearance in place if settings are unavailable.
  });

  return () => {
    stopped = true;
    browser.storage.onChanged.removeListener(onChange);
  };
}
