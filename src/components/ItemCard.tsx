import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { Cartao } from '../lib/game';
import { pontosDoCartao } from '../lib/game';
import { ICONE_TIPO, STATUS_PENDENTE, TEXTO_PAGAR, TEXTO_STATUS, ienes, useUi } from '../lib/ui';
import { formatDuracao } from '../lib/time';
import type { Item } from '../types';

export type Momento = 'passado' | 'agora' | 'proximo' | 'futuro' | 'livre';

interface Props {
  cartao: Cartao;
  feito: boolean;
  momento: Momento;
  minutosParaComecar?: number;
  onMarcar(feito: boolean, x: number, y: number): void;
}

function Hora({ item }: { item: Item }) {
  if (!item.hora_inicio) return <span className="hora hora-livre">a qualquer hora</span>;
  return (
    <span className="hora">
      {item.hora_inicio}
      {item.hora_fim && <small>{item.hora_fim}</small>}
    </span>
  );
}

function Botoes({ item }: { item: Item }) {
  const ui = useUi();
  return (
    <div className="item-botoes">
      {item.comprovante && (
        <button type="button" className="btn-mini" onClick={(e) => { e.stopPropagation(); ui.abrirComprovante(item.comprovante!); }}>
          🎫 Comprovante
        </button>
      )}
      {item.link_maps && (
        <a className="btn-mini" href={item.link_maps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          📍 Maps
        </a>
      )}
      {item.endereco_jp && (
        <button type="button" className="btn-mini" onClick={(e) => { e.stopPropagation(); ui.abrirTaxi(item); }}>
          🚕 Mostrar ao taxista
        </button>
      )}
    </div>
  );
}

function Corpo({ item }: { item: Item }) {
  return (
    <>
      {item.tipo === 'transporte' && (item.linha || item.de) ? (
        <div className="transporte">
          {item.linha && <span className="linha">{item.linha}</span>}
          {(item.de || item.para) && (
            <span className="trajeto">
              {item.de} <b aria-label="para">→</b> {item.para}
            </span>
          )}
          <span className="meta">
            {item.duracao_min ? `${formatDuracao(item.duracao_min)}` : ''}
            {item.duracao_min && item.como_pagar ? ' · ' : ''}
            {item.como_pagar ? TEXTO_PAGAR[item.como_pagar] : ''}
          </span>
        </div>
      ) : (
        (item.local || item.descricao) && <p className="item-sub">{item.local ?? item.descricao}</p>
      )}
    </>
  );
}

export function ItemCard({ cartao, feito, momento, minutosParaComecar, onMarcar }: Props) {
  const ui = useUi();
  const item = cartao.principal;
  const grupo = cartao.itens.length > 1;
  const x = useMotionValue(0);
  const fundo = useTransform(x, [0, 120], ['rgba(255,199,44,0)', 'rgba(255,199,44,.9)']);

  const fimArraste = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 90 && !feito) onMarcar(true, info.point.x, info.point.y);
  };

  const pendente = cartao.itens.some((i) => STATUS_PENDENTE.has(i.status));
  const classes = ['item', `item-${momento}`, feito ? 'item-feito' : '', cartao.critico ? 'item-critico' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div className="item-wrap" style={{ background: fundo }} layout>
      <motion.article
        className={classes}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        dragSnapToOrigin
        style={{ x }}
        onDragEnd={fimArraste}
        animate={feito ? { scale: [1, 1.04, 1] } : {}}
        transition={{ duration: 0.3 }}
      >
        {momento === 'agora' && <span className="selo-agora">AGORA</span>}
        {momento === 'proximo' && minutosParaComecar !== undefined && (
          <span className="selo-proximo">
            Próximo em {minutosParaComecar < 60 ? `${minutosParaComecar} min` : formatDuracao(minutosParaComecar)}
          </span>
        )}
        <div className="item-linha">
          <Hora item={item} />
          <button
            type="button"
            className="item-conteudo"
            onClick={() => (grupo ? undefined : ui.abrirItem(item))}
            tabIndex={grupo ? -1 : 0}
          >
            <span className="item-titulo">
              <span className="item-icone" aria-hidden="true">{ICONE_TIPO[item.tipo] ?? '⭐'}</span>
              {grupo ? 'Escolha uma opção' : item.titulo}
            </span>
            {!grupo && <Corpo item={item} />}
            <span className="selos">
              {cartao.critico && <span className="selo selo-critico">⚠️ Importante</span>}
              {pendente && <span className="selo selo-pendente">{TEXTO_STATUS[item.status]}</span>}
              {!grupo && item.custo_previsto_jpy !== undefined && <span className="selo">{ienes(item.custo_previsto_jpy)}</span>}
            </span>
          </button>
          <button
            type="button"
            className={`check ${feito ? 'check-on' : ''}`}
            aria-pressed={feito}
            aria-label={feito ? `Desmarcar ${item.titulo}` : `Marcar como feito: ${item.titulo} (+${pontosDoCartao(cartao)} moedas)`}
            onClick={(e) => onMarcar(!feito, e.clientX, e.clientY)}
          >
            <span aria-hidden="true">{feito ? '✓' : ''}</span>
          </button>
        </div>
        {grupo && (
          <ul className="opcoes">
            {cartao.itens.map((op) => (
              <li key={op.id}>
                <button type="button" className="opcao" onClick={() => ui.abrirItem(op)}>
                  <span>{op.titulo}</span>
                  {op.custo_previsto_jpy !== undefined && <small>{ienes(op.custo_previsto_jpy)}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!grupo && <Botoes item={item} />}
      </motion.article>
    </motion.div>
  );
}
