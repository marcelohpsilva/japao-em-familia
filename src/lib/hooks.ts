import { useEffect, useState } from 'react';
import { agora } from './time';

/** Relógio do app (respeita ?agora=). Atualiza a cada `ms`. */
export function useAgora(ms = 15000) {
  const [t, setT] = useState(agora);
  useEffect(() => {
    const id = setInterval(() => setT(agora()), ms);
    const vis = () => setT(agora());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms]);
  return t;
}

/** "agora mesmo", "há 5 min", "há 2 h", "há 3 dias" */
export function haQuanto(ms: number | null, agoraMs = Date.now()) {
  if (!ms) return 'nunca';
  const min = Math.round((agoraMs - ms) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** Evento para a moeda voar até o placar. */
export function lancarMoeda(x: number, y: number, pontos: number) {
  window.dispatchEvent(new CustomEvent('moeda', { detail: { x, y, pontos } }));
}
