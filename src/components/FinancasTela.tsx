import { useState } from 'react';
import type { Roteiro } from '../types';
import { useStore } from '../lib/store';
import { gastoPorDia, semaforo, type Financas } from '../lib/financas';
import { addDays, daysBetween, formatDia } from '../lib/time';
import { haQuanto } from '../lib/hooks';

const cad = (n: number) => `CAD ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const iene = (n: number, cambio?: number) => (cambio ? `¥ ${Math.round(n * cambio).toLocaleString('pt-BR')}` : '');

function dataHora(ms: number) {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

const TEXTO_SEMAFORO = { verde: '● Dentro do orçamento', amarelo: '▲ Perto do limite (90% ou mais)', vermelho: '⚠ Passou do orçamento' };

/** Barras horizontais: trilho = orçado, preenchimento = realizado. Passou do limite → vermelho + ⚠. */
function Barras({ fin }: { fin: Financas }) {
  const cats = fin.categorias.filter((c) => c.orcado > 0 || c.realizado > 0);
  const max = Math.max(1, ...cats.map((c) => Math.max(c.orcado, c.realizado)));
  return (
    <ul className="barras" aria-label="Orçado e realizado por categoria">
      {cats.map((c) => {
        const pct = c.orcado ? Math.round((c.realizado / c.orcado) * 100) : null;
        const estourou = c.orcado > 0 && c.realizado > c.orcado;
        return (
          <li key={c.categoria} title={`${c.categoria}: ${cad(c.realizado)} de ${cad(c.orcado)}`}>
            <div className="barra-rotulo">
              <span>{c.categoria}</span>
              <span className={estourou ? 'barra-valor estourou' : 'barra-valor'}>
                {estourou && '⚠ '}
                {cad(c.realizado)} / {c.orcado ? cad(c.orcado) : 'sem orçamento'}
                {pct !== null && ` · ${pct}%`}
              </span>
            </div>
            <div className="barra-trilho" style={{ width: `${(Math.max(c.orcado, c.realizado) / max) * 100}%` }}>
              <div
                className={`barra-feito ${estourou ? 'estourou' : ''}`}
                style={{ width: `${(Math.min(c.realizado, Math.max(c.orcado, c.realizado)) / Math.max(c.orcado, c.realizado, 1)) * 100}%` }}
              />
              {estourou && <div className="barra-limite" style={{ left: `${(c.orcado / c.realizado) * 100}%` }} aria-hidden="true" />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Gasto acumulado por dia × ritmo previsto (disponível no início ÷ dias da viagem). */
function GastoDiario({ fin, roteiro, hoje }: { fin: Financas; roteiro: Roteiro; hoje: string }) {
  const inicio = roteiro.viagem.inicio_japao;
  const fim = roteiro.viagem.fim_viagem;
  const nDias = daysBetween(inicio, fim) + 1;
  const porDia = gastoPorDia(fin.lancamentos, inicio, fim);
  const gastoNaViagem = [...porDia.values()].reduce((a, b) => a + b, 0);
  const disponivelInicio = fin.saldo + gastoNaViagem;
  const ritmo = disponivelInicio / nDias;
  const ateHoje = Math.min(nDias, daysBetween(inicio, hoje) + 1);
  const pontos: { data: string; acum: number }[] = [];
  let acum = 0;
  for (let i = 0; i < ateHoje; i++) {
    const d = addDays(inicio, i);
    acum += porDia.get(d) ?? 0;
    pontos.push({ data: d, acum });
  }
  const gastoHoje = porDia.get(hoje) ?? 0;
  const diasRestantes = Math.max(1, nDias - ateHoje + 1);
  const podeHoje = (fin.saldo + gastoHoje) / diasRestantes - gastoHoje;
  const [sel, setSel] = useState<number | null>(null);

  const W = 320;
  const H = 150;
  const P = { l: 8, r: 8, t: 10, b: 22 };
  const maxY = Math.max(disponivelInicio, acum, 1);
  const x = (i: number) => P.l + (i / Math.max(1, nDias - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - (v / maxY) * (H - P.t - P.b);
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.acum).toFixed(1)}`).join(' ');
  const p = sel !== null ? pontos[sel] : pontos[pontos.length - 1];
  const previsto = (i: number) => ritmo * (i + 1);

  return (
    <section className="cartao-toy bloco">
      <h2 className="secao-titulo">Gasto na viagem</h2>
      <div className="stat-linha">
        <div>
          <p className="stat-rotulo">Pode gastar hoje</p>
          <p className="stat-valor">{iene(Math.max(0, podeHoje), fin.cambio) || cad(Math.max(0, podeHoje))}</p>
          <p className="stat-sub">{fin.cambio ? cad(Math.max(0, podeHoje)) : ''}</p>
        </div>
        <div>
          <p className="stat-rotulo">Ritmo previsto</p>
          <p className="stat-valor">{cad(ritmo)}<small>/dia</small></p>
        </div>
      </div>
      {pontos.length > 0 && (
        <>
          <p className="grafico-leitura" aria-live="polite">
            {formatDia(p.data)}: acumulado {cad(p.acum)} · previsto {cad(previsto(sel ?? pontos.length - 1))}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Gasto acumulado por dia comparado ao ritmo previsto">
            <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className="eixo" />
            <line x1={x(0)} y1={y(ritmo)} x2={x(nDias - 1)} y2={y(disponivelInicio)} className="linha-ritmo" />
            <path d={linha} className="linha-gasto" />
            {pontos.map((pt, i) => (
              <g key={pt.data}>
                <circle cx={x(i)} cy={y(pt.acum)} r={sel === i ? 6 : 4} className="ponto-gasto" />
                <rect
                  x={x(i) - 10}
                  y={P.t}
                  width={20}
                  height={H - P.t - P.b}
                  fill="transparent"
                  onPointerEnter={() => setSel(i)}
                  onClick={() => setSel(i)}
                >
                  <title>{`${formatDia(pt.data)}: ${cad(pt.acum)}`}</title>
                </rect>
              </g>
            ))}
            <text x={P.l} y={H - 6} className="eixo-texto">{formatDia(inicio)}</text>
            <text x={W - P.r} y={H - 6} className="eixo-texto" textAnchor="end">{formatDia(fim)}</text>
          </svg>
          <p className="legenda-grafico">
            <span className="leg leg-gasto" /> Gasto acumulado <span className="leg leg-ritmo" /> Ritmo previsto
          </p>
        </>
      )}
    </section>
  );
}

