import { findPlayer } from '@/services/youtube/captions';
import { setNativeCaptionsHidden } from '@/services/youtube/native-captions';
import type { SubtitleOverlay } from '@/services/youtube/overlay';
import type { CaptionSnapshot } from '@/types/youtube';

export interface SubtitlePresenter {
  update(snapshot: CaptionSnapshot): void;
  destroy(): void;
}

export interface SubtitlePresenterOptions {
  document?: Document;
  overlay: SubtitleOverlay;
  hideDelayMs?: number;
}

export function createSubtitlePresenter({
  document: doc = document,
  overlay,
  hideDelayMs = 500,
}: SubtitlePresenterOptions): SubtitlePresenter {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let lastVideoId: string | null = null;
  let showing = false;
  let nativeCaptionsHidden = false;

  function clearHideTimer(): void {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setNativeHidden(hidden: boolean, player: HTMLElement | null = null): void {
    if (nativeCaptionsHidden === hidden) {
      return;
    }

    nativeCaptionsHidden = hidden;
    setNativeCaptionsHidden(doc, hidden, player);
  }

  function hideNow(): void {
    clearHideTimer();

    if (showing) {
      showing = false;
      overlay.hide();
    }

    setNativeHidden(false);
  }

  function update(snapshot: CaptionSnapshot): void {
    if (snapshot.videoId !== lastVideoId) {
      lastVideoId = snapshot.videoId;
      hideNow();
    }

    const player = findPlayer(doc);

    if (!snapshot.videoId || !snapshot.hasVideo || !player) {
      hideNow();
      return;
    }

    const canShow = snapshot.isKorean && snapshot.lines.length > 0;

    if (canShow) {
      clearHideTimer();
      overlay.update(snapshot, player);
      showing = true;
      setNativeHidden(true, player);
      return;
    }

    if (!showing) {
      hideNow();
      return;
    }

    if (hideTimer === null) {
      hideTimer = setTimeout(() => {
        hideTimer = null;
        hideNow();
      }, hideDelayMs);
    }
  }

  function destroy(): void {
    hideNow();
    overlay.destroy();
  }

  return {
    update,
    destroy,
  };
}
