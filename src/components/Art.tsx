// Arte provisória em SVG, original, até chegarem as imagens do Gemini.
// Musubi: um onigiri aventureiro com faixa vermelha na cabeça e mochila vermelha.

type Pose = 'idle' | 'jump' | 'sleep';

export function Musubi({ pose = 'idle', size = 96, className }: { pose?: Pose; size?: number; className?: string }) {
  const olhosFechados = pose !== 'idle';
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Musubi, o mascote"
    >
      {pose === 'jump' && (
        <g fill="#FFC72C" stroke="#14183F" strokeWidth="2">
          <path d="M14 30l3 6 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z" />
          <path d="M104 22l3 6 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z" />
        </g>
      )}
      {/* mochila */}
      <rect x="78" y="58" width="24" height="34" rx="8" fill="#D62D20" stroke="#14183F" strokeWidth="4" />
      {/* braços */}
      {pose === 'jump' ? (
        <>
          <path d="M30 64 L16 42" stroke="#14183F" strokeWidth="8" strokeLinecap="round" />
          <path d="M90 64 L104 42" stroke="#14183F" strokeWidth="8" strokeLinecap="round" />
        </>
      ) : pose === 'idle' ? (
        <path d="M92 66 L106 52" stroke="#14183F" strokeWidth="8" strokeLinecap="round" />
      ) : null}
      {/* corpo de onigiri */}
      <path
        d="M60 14 C70 14 78 22 86 36 C96 54 102 70 100 84 C98 98 84 104 60 104 C36 104 22 98 20 84 C18 70 24 54 34 36 C42 22 50 14 60 14 Z"
        fill="#FFFFFF"
        stroke="#14183F"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* faixa vermelha */}
      <path d="M38 34 Q60 26 82 34 L84 41 Q60 33 36 41 Z" fill="#D62D20" stroke="#14183F" strokeWidth="3" />
      <path d="M82 36 l12 -6 l-2 10 z" fill="#D62D20" stroke="#14183F" strokeWidth="3" strokeLinejoin="round" />
      {/* nori */}
      <rect x="38" y="76" width="44" height="28" rx="4" fill="#14183F" />
      {/* olhos */}
      {olhosFechados ? (
        <g stroke="#14183F" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M44 58 q5 -5 10 0" />
          <path d="M66 58 q5 -5 10 0" />
        </g>
      ) : (
        <g fill="#14183F">
          <ellipse cx="49" cy="57" rx="5" ry="6.5" />
          <ellipse cx="71" cy="57" rx="5" ry="6.5" />
          <circle cx="51" cy="54.5" r="1.8" fill="#fff" />
          <circle cx="73" cy="54.5" r="1.8" fill="#fff" />
        </g>
      )}
      {/* bochechas */}
      <ellipse cx="40" cy="66" rx="6" ry="3.5" fill="#ff9aa2" />
      <ellipse cx="80" cy="66" rx="6" ry="3.5" fill="#ff9aa2" />
      {/* boca */}
      {pose === 'sleep' ? (
        <ellipse cx="60" cy="68" rx="3" ry="2" fill="#14183F" />
      ) : (
        <path d="M54 66 q6 6 12 0" stroke="#14183F" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      )}
      {pose === 'sleep' && (
        <g fill="#1565A6" fontFamily="Baloo 2, sans-serif" fontWeight="800">
          <text x="92" y="24" fontSize="16">z</text>
          <text x="102" y="12" fontSize="12">z</text>
        </g>
      )}
    </svg>
  );
}

export function Moeda({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#FFC72C" stroke="#14183F" strokeWidth="3" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#e0a400" strokeWidth="2" />
      <path d="M9 21 L14 12 L16 15 L18 12 L23 21 Z" fill="#fff" stroke="#14183F" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Estrelas({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="estrelas" role="img" aria-label={`${n} de 3 estrelas`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path
            d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z"
            fill={i < n ? '#FFC72C' : 'rgba(20,24,63,.15)'}
            stroke="#14183F"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

/** Cena da contagem: trilha pontilhada, aviãozinho e o Fuji com sol nascendo. */
export function CenaContagem({ progresso }: { progresso: number }) {
  // progresso 0..1 = quanto do caminho já foi (aproxima conforme faltam menos dias)
  const p = Math.max(0, Math.min(1, progresso));
  const x = 18 + p * 200;
  const y = 120 - Math.sin(p * Math.PI) * 60 - p * 20;
  return (
    <svg viewBox="0 0 320 170" className="cena-contagem" role="img" aria-label="Avião a caminho do Monte Fuji">
      <defs>
        <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14183F" />
          <stop offset="0.75" stopColor="#1565A6" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      <rect width="320" height="170" fill="url(#ceu)" />
      {[[30, 20], [80, 40], [140, 18], [200, 34], [290, 22], [250, 52], [60, 70]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i % 2 ? 1.4 : 2} fill="#FFF6E5" opacity=".85" />
      ))}
      <circle className="sol" cx="262" cy="118" r="30" fill="#D62D20" />
      <path d="M200 170 L262 92 L324 170 Z" fill="#FFF6E5" stroke="#14183F" strokeWidth="4" strokeLinejoin="round" />
      <path d="M200 170 L262 92 L324 170 Z" fill="#7fa7d6" opacity=".55" />
      <path d="M244 114 L262 92 L280 114 L272 110 L262 118 L252 110 Z" fill="#FFF6E5" stroke="#14183F" strokeWidth="3" strokeLinejoin="round" />
      <path
        d="M18 120 Q118 30 248 100"
        fill="none"
        stroke="#FFF6E5"
        strokeWidth="3"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      <g transform={`translate(${x} ${y}) rotate(-12)`}>
        <path d="M-14 0 L14 -2 Q20 0 14 2 Z" fill="#FFF6E5" stroke="#14183F" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M-2 -1 L-8 -12 L-2 -12 L6 -1 Z M-2 1 L-8 12 L-2 12 L6 1 Z" fill="#D62D20" stroke="#14183F" strokeWidth="2" strokeLinejoin="round" />
        <path d="M-14 0 L-18 -7 L-12 -1 Z" fill="#D62D20" stroke="#14183F" strokeWidth="2" />
      </g>
    </svg>
  );
}
