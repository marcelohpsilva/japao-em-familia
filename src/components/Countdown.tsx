import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Roteiro } from '../types';
import { dateInTz, daysBetween, formatDuracao, zonedToEpoch } from '../lib/time';
import { CenaContagem, Musubi } from './Art';
import { soltarConfete } from '../lib/fx';
import { useStore } from '../lib/store';

/** Número que "vira" como placar de fliperama. */
function Placar({ valor }: { valor: number }) {
  const digitos = String(valor).padStart(2, '0').split('');
  return (
    <span className="placar" aria-hidden="true">
      {digitos.map((d, i) => (
        <span className="placar-digito" key={i}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={d}
              initial={{ rotateX: -90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: 90, opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              {d}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

export function Countdown({ roteiro, agoraMs }: { roteiro: Roteiro; agoraMs: number }) {
  const { ajustes } = useStore();
  const v = roteiro.viagem;
  const hoje = dateInTz(agoraMs, v.embarque_fuso);
  const faltam = daysBetween(hoje, v.embarque_data);
  const ehHoje = faltam === 0;
  // Saída de casa: embarque_data + embarque_hora no fuso do embarque.
  const saida = v.embarque_hora ? zonedToEpoch(v.embarque_data, v.embarque_hora, v.embarque_fuso) : null;
  const minParaSair = saida ? Math.round((saida - agoraMs) / 60000) : null;
  const confetiFeito = useRef(false);

  useEffect(() => {
    if (ehHoje && !confetiFeito.current) {
      confetiFeito.current = true;
      setTimeout(() => soltarConfete(ajustes.animReduzidas), 400);
    }
  }, [ehHoje, ajustes.animReduzidas]);

  // Avião anda pela trilha nos últimos 60 dias.
  const progresso = ehHoje ? 1 : 1 - Math.min(faltam, 60) / 60;

  return (
    <section className="contagem cartao-toy" aria-live="polite">
      <CenaContagem progresso={progresso} />
      <div className="contagem-texto">
        {ehHoje ? (
          <>
            <p className="contagem-grande">É hoje!</p>
            <p className="contagem-sub">
              {v.embarque_hora ? `Saída para o aeroporto às ${v.embarque_hora.replace(':', 'h')}` : 'Boa viagem!'}
              {minParaSair !== null && minParaSair > 0 && ` · em ${formatDuracao(minParaSair)}`}
            </p>
          </>
        ) : (
          <>
            <p className="contagem-sub">Faltam</p>
            <p className="contagem-grande" aria-label={`Faltam ${faltam} dias para o embarque`}>
              <Placar valor={faltam} /> <span className="contagem-unidade">{faltam === 1 ? 'dia' : 'dias'}</span>
            </p>
            <p className="contagem-sub">para o embarque</p>
          </>
        )}
      </div>
      <Musubi pose={ehHoje ? 'jump' : 'idle'} size={84} className="contagem-mascote pula" />
    </section>
  );
}
