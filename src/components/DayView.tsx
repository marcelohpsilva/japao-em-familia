import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
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

export function DayView(props: Props) {
  const idx = props.roteiro.dias.findIndex((d) => d.data === props.data);
  if (idx < 0) {
    return (
      <div className="vazio">
        <Musubi pose="sleep" />
        <p>Nenhum dia {formatDia(props.data)} no roteiro.</p>
      </div>
    );
  }
  return <DiaDoRoteiro {...props} idx={idx} />;
}

function DiaDoRoteiro({ roteiro, data, agoraMs, ehHoje, onMudarDia, idx }: Props & { idx: number }) {
  const { feitos, marcar, ajustes } = useStore();
  const ui = useUi();
  const [expandido, setExpandido] = useState(false);
  const [faseConcluida, setFaseConcluida] = useState<number | null>(null);
  const vibrados = useRef(new Set<string>());

  const dia = roteiro.dias[idx];
  const cartoes = useMemo(() => cartoesDoDia(roteiro, data), [roteiro, data]);

  const resumo = resumoDoDia(roteiro, dia, feitos);

  // Classifica os cartões pelo relógio (só no dia de hoje).
  // Itens sem hora nunca são recolhidos: continuam na posição da planilha.
  const passados: Cartao[] = [];
  const restantes: Cartao[] = [];
  for (const c of cartoes) {
    if (ehHoje && c.fim !== undefined && c.fim <= agoraMs) passados.push(c);
    else restantes.push(c);
  }
  const comHora = restantes.filter((c) => c.inicio !== undefined);
  const atual = ehHoje ? comHora.find((c) => c.inicio! <= agoraMs && agoraMs < c.fim!) : undefined;
  const proximo = ehHoje ? comHora.find((c) => c.inicio! > agoraMs) : undefined;

  // Lembrete dentro do app: item crítico começando dentro do lembrete_min.
  const lembrete = ehHoje
    ? comHora.find((c) => {
        if (!c.critico || feitos[c.chave]) return false;
        const min = (c.inicio! - agoraMs) / 60000;
        return min > 0 && min <= (c.principal.lembrete_min ?? 30);
      })
    : undefined;

  useEffect(() => {
    if (lembrete && !vibrados.current.has(lembrete.chave)) {
      vibrados.current.add(lembrete.chave);
      vibrar(200);
    }
  }, [lembrete]);

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
        {ehHoje && comHora.length === 0 && passados.length > 0 && (
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
