import type { VocabularyEntry } from '../../../types/vocabulary';

/**
 * Generates a short, self-contained 16-bit PCM WAV data URL (two gentle tones)
 * so the Phase D0 desktop spike can verify offline audio playback without
 * external files or network requests.
 */
export function createSampleWavDataUrl(): string {
  const sampleRate = 16000;
  const durationSeconds = 0.45;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const freq = t < 0.22 ? 523.25 : 659.25; // C5 -> E5
    const fadeIn = Math.min(1, t / 0.02);
    const fadeOut = Math.min(1, (durationSeconds - t) / 0.05);
    const envelope = fadeIn * fadeOut * 0.25;
    const sample = Math.sin(2 * Math.PI * freq * t) * envelope;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function createSampleMinedEntry(): VocabularyEntry {
  return {
    headword: '익숙하다',
    originalForm: '익숙해졌어요',
    frequencyRank: 1842,
    partOfSpeech: '형용사',
    pronunciation: '익쑤카다',
    definitions: [
      'familiar; accustomed: having become used to something through repeated experience',
      'skilled; experienced: able to do something smoothly without hesitation',
    ],
    koreanDefinitions: [
      '어떤 일을 여러 번 하여 서투르지 않고 능숙하다.',
      '자주 보거나 겪어서 낯설지 않다.',
    ],
    examples: ['서울 생활에 이제 꽤 익숙해졌어요.'],
    contexts: [
      {
        sentence: '이제는 한국어 자막으로 영상을 보는 게 꽤 익숙해졌어요.',
        originalForm: '익숙해졌어요',
        sourceUrl: 'https://www.youtube.com/watch?v=KTIByn_rIWM',
        sourceTitle: 'Korean Immersion Vlog — Daily Study Routine',
        timestamp: 84,
        audio: createSampleWavDataUrl(),
        minedAt: '2026-11-21T07:00:00.000Z',
      },
    ],
    status: 'known',
    createdAt: '2026-11-21T07:00:00.000Z',
    updatedAt: '2026-11-21T07:00:00.000Z',
  };
}
