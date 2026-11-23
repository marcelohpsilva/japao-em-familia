// Efeitos: confete, som curto ("pling") e vibração. Som vem desligado por padrão.
import confetti from 'canvas-confetti';

const CORES = ['#D62D20', '#FFC72C', '#1565A6', '#FFF6E5', '#ff8a3d'];

export function soltarConfete(reduzido: boolean) {
  if (reduzido) return;
  confetti({
    particleCount: 90,
    spread: 75,
    origin: { y: 0.6 },
    colors: CORES,
    disableForReducedMotion: true,
  });
}

let ctx: AudioContext | null = null;
export function pling(ligado: boolean) {
  if (!ligado) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(988, t);
    o.frequency.setValueAtTime(1319, t + 0.07);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.26);
  } catch {
    /* sem áudio */
  }
}

export function vibrar(ms = 30) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sem vibração */
  }
}
