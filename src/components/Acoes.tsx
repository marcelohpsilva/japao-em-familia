// Bloco "Ações Japão" (da Financas 2.0): aparece só para quem abre essa planilha.
import { useState } from 'react';
import { useStore } from '../lib/store';
import { useUi } from '../lib/ui';
import { daysBetween } from '../lib/time';
import type { Acao } from '../lib/financas';
import { Folha } from './Overlays';
import { vibrar } from '../lib/fx';

export function situacao(a: Acao, hoje: string): { texto: string; classe: string } | null {
  if (!a.prazoData) return null;
  const d = daysBetween(hoje, a.prazoData);
  if (d < 0) return { texto: 'atrasada', classe: 'selo-urgente' };
  if (d === 0) return { texto: 'vence hoje', classe: 'selo-urgente' };
  if (d <= 2) return { texto: d === 1 ? 'vence amanhã' : 'vence em 2 dias', classe: 'selo-critico' };
  return null;
}

export function BlocoAcoes({ hoje, onAbrir }: { hoje: string; onAbrir(a: Acao): void }) {
  const { financas } = useStore();
  if (!financas) return null;
  const acoes = financas.acoes;
  const atrasadas = acoes.filter((a) => a.prazoData && a.prazoData < hoje).length;
  return (
    <section className="cartao-toy bloco bloco-acoes">
      <h2 className="secao-titulo">
        Ações Japão ({acoes.length}){atrasadas > 0 && <span className="selo selo-urgente"> {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</span>}
      </h2>
      <p className="legenda" style={{ textAlign: 'left', margin: '0 0 8px' }}>Da planilha Financas 2.0 · só você vê</p>
      {acoes.length === 0 ? (
        <p>Nenhuma ação pendente. 🎉</p>
      ) : (
        <ul className="lista-pend">
          {acoes.map((a) => {
            const sit = situacao(a, hoje);
            return (
              <li key={a.numero}>
                <button type="button" onClick={() => onAbrir(a)}>
                  <span className="pend-titulo">#{a.numero} · {a.acao}</span>
                  <span className="pend-meta">
                    {[a.prazo && `prazo ${a.prazo}`, a.area, a.tempoMin ? `${a.tempoMin} min` : ''].filter(Boolean).join(' · ')}
                  </span>
                  <span>
                    <span className="selo selo-pendente">{a.status}</span>
                    {sit && <span className={`selo ${sit.classe}`} style={{ marginLeft: 6 }}>{sit.texto}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function AcaoSheet({ acao, hoje, onFechar }: { acao: Acao | null; hoje: string; onFechar(): void }) {
  const { concluirAcao, online, financas } = useStore();
  const ui = useUi();
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fechar = () => {
    setConfirmando(false);
    setErro(null);
    onFechar();
  };
  const sit = acao ? situacao(acao, hoje) : null;
  const cambio = financas?.cambio;

  return (
    <Folha aberta={!!acao} onFechar={fechar} titulo={acao?.acao ?? ''}>
      {acao && (
        <div className="detalhe">
          <p className="detalhe-tipo">Ação #{acao.numero}{acao.area ? ` · ${acao.area}` : ''}</p>
          <h2>{acao.acao}</h2>
          <p>
            <span className="selo selo-pendente">{acao.status}</span>
            {sit && <span className={`selo ${sit.classe}`} style={{ marginLeft: 6 }}>{sit.texto}</span>}
          </p>
          <dl className="detalhe-lista">
            {acao.prazo && (<><dt>Prazo final</dt><dd>{acao.prazo}</dd></>)}
            {acao.noite && (<><dt>Noite planejada</dt><dd>{acao.noite}</dd></>)}
            {acao.tempoMin !== undefined && (<><dt>Tempo</dt><dd>{acao.tempoMin} min</dd></>)}
            {acao.custoCad !== undefined && acao.custoCad > 0 && (
              <><dt>Custo previsto</dt><dd>CAD {acao.custoCad.toLocaleString('pt-BR')}{cambio ? ` · ¥ ${Math.round(acao.custoCad * cambio).toLocaleString('pt-BR')}` : ''}</dd></>
            )}
            {acao.natureza && (<><dt>Natureza ao pagar</dt><dd>{acao.natureza}</dd></>)}
            {acao.comoFazer && (<><dt>Como fazer</dt><dd>{acao.comoFazer}</dd></>)}
          </dl>
          <section className="pendencia-box">
            {!confirmando ? (
              <>
                <p className="pendencia-pergunta" style={{ marginTop: 0 }}>Já fez?</p>
                <button type="button" className="btn btn-primario" disabled={!online} onClick={() => setConfirmando(true)}>
                  ✓ Marcar como Feito
                </button>
                {!online && <p className="legenda">Sem internet: conclua quando tiver sinal.</p>}
              </>
            ) : (
              <>
                <p style={{ marginTop: 0 }}>Gravar <b>Feito</b> no Status da ação #{acao.numero} na Financas 2.0?</p>
                <button
                  type="button"
                  className="btn btn-primario"
                  disabled={gravando}
                  onClick={() => {
                    setGravando(true);
                    setErro(null);
                    concluirAcao(acao.numero).then((r) => {
                      setGravando(false);
                      if (r.ok) {
                        vibrar(60);
                        ui.aviso('✓ Ação concluída. Financas 2.0 atualizada!');
                        fechar();
                      } else setErro(r.motivo);
                    });
                  }}
                >
                  {gravando ? 'Gravando…' : '✓ Sim, concluir'}
                </button>
                <button type="button" className="btn" disabled={gravando} onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            )}
            {erro && <p className="aviso-box">{erro}</p>}
          </section>
        </div>
      )}
    </Folha>
  );
}
