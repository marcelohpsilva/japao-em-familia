import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dia, Item } from './types';
import { useStore } from './lib/store';
import { useAgora, haQuanto } from './lib/hooks';
import { simulando } from './lib/time';
import { totalMoedas } from './lib/game';
import { UiCtx, type Ui } from './lib/ui';
import { Moeda, Musubi } from './components/Art';
import { Comprovante, ItemSheet, StageIntro, Taxi } from './components/Overlays';
import { Ajustes, Contatos, Entrada, etapaAtual, Hoje, Agenda, Pendencias, SemAcesso } from './components/Screens';

type Aba = 'hoje' | 'agenda' | 'pendencias' | 'contatos' | 'ajustes';

interface MoedaVoando {
  id: number;
  x: number;
  y: number;
  pontos: number;
}

export default function App() {
  const s = useStore();
  const agoraMs = useAgora();
  const [aba, setAba] = useState<Aba>('hoje');
  const [dataEscolhida, setDataEscolhida] = useState<string | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [taxi, setTaxi] = useState<{ titulo: string; endereco_jp?: string; local?: string } | null>(null);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [intro, setIntro] = useState<Dia | null>(null);
  const [voando, setVoando] = useState<MoedaVoando[]>([]);
  const placarRef = useRef<HTMLSpanElement>(null);
  const introMostrada = useRef(false);

  const reduzido = s.ajustes.animReduzidas;

  // Abertura de fase ao abrir o app durante a viagem.
  useEffect(() => {
    if (!s.roteiro || introMostrada.current) return;
    introMostrada.current = true;
    if (reduzido) return;
    const e = etapaAtual(s.roteiro, agoraMs);
    if (e.tipo === 'durante') setIntro(s.roteiro.dias.find((d) => d.data === e.data) ?? null);
  }, [s.roteiro, agoraMs, reduzido]);

  // Moedas voando até o placar.
  useEffect(() => {
    const h = (ev: Event) => {
      if (reduzido) return;
      const { x, y, pontos } = (ev as CustomEvent).detail;
      const id = Math.random();
      setVoando((v) => [...v, { id, x, y, pontos }]);
      setTimeout(() => setVoando((v) => v.filter((m) => m.id !== id)), 900);
    };
    window.addEventListener('moeda', h);
    return () => window.removeEventListener('moeda', h);
  }, [reduzido]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  const ui = useMemo<Ui>(
    () => ({
      abrirItem: setItem,
      abrirTaxi: setTaxi,
      abrirComprovante: setComprovante,
      aviso: setAviso,
      irParaDia: (d) => {
        setDataEscolhida(d);
        setAba('hoje');
      },
    }),
    [],
  );

  const fecharIntro = useCallback(() => setIntro(null), []);
  const moedas = s.roteiro ? totalMoedas(s.roteiro, s.feitos) : 0;

  if (!s.pronto) return <div className="carregando-tela"><Musubi pose="idle" /></div>;

  if (!s.roteiro) {
    return (
      <MotionConfig reducedMotion={reduzido ? 'always' : 'user'}>
        <main className={reduzido ? 'reduzido' : ''}>{s.sync === 'sem_acesso' && s.fonte === 'google' ? <SemAcesso /> : <Entrada />}</main>
      </MotionConfig>
    );
  }

  const roteiro = s.roteiro;
  const alvo = placarRef.current?.getBoundingClientRect();

  return (
    <MotionConfig reducedMotion={reduzido ? 'always' : 'user'}>
      <UiCtx.Provider value={ui}>
        <div className={`app ${reduzido ? 'reduzido' : ''}`}>
          <header className="topo">
            <span className="topo-nome">
              <span lang="ja" className="kanji">今日</span> {roteiro.viagem.nome_viagem}
            </span>
            <span className="topo-dir">
              <span className={`sync ${s.online ? '' : 'sync-off'}`} title={s.online ? 'Online' : 'Sem internet'}>
                {s.fonte === 'demo' ? 'exemplo' : s.online ? `☁️ ${haQuanto(s.atualizadoEm)}` : `🚫☁️ ${haQuanto(s.atualizadoEm)}`}
              </span>
              <span className="placar-moedas" ref={placarRef} aria-label={`${moedas} moedas`}>
                <Moeda /> <b>{moedas}</b>
              </span>
              <button type="button" className={`btn-icone ${aba === 'ajustes' ? 'on' : ''}`} onClick={() => setAba('ajustes')} aria-label="Ajustes">
                ⚙️
              </button>
            </span>
          </header>

          {simulando() && (
            <p className="faixa-sim">
              Modo simulação: {new Date(agoraMs).toLocaleString('pt-BR', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' })} (Japão)
            </p>
          )}
          {s.sync === 'precisa_login' && (
            <button type="button" className="faixa-login" onClick={() => s.atualizar(true)}>
              Entrar de novo para atualizar →
            </button>
          )}
          {s.sync === 'erro' && s.erro && <p className="faixa-login">⚠️ {s.erro}</p>}

          <main className="conteudo">
            <AnimatePresence mode="wait">
              <motion.div key={aba + (dataEscolhida ?? '')} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {aba === 'hoje' && <Hoje roteiro={roteiro} agoraMs={agoraMs} dataEscolhida={dataEscolhida} setDataEscolhida={setDataEscolhida} />}
                {aba === 'agenda' && <Agenda roteiro={roteiro} agoraMs={agoraMs} abrirDia={ui.irParaDia} />}
                {aba === 'pendencias' && <Pendencias roteiro={roteiro} agoraMs={agoraMs} />}
                {aba === 'contatos' && <Contatos roteiro={roteiro} />}
                {aba === 'ajustes' && <Ajustes />}
              </motion.div>
            </AnimatePresence>
          </main>

          <nav className="abas" aria-label="Telas">
            {(
              [
                ['hoje', '今日', 'Hoje'],
                ['agenda', '🗓️', 'Agenda'],
                ['pendencias', '📋', 'Pendências'],
                ['contatos', '📞', 'Contatos'],
              ] as const
            ).map(([k, icone, nome]) => (
              <button
                key={k}
                type="button"
                className={aba === k ? 'on' : ''}
                aria-current={aba === k ? 'page' : undefined}
                onClick={() => {
                  setAba(k);
                  if (k === 'hoje') setDataEscolhida(null);
                }}
              >
                <span className="aba-icone" lang={k === 'hoje' ? 'ja' : undefined} aria-hidden="true">{icone}</span>
                {nome}
              </button>
            ))}
          </nav>

          {voando.map((m) => (
            <motion.span
              key={m.id}
              className="moeda-voando"
              initial={{ x: m.x - 14, y: m.y - 14, scale: 1.4 }}
              animate={{ x: (alvo?.left ?? window.innerWidth - 60) + 4, y: (alvo?.top ?? 10) + 2, scale: 0.8 }}
              transition={{ duration: 0.7, ease: [0.5, -0.4, 0.6, 1] }}
            >
              <Moeda size={28} />
              <b>+{m.pontos}</b>
            </motion.span>
          ))}

          <ItemSheet item={item} onFechar={() => setItem(null)} />
          <Taxi alvo={taxi} onFechar={() => setTaxi(null)} />
          <Comprovante nomes={comprovante} onFechar={() => setComprovante(null)} />
          <StageIntro dia={intro} onFim={fecharIntro} />
          <AnimatePresence>
            {aviso && (
              <motion.p className="toast" role="status" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
                {aviso}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </UiCtx.Provider>
    </MotionConfig>
  );
}