export function FinancasTela({ roteiro, hoje, durante }: { roteiro: Roteiro; hoje: string; durante: boolean }) {
  const { financas: fin, online } = useStore();
  if (!fin) return null;
  const sem = semaforo(fin.gasto, fin.orcado);
  const pct = fin.orcado ? Math.round((fin.gasto / fin.orcado) * 100) : 0;
  const aPagar = fin.aPagar.reduce((t, a) => t + a.valorCad, 0);

  return (
    <div className="financas">
      <h1 className="tela-titulo">Finanças</h1>
      <p className="legenda" style={{ textAlign: 'left', margin: '-8px 4px 12px' }}>
        {online ? `Lido da Financas 2.0 ${haQuanto(fin.lidoEm)}` : `Sem internet: dados de ${dataHora(fin.lidoEm)}`}
        {fin.cambio ? ` · câmbio ¥ ${fin.cambio.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} por CAD` : ''}
      </p>

      <section className={`cartao-toy bloco semaforo semaforo-${sem}`}>
        <div className="numeros">
          {[
            ['Orçado', fin.orcado],
            ['Gasto', fin.gasto],
            ['Disponível', fin.saldo],
          ].map(([rotulo, v]) => (
            <div key={rotulo as string}>
              <p className="stat-rotulo">{rotulo} (CAD)</p>
              <p className="stat-valor">{(v as number).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
              <p className="stat-sub">{iene(v as number, fin.cambio)}</p>
            </div>
          ))}
        </div>
        <p className="semaforo-texto">
          {TEXTO_SEMAFORO[sem]} · {pct}% usado
        </p>
      </section>

      {durante ? (
        <GastoDiario fin={fin} roteiro={roteiro} hoje={hoje} />
      ) : (
        <p className="legenda">O gráfico de gasto por dia e o "pode gastar hoje" aparecem a partir de {formatDia(roteiro.viagem.inicio_japao)}.</p>
      )}

      <section className="cartao-toy bloco">
        <h2 className="secao-titulo">Por categoria</h2>
        <Barras fin={fin} />
      </section>

      {fin.aPagar.length > 0 && (
        <section className="cartao-toy bloco">
          <h2 className="secao-titulo">Ainda vai sair dinheiro · {cad(aPagar)}</h2>
          <ul className="lista-pagar">
            {fin.aPagar.map((a) => (
              <li key={a.item}>
                <span className="pagar-item">
                  {a.item} <span className="selo selo-pendente">{a.status}</span>
                </span>
                <span className="pagar-valor">
                  {a.valorCad ? cad(a.valorCad) : 'sem valor'}
                  {a.valorCad && fin.cambio ? <small>{iene(a.valorCad, fin.cambio)}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
