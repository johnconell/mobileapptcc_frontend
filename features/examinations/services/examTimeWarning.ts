import { Platform, Vibration } from 'react-native';

/**
 * Short attention signal when exam time is nearly up (no extra audio dependency).
 */
export function playExamTimeWarning(): void {
  try {
    Vibration.vibrate(Platform.OS === 'android' ? [0, 220, 120, 220] : 400);
  } catch {
    /* ignore */
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.stop(ctx.currentTime + 0.4);
      setTimeout(() => {
        try {
          void ctx.close();
        } catch {
          /* ignore */
        }
      }, 500);
    } catch {
      /* ignore */
    }
  }
}
