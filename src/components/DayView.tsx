import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { Roteiro } from '../types';
import { cartoesDoDia, KANJI_MUNDO, NOME_MUNDO, PONTOS_DIA_CRITICOS, pontosDoCartao, resumoDoDia, rotuloFase, type Cartao } from '../lib/game';
import { formatDia } from '../lib/time';
import { useStore } from '../lib/store';
import { lancarMoeda } from '../lib/hooks';
import { pling, soltarConfete, vibrar } from '../lib/fx';
import { useUi } from '../lib/ui';
import { ItemCard, type Momento } from './ItemCard';
import { Estrelas, Musubi } from './Art';
import { StageClear } from './Overlays';

interface Props {
  roteiro: Roteiro;
  data: string;
  agoraMs: number;
  ehHoje: boolean;
  onMudarDia(data: string): void;
}

export function DayView({ roteiro, data, agoraMs, ehHoje, onMudarDia }: Props) {
  const { feitos, marcar, ajustes } = useStore();
  const ui = useUi();
  const [expandido, setExpandido] = useState(false);
  const [faseConcluida, setFaseConcluida] = useState<number | null>(null);

  const idx = roteiro.dias.findIndex((d) => d.data === data);
  const dia = roteiro.dias[idx];
  const cartoes = useMemo(() => cartoesDoDia(roteiro, data), [roteiro, data]);

  if (!dia) {
    return (
      <div className="vazio">
        <Musubi pose="sleep" />
        <p>Nenhum dia {formatDia(data)} no roteiro.</p>
      </div>
    );
  }

  const resumo = resumoDoDia(roteiro, dia, feitos);

  // Classifica os cartões pelo relógio (só no dia de hoje).
  const comHora = cartoes.filter((c) => c.inicio !== undefined);
  const semHora = cartoes.filter((c) => c.inicio === undefined);
  const passados: Cartao[] = [];
  const restantes: Cartao[] = [];
  for (const c of comHora) {
    if (ehHoje && c.fim! <= agoraMs) passados.push(c);
    else restantes.push(c);
  }
  const atual = ehHoje ? restantes.find((c) => c.inicio! <= agoraMs && agoraMs < c.fim!) : undefined;
  const proximo = ehHoje ? restantes.find((c) => c.inicio! > agoraMs) : undefined;

  // Lembrete dentro do app: item crítico começando dentro do lembrete_min.
  const lembrete = ehHoje
    ? restantes.find((c) => {
        if (!c.critico || feitos[c.chave]) return false;
        const min = (c.inicio! - agoraMs) / 60000;
        return min > 0 && min <= (c.principal.lembrete_min ?? 30);
      })
    : undefined;

  const momento = (c: Cartao): Momento => {
    if (c.inicio === undefined) return 'livre';
    if (!ehHoje) return 'futuro';
    if (c === atual) return 'agora';
    if (c === proximo) return 'proximo';
    return 'futuro';
  };

  const onMarcar = (c: Cartao) => (feito: boolean, x: number, y: number) => {
    const antes = resumoDoDia(roteiro, dia, feitos);
    marcar(c.chave, feito);
    if (!feito) return;
    vibrar();
    pling(ajustes.som);
    lancarMoeda(x, y, pontosDoCartao(c));
    const depois = resumoDoDia(roteiro, dia, { ...feitos, [c.chave]: Date.now() });
    if (!antes.criticosOk && depois.criticosOk) {
      setTimeout(() => {
        setFaseConcluida(depois.estrelas || 1);
        soltarConfete(ajustes.animReduzidas);
      }, 500);
    }
  };

  const renderCartao = (c: Cartao) => (
    <ItemCard
      key={c.chave}
      cartao={c}
      feito={!!feitos[c.chave]}
      momento={momento(c)}
      minutosParaComecar={c === proximo ? Math.max(1, Math.round((c.inicio! - agoraMs) / 60000)) : undefined}
      onMarcar={onMarcar(c)}
    />
  );

  const anterior = roteiro.dias[idx - 1];
  const seguinte = roteiro.dias[idx + 1];
  const bonus = dia.tipo_dia === 'parque';

  return (
    <div className={`dia mundo-${dia.mundo}`}>
      <header className={`dia-cabecalho cartao-toy ${bonus ? 'bonus' : ''}`}>
        <div className="dia-nav">
          <button
            type="button"
            className="btn-seta"
            onClick={() => anterior && onMudarDia(anterior.data)}
            disabled={!anterior}
            aria-label="Dia anterior"
          >
            ‹
          </button>
          <div className="dia-titulos">
            <p className="dia-fase">
              <span className="kanji" lang="ja">{KANJI_MUNDO[dia.mundo]}</span> {rotuloFase(dia)}
              {bonus && <span className="selo-bonus">★ bônus</span>}
            </p>
            <h1 className="dia-titulo">{dia.titulo}</h1>
            <p className="dia-data">
              {ehHoje ? 'Hoje · ' : ''}
              {formatDia(dia.data)} · {NOME_MUNDO[dia.mundo]}
            </p>
          </div>
          <button
            type="button"
            className="btn-seta"
            onClick={() => seguinte && onMudarDia(seguinte.data)}
            disabled={!seguinte}
            aria-label="Próximo dia"
          >
            ›
          </button>
        </div>
        <div className="dia-info">
          <span>🏨 {dia.hotel}</span>
          <Estrelas n={resumo.estrelas} />
        </div>
        {dia.dica_do_dia && <p className="dica">💡 {dia.dica_do_dia}</p>}
      </header>

      <AnimatePresence>
        {lembrete && (
          <motion.button
            type="button"
            className="faixa-lembrete"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => ui.abrirItem(lembrete.principal)}
          >
            ⏰ Em {Math.max(1, Math.round((lembrete.inicio! - agoraMs) / 60000))} min: {lembrete.principal.titulo}
          </motion.button>
        )}
      </AnimatePresence>

      <section className="linha-tempo" aria-label="Linha do tempo do dia">
        {passados.length > 0 && (
          <>
            <button type="button" className="recolhidos" onClick={() => setExpandido((v) => !v)} aria-expanded={expandido}>
              ✓ {passados.length} {passados.length === 1 ? 'item já passou' : 'itens já passaram'}
              <span aria-hidden="true">{expandido ? '▲' : '▼'}</span>
            </button>
            <AnimatePresence initial={false}>
              {expandido && (
                <motion.div
                  className="passados"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  {passados.map((c) => (
                    <ItemCard key={c.chave} cartao={c} feito={!!feitos[c.chave]} momento="passado" onMarcar={onMarcar(c)} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
        {restantes.map(renderCartao)}
        {ehHoje && restantes.length === 0 && passados.length > 0 && (
          <div className="vazio">
            <Musubi pose="sleep" size={88} />
            <p>Nada mais hoje. Bom descanso!</p>
          </div>
        )}
        {cartoes.length === 0 && (
          <div className="vazio">
            <Musubi pose="idle" size={88} />
            <p>{dia.resumo || 'Sem itens neste dia.'}</p>
          </div>
        )}
        {semHora.length > 0 && (
          <>
            <h2 className="secao-titulo">A qualquer hora</h2>
            {semHora.map(renderCartao)}
          </>
        )}
        {resumo.criticos > 0 && (
          <p className="legenda">
            Faça todos os itens ⚠️ do dia e ganhe +{PONTOS_DIA_CRITICOS} moedas.
          </p>
        )}
      </section>

      <StageClear estrelas={faseConcluida} rotulo={rotuloFase(dia)} onFechar={() => setFaseConcluida(null)} />
    </div>
  );
}
