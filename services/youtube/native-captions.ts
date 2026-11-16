export const NATIVE_CAPTION_HIDDEN_CLASS = 'korean-reader-native-captions-hidden';
const NATIVE_CAPTION_STYLE_ID = 'korean-reader-native-caption-style';

const HIDDEN_PLAYER_SELECTOR = `:is(#movie_player, .html5-video-player).${NATIVE_CAPTION_HIDDEN_CLASS}`;

const NATIVE_CAPTION_STYLE = `
${HIDDEN_PLAYER_SELECTOR} .ytp-caption-window-container {
  pointer-events: none !important;
}

${HIDDEN_PLAYER_SELECTOR} .ytp-caption-window-container,
${HIDDEN_PLAYER_SELECTOR} .ytp-caption-window-container .caption-window,
${HIDDEN_PLAYER_SELECTOR} .ytp-caption-window-container .caption-window *,
${HIDDEN_PLAYER_SELECTOR} .ytp-caption-window-rollup,
${HIDDEN_PLAYER_SELECTOR} .ytp-caption-window-rollup * {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
  background: transparent !important;
  box-shadow: none !important;
}
`;

export function ensureNativeCaptionStyle(doc: Document): void {
  if (doc.getElementById(NATIVE_CAPTION_STYLE_ID)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = NATIVE_CAPTION_STYLE_ID;
  style.textContent = NATIVE_CAPTION_STYLE;
  (doc.head ?? doc.documentElement).append(style);
}

/**
 * Hides native captions on a single player so previews/miniplayers keep theirs.
 * Unhiding clears the class everywhere, which also cleans up a replaced player.
 */
export function setNativeCaptionsHidden(
  doc: Document,
  hidden: boolean,
  player: HTMLElement | null = null,
): void {
  ensureNativeCaptionStyle(doc);

  if (hidden) {
    player?.classList.add(NATIVE_CAPTION_HIDDEN_CLASS);
    return;
  }

  const hiddenPlayers = doc.querySelectorAll<HTMLElement>(HIDDEN_PLAYER_SELECTOR);

  for (const hiddenPlayer of hiddenPlayers) {
    hiddenPlayer.classList.remove(NATIVE_CAPTION_HIDDEN_CLASS);
  }
}
