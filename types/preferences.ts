export const THEME_KEY = 'interfaceTheme';
export const SUBTITLE_APPEARANCE_KEY = 'subtitleAppearance';

export type InterfaceTheme = 'dark' | 'light';

const koreanSans = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
export const SUBTITLE_FONTS = {
  rounded: { label: 'Rounded (default)', stack: `"Pretendard Variable", "Pretendard", ui-rounded, ${koreanSans}` },
  sans: { label: 'System sans-serif', stack: koreanSans },
  serif: { label: 'Korean serif', stack: '"AppleMyungjo", "Noto Serif CJK KR", "Batang", serif' },
} as const;

export interface SubtitleAppearance {
  size: number;
  textColor: string;
  underlineColor: string;
  font: keyof typeof SUBTITLE_FONTS;
}

export const DEFAULT_SUBTITLE_APPEARANCE: SubtitleAppearance = {
  size: 100,
  textColor: '#ffffff',
  underlineColor: '#f87171',
  font: 'rounded',
};

export const MIN_SUBTITLE_SIZE = 50;
export const MAX_SUBTITLE_SIZE = 175;

export function isSubtitleAppearance(value: unknown): value is SubtitleAppearance {
  if (!value || typeof value !== 'object') return false;
  const { size, textColor, underlineColor, font } = value as Partial<SubtitleAppearance>;
  const isColor = (color: unknown) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
  return typeof size === 'number' && Number.isInteger(size) &&
    size >= MIN_SUBTITLE_SIZE && size <= MAX_SUBTITLE_SIZE &&
    isColor(textColor) && isColor(underlineColor) &&
    typeof font === 'string' && Object.hasOwn(SUBTITLE_FONTS, font);
}

export type PreferenceMessage =
  | { type: 'get-preferences' }
  | { type: 'set-interface-theme'; theme: InterfaceTheme }
  | { type: 'set-subtitle-appearance'; appearance: SubtitleAppearance };

export type PreferencesResponse =
  | { ok: true; theme: InterfaceTheme; appearance: SubtitleAppearance }
  | { ok: false };

export function subtitleStyle(appearance: SubtitleAppearance) {
  return {
    '--kr-subtitle-scale': String(appearance.size / 100),
    '--kr-subtitle-color': appearance.textColor,
    '--kr-subtitle-underline': appearance.underlineColor,
    '--kr-subtitle-font': SUBTITLE_FONTS[appearance.font].stack,
  };
}
