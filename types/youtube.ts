export interface CaptionTrack {
  language: string;
  label: string;
  kind: string;
}

export interface CaptionSnapshot {
  lines: string[];
  text: string;
  isKorean: boolean;
  timestamp: number | null;
  videoId: string | null;
  hasVideo: boolean;
  hasNativeCaptions: boolean;
  isRolling?: boolean;
  activeTrack: CaptionTrack | null;
  availableTracks: CaptionTrack[];
}
