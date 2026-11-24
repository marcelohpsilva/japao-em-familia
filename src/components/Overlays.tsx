import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { Dia, Item } from '../types';
import { useStore, type ResultadoComprovante } from '../lib/store';
import { ICONE_TIPO, TEXTO_PAGAR, TEXTO_STATUS, copiar, horaAConfirmar, ienes, nomeDoFuso, useUi } from '../lib/ui';
import { KANJI_MUNDO, rotuloFase, PONTOS_DIA_CRITICOS } from '../lib/game';
import { formatDuracao } from '../lib/time';
import { rotuloArquivo } from '../lib/comprovantes';
import { Estrelas, Musubi } from './Art';

/** Folha que sobe de baixo. */
export function Folha({ aberta, onFechar, titulo, children }: { aberta: boolean; onFechar(): void; titulo: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberta, onFechar]);
  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="folha-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFechar}>
          <motion.div
            className="folha"
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="folha-alca" aria-hidden="true" />
            <button type="button" className="btn-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Copia o endereço em japonês (para colar no app de táxi ou mandar por mensagem). */
export function BotaoCopiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<'' | 'ok' | 'erro'>('');
  return (
    <button
      type="button"
      className="btn"
      onClick={async (e) => {
        e.stopPropagation();
        setEstado((await copiar(texto)) ? 'ok' : 'erro');
        setTimeout(() => setEstado(''), 2000);
      }}
    >
      {estado === 'ok' ? '✓ Endereço copiado' : estado === 'erro' ? 'Não deu para copiar' : '📋 Copiar endereço'}
    </button>
  );
}

export function ItemSheet({ item, onFechar }: { item: Item | null; onFechar(): void }) {
  const ui = useUi();
  return (
    <Folha aberta={!!item} onFechar={onFechar} titulo={item?.titulo ?? ''}>
      {item && (
        <div className="detalhe">
          <p className="detalhe-tipo">{ICONE_TIPO[item.tipo]} {item.tipo}</p>
          <h2>{item.titulo}</h2>
          <p className="detalhe-hora">
            {item.hora_inicio
              ? `${item.hora_inicio}${item.hora_fim ? ` – ${item.hora_fim}` : ''}`
              : horaAConfirmar(item) ? 'Horário a confirmar' : 'A qualquer hora'}
            {nomeDoFuso(item.fuso) ? ` (hora de ${nomeDoFuso(item.fuso)})` : ''}
          </p>
          {item.critico && <p className="selo selo-critico">⚠️ Importante{item.lembrete_min ? ` · lembrete ${item.lembrete_min} min antes` : ''}</p>}
          <dl className="detalhe-lista">
            {item.local && (<><dt>Local</dt><dd>{item.local}</dd></>)}
            {item.descricao && (<><dt>Descrição</dt><dd>{item.descricao}</dd></>)}
            {item.linha && (<><dt>Linha</dt><dd>{item.linha}</dd></>)}
            {(item.de || item.para) && (<><dt>Trajeto</dt><dd>{item.de} → {item.para}</dd></>)}
            {item.duracao_min !== undefined && (<><dt>Duração</dt><dd>{formatDuracao(item.duracao_min)}</dd></>)}
            {item.como_pagar && (<><dt>Como pagar</dt><dd>{TEXTO_PAGAR[item.como_pagar]}</dd></>)}
            <dt>Status</dt><dd>{TEXTO_STATUS[item.status] ?? item.status}</dd>
            {item.custo_previsto_jpy !== undefined && (
              <>
                <dt>Custo previsto</dt>
                <dd>{ienes(item.custo_previsto_jpy)}</dd>
              </>
            )}
            {item.pago !== undefined && (<><dt>Pago</dt><dd>{item.pago ? 'Sim' : 'Não'}</dd></>)}
            {item.notas && (<><dt>Notas</dt><dd>{item.notas}</dd></>)}
          </dl>
          <div className="detalhe-botoes">
            {item.comprovante && (
              <button type="button" className="btn" onClick={() => ui.abrirComprovante(item.comprovante!)}>🎫 Comprovante</button>
            )}
            {item.link_maps && (
              <a className="btn" href={item.link_maps} target="_blank" rel="noreferrer">📍 Abrir no Maps</a>
            )}
            {item.endereco_jp && (
              <>
                <button type="button" className="btn" onClick={() => ui.abrirTaxi(item)}>🚕 Mostrar ao taxista</button>
                <BotaoCopiar texto={item.endereco_jp} />
              </>
            )}
          </div>
        </div>
      )}
    </Folha>
  );
}

/** Endereço em japonês em letra grande, para mostrar ao taxista. */
export function Taxi({ alvo, onFechar }: { alvo: { titulo: string; endereco_jp?: string; local?: string } | null; onFechar(): void }) {
  return (
    <AnimatePresence>
      {alvo && (
        <motion.div className="taxi" role="dialog" aria-modal="true" aria-label="Mostrar ao taxista" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFechar}>
          <p className="taxi-pedido" lang="ja">ここへ行ってください</p>
          <p className="taxi-endereco" lang="ja">{alvo.endereco_jp}</p>
          <p className="taxi-local">{alvo.local ?? alvo.titulo}</p>
          {alvo.endereco_jp && <BotaoCopiar texto={alvo.endereco_jp} />}
          <button type="button" className="btn" onClick={onFechar}>Fechar</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Abre os documentos de um item. A coluna "comprovante" pode ter vários nomes separados
 * por ";", e cada nome pode corresponder a vários arquivos (ex.: um ingresso por pessoa).
 */
export function Comprovante({ nomes, onFechar }: { nomes: string | null; onFechar(): void }) {
  const { resolver, abrirArquivo, procurarDeNovo, fonte, online, arvore } = useStore();
  const refs = (nomes ?? '').split(';').map((x) => x.trim()).filter(Boolean);
  const resolucoes = refs.map((r) => ({ ref: r, ...resolver(r) }));
  const arquivos = [...new Map(resolucoes.flatMap((r) => r.arquivos).map((a) => [a.id, a])).values()];
  const naoAchados = resolucoes.filter((r) => !r.arquivos.length).map((r) => r.ref);
  const [i, setI] = useState(0);
  const [res, setRes] = useState<ResultadoComprovante | null>(null);
  const [procurou, setProcurou] = useState(false);
  const atual = arquivos[i];

  useEffect(() => {
    setI(0);
    setProcurou(false);
  }, [nomes]);

  // Não achou nada? Relê as pastas uma vez (pode ter sido enviado depois da última atualização).
  useEffect(() => {
    if (nomes && fonte === 'google' && online && !procurou && naoAchados.length) {
      setProcurou(true);
      void procurarDeNovo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomes, naoAchados.length, procurou]);

  useEffect(() => {
    if (!atual) {
      setRes(null);
      return;
    }
    let url: string | null = null;
    let vivo = true;
    setRes(null);
    abrirArquivo(atual).then((r) => {
      if (!vivo) {
        if (r.ok) URL.revokeObjectURL(r.url);
        return;
      }
      if (r.ok) url = r.url;
      setRes(r);
    });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.id]);

  const local = atual ? atual.caminho.join(' › ') : '';

  return (
    <Folha aberta={!!nomes} onFechar={onFechar} titulo="Comprovante">
      <div className="comprovante">
        <h2>🎫 {arquivos.length > 1 ? `Comprovantes (${arquivos.length})` : 'Comprovante'}</h2>
        {arquivos.length > 1 && (
          <div className="abas-docs" role="tablist" aria-label="Documentos">
            {arquivos.map((a, k) => (
              <button key={a.id} type="button" role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => setI(k)}>
                {rotuloArquivo(a)}
              </button>
            ))}
          </div>
        )}
        {atual && (
          <p className="comprovante-nome">
            📁 {local ? `${local} › ` : ''}
            {atual.nome}
          </p>
        )}
        {fonte === 'demo' && (
          <div className="aviso-box">
            <Musubi pose="idle" size={64} />
            <p>No modo exemplo não há documentos. Entre com o Google para ver os reais.</p>
          </div>
        )}
        {fonte !== 'demo' && !arquivos.length && (
          <div className="aviso-box">
            <Musubi pose="idle" size={64} />
            <p>
              Documento não achado na pasta Viagem-Japao
              {arvore.length === 0 ? ' (toque em ⚙️ › Atualizar agora para ler as pastas)' : ''}.
            </p>
            <p className="comprovante-nome">Procurado: {naoAchados.join('; ')}</p>
          </div>
        )}
        {atual && !res && <p className="carregando">Abrindo…</p>}
        {res && !res.ok && (
          <div className="aviso-box">
            <Musubi pose="idle" size={64} />
            <p>{res.motivo}</p>
          </div>
        )}
        {res?.ok && (
          <>
            {res.mime.startsWith('image/') ? (
              <img src={res.url} alt={`Comprovante ${res.nome}`} className="comprovante-img" />
            ) : (
              <object data={res.url} type={res.mime} className="comprovante-pdf" aria-label={`Comprovante ${res.nome}`}>
                <p>Não deu para mostrar aqui.</p>
              </object>
            )}
            <a className="btn" href={res.url} target="_blank" rel="noreferrer" download={res.nome}>
              Abrir em tela cheia
            </a>
          </>
        )}
        {arquivos.length > 0 && naoAchados.length > 0 && (
          <p className="legenda">Não achado: {naoAchados.join('; ')}</p>
        )}
      </div>
    </Folha>
  );
}

/** Abertura de fase: "Mundo 1 · Fase 3" por 1,5 s. Um toque pula. */
export function StageIntro({ dia, onFim }: { dia: Dia | null; onFim(): void }) {
  useEffect(() => {
    if (!dia) return;
    const t = setTimeout(onFim, 1500);
    return () => clearTimeout(t);
  }, [dia, onFim]);
  return (
    <AnimatePresence>
      {dia && (
        <motion.button
          type="button"
          className={`intro mundo-${dia.mundo}`}
          onClick={onFim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-label="Pular abertura"
        >
          <motion.div initial={{ scale: 0.6, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 12 }}>
            <Musubi pose="jump" size={110} />
          </motion.div>
          <motion.p className="intro-kanji" lang="ja" initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
            {KANJI_MUNDO[dia.mundo]}
          </motion.p>
          <motion.p className="intro-fase" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
            {rotuloFase(dia)}
          </motion.p>
          <p className="intro-titulo">{dia.titulo}</p>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function StageClear({ estrelas, rotulo, onFechar }: { estrelas: number | null; rotulo: string; onFechar(): void }) {
  return (
    <AnimatePresence>
      {estrelas !== null && (
        <motion.div className="fase-ok-fundo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFechar}>
          <motion.div
            className="fase-ok cartao-toy"
            role="dialog"
            aria-modal="true"
            aria-label="Fase concluída"
            initial={{ scale: 0.5, rotate: -6 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 10 }}
          >
            <Musubi pose="jump" size={100} />
            <p className="fase-ok-titulo">Fase concluída!</p>
            <p>{rotulo}</p>
            <Estrelas n={estrelas} size={36} />
            <p className="fase-ok-bonus">Todos os itens importantes feitos: +{PONTOS_DIA_CRITICOS} moedas</p>
            <button type="button" className="btn btn-primario" onClick={onFechar}>Continuar</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
