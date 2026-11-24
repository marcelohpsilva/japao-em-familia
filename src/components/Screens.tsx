import { useEffect, useRef, useState } from 'react';
import type { Roteiro } from '../types';
import { useStore } from '../lib/store';
import { useUi, STATUS_PENDENTE, TEXTO_PAGAR, TEXTO_STATUS, ienes, ICONE_TIPO, linkTelefone } from '../lib/ui';
import { baixarIcs, itensComLembrete } from '../lib/ics';
import { referenciasDoRoteiro } from '../lib/comprovantes';
import { NOME_MUNDO, KANJI_MUNDO, NUMERO_MUNDO, resumoDoDia, totalMoedas, fusoDoItem, cartoesDoDia } from '../lib/game';
import { dateInTz, formatDia, TZ_JAPAO, zonedToEpoch } from '../lib/time';
import { haQuanto } from '../lib/hooks';
import { CLIENT_ID, prepararLogin } from '../lib/google';
import { Countdown } from './Countdown';
import { DayView } from './DayView';
import { Estrelas, Moeda, Musubi } from './Art';

// ---------- Em que momento da viagem estamos ----------

export type Etapa = { tipo: 'antes' } | { tipo: 'durante'; data: string } | { tipo: 'depois' };

export function etapaAtual(roteiro: Roteiro, agoraMs: number): Etapa {
  const v = roteiro.viagem;
  const dataCasa = dateInTz(agoraMs, v.embarque_fuso);
  if (dataCasa < v.embarque_data) return { tipo: 'antes' };
  const inicioJapao = zonedToEpoch(v.inicio_japao, '00:00', TZ_JAPAO);
  const data = agoraMs < inicioJapao ? dataCasa : dateInTz(agoraMs, TZ_JAPAO);
  if (data > v.fim_viagem && dataCasa > v.fim_viagem) return { tipo: 'depois' };
  return { tipo: 'durante', data: data > v.fim_viagem ? v.fim_viagem : data };
}

// ---------- Hoje ----------

export function Hoje({ roteiro, agoraMs, dataEscolhida, setDataEscolhida }: {
  roteiro: Roteiro;
  agoraMs: number;
  dataEscolhida: string | null;
  setDataEscolhida(d: string | null): void;
}) {
  const etapa = etapaAtual(roteiro, agoraMs);
  const dataHoje = etapa.tipo === 'durante' ? etapa.data : null;
  const data = dataEscolhida ?? dataHoje;

  if (data) {
    return (
      <>
        {dataEscolhida && dataEscolhida !== dataHoje && (
          <button type="button" className="voltar-hoje" onClick={() => setDataEscolhida(null)}>
            ← Voltar para {dataHoje ? 'hoje' : 'a contagem'}
          </button>
        )}
        {data === roteiro.viagem.embarque_data && !dataEscolhida && <Countdown roteiro={roteiro} agoraMs={agoraMs} />}
        <DayView roteiro={roteiro} data={data} agoraMs={agoraMs} ehHoje={data === dataHoje} onMudarDia={(d) => setDataEscolhida(d === dataHoje ? null : d)} />
      </>
    );
  }

  if (etapa.tipo === 'depois') return <FimDeJogo roteiro={roteiro} />;

  // Antes da viagem: contagem + prévia da Fase 1 + pendências.
  const primeiroJapao = roteiro.dias.find((d) => d.mundo !== 'voo') ?? roteiro.dias[0];
  const pend = roteiro.itens.filter((i) => STATUS_PENDENTE.has(i.status));
  return (
    <div className="antes">
      <Countdown roteiro={roteiro} agoraMs={agoraMs} />
      {primeiroJapao && (
        <button type="button" className={`previa cartao-toy mundo-${primeiroJapao.mundo}`} onClick={() => setDataEscolhida(primeiroJapao.data)}>
          <span className="previa-rotulo">Prévia da primeira fase</span>
          <span className="previa-titulo">
            <span lang="ja" className="kanji">{KANJI_MUNDO[primeiroJapao.mundo]}</span> {primeiroJapao.titulo}
          </span>
          <span className="previa-sub">{formatDia(primeiroJapao.data)} · {primeiroJapao.resumo}</span>
          <span className="previa-cta">Espiar o dia →</span>
        </button>
      )}
      <section className="cartao-toy bloco">
        <h2 className="secao-titulo">Ainda falta resolver ({pend.length})</h2>
        {pend.length === 0 ? (
          <p>Tudo resolvido! 🎉</p>
        ) : (
          <ul className="lista-simples">
            {pend.slice(0, 5).map((i) => (
              <li key={i.id}>
                <b>{formatDia(i.data)}</b> · {i.titulo} <span className="selo selo-pendente">{TEXTO_STATUS[i.status]}</span>
              </li>
            ))}
            {pend.length > 5 && <li>… e mais {pend.length - 5} na aba Pendências</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function FimDeJogo({ roteiro }: { roteiro: Roteiro }) {
  const { feitos } = useStore();
  const moedas = totalMoedas(roteiro, feitos);
  const fases = roteiro.dias.map((d) => resumoDoDia(roteiro, d, feitos));
  const estrelasTot = fases.reduce((s, f) => s + f.estrelas, 0);
  const vencidos = fases.filter((f) => f.estrelas > 0).length;
  return (
    <div className="fim cartao-toy">
      <Musubi pose="jump" size={120} />
      <h1>Fim de jogo!</h1>
      <p className="fim-sub">Zerou o Japão em família</p>
      <ul className="fim-numeros">
        <li><Moeda size={28} /> <b>{moedas}</b> moedas</li>
        <li>⭐ <b>{estrelasTot}</b> {estrelasTot === 1 ? 'estrela' : 'estrelas'}</li>
        <li>🗾 <b>{vencidos}</b> de {roteiro.dias.length} dias vencidos</li>
      </ul>
      <p className="legenda">Ver as conquistas completas chega na v2.</p>
    </div>
  );
}

// ---------- Agenda: os dias da viagem, do primeiro ao último ----------

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function Agenda({ roteiro, agoraMs, abrirDia }: { roteiro: Roteiro; agoraMs: number; abrirDia(d: string): void }) {
  const { feitos } = useStore();
  const etapa = etapaAtual(roteiro, agoraMs);
  const hoje = etapa.tipo === 'durante' ? etapa.data : null;
  const ref = useRef<HTMLDivElement>(null);
  // Durante a viagem, abre rolada no dia de hoje. Antes dela, começa do topo (primeiro dia).
  useEffect(() => {
    ref.current?.querySelector('.fase-hoje')?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <div className="mapa" ref={ref}>
      <h1 className="tela-titulo">Agenda</h1>
      <ol className="trilha">
        {roteiro.dias.map((d) => {
          const r = resumoDoDia(roteiro, d, feitos);
          const futuro = hoje ? d.data > hoje : etapa.tipo === 'antes';
          const bonus = d.tipo_dia === 'parque';
          return (
            <li key={d.data} className={`fase mundo-${d.mundo} ${d.data === hoje ? 'fase-hoje' : ''} ${futuro ? 'fase-futura' : ''}`}>
              <button type="button" onClick={() => abrirDia(d.data)}>
                <span className={`fase-bolinha ${bonus ? 'fase-bonus' : ''}`} aria-hidden="true">
                  <span className="fase-dia">{Number(d.data.slice(8, 10))}</span>
                  <span className="fase-mes">{MES_CURTO[Number(d.data.slice(5, 7)) - 1]}</span>
                  {bonus && <span className="fase-estrela">★</span>}
                </span>
                <span className="fase-texto">
                  <span className="fase-mundo">
                    {NUMERO_MUNDO[d.mundo] ? `Mundo ${NUMERO_MUNDO[d.mundo]} · ` : ''}
                    {NOME_MUNDO[d.mundo]} · {formatDia(d.data)}
                  </span>
                  <span className="fase-titulo">{futuro ? '🔒 ' : ''}{d.titulo}</span>
                </span>
                {!futuro && <Estrelas n={r.estrelas} size={14} />}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- Pendências ----------

export function Pendencias({ roteiro, agoraMs }: { roteiro: Roteiro; agoraMs: number }) {
  const ui = useUi();
  // Do começo ao fim da viagem: por dia e, dentro do dia, na mesma ordem da tela Hoje
  // (horário real no fuso de cada item; itens sem hora na posição da planilha).
  const posicao = new Map<string, number>();
  for (const d of roteiro.dias) {
    cartoesDoDia(roteiro, d.data).forEach((c, k) => c.itens.forEach((i) => posicao.set(i.id, k)));
  }
  const pend = roteiro.itens
    .filter((i) => STATUS_PENDENTE.has(i.status))
    .sort((a, b) => a.data.localeCompare(b.data) || (posicao.get(a.id) ?? 0) - (posicao.get(b.id) ?? 0));
  const porData = new Map<string, typeof pend>();
  for (const i of pend) porData.set(i.data, [...(porData.get(i.data) ?? []), i]);

  return (
    <div className="pendencias">
      <h1 className="tela-titulo">Pendências</h1>
      <BlocoLembretes roteiro={roteiro} />
      {pend.length === 0 && (
        <div className="vazio">
          <Musubi pose="jump" />
          <p>Nada pendente. Tudo pronto!</p>
        </div>
      )}
      {[...porData.entries()].map(([data, itens]) => {
        // Sem horário: conta até o fim do dia.
        const inicio = zonedToEpoch(data, itens[0].hora_inicio ?? '23:59', fusoDoItem(itens[0], roteiro));
        const horas = (inicio - agoraMs) / 3600000;
        const urgente = horas < 48;
        return (
          <section key={data} className="cartao-toy bloco">
            <h2 className="secao-titulo">
              {formatDia(data)} {urgente && <span className="selo selo-urgente">{horas < 0 ? 'atrasado' : 'menos de 48 h'}</span>}
            </h2>
            <ul className="lista-pend">
              {itens.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => ui.abrirItem(i)}>
                    <span className="pend-titulo">{ICONE_TIPO[i.tipo]} {i.titulo}</span>
                    <span className="selo selo-pendente">{TEXTO_STATUS[i.status]}</span>
                    <span className="pend-meta">
                      {[i.local, i.custo_previsto_jpy !== undefined ? ienes(i.custo_previsto_jpy) : '', i.como_pagar ? TEXTO_PAGAR[i.como_pagar] : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------- Ajustes ----------

export function Ajustes() {
  const s = useStore();
  const [baixando, setBaixando] = useState<string | null>(null);
  // Cada nome da coluna "comprovante" → documentos achados nas pastas de Viagem-Japao.
  const relacao = referenciasDoRoteiro(s.roteiro?.itens ?? []).map((ref) => ({ ref, ...s.resolver(ref) }));
  const arquivos = [...new Map(relacao.flatMap((r) => r.arquivos).map((a) => [a.id, a])).values()];
  const tamanho = arquivos.reduce((t, a) => t + Number(a.size ?? 0), 0);
  const jaBaixados = arquivos.filter((a) => s.baixados.has(a.id)).length;
  const faltando = relacao.filter((r) => !r.arquivos.length).length;

  return (
    <div className="ajustes">
      <h1 className="tela-titulo">Ajustes</h1>
      <section className="cartao-toy bloco">
        <h2 className="secao-titulo">Conta</h2>
        {s.fonte === 'demo' ? (
          <>
            <p>Modo exemplo (dados fictícios).</p>
            {CLIENT_ID && <button type="button" className="btn btn-primario" onClick={s.entrarGoogle}>Entrar com Google</button>}
          </>
        ) : (
          <>
          <div className="conta">
            {s.usuario?.foto && <img src={s.usuario.foto} alt="" width={40} height={40} referrerPolicy="no-referrer" />}
            <div>
              <b>{s.usuario?.nome}</b>
              <br />
              <small>{s.usuario?.email}</small>
            </div>
          </div>
          <p className="legenda" style={{ textAlign: 'left' }}>
            Você continua conectado neste aparelho até tocar em "Sair". O Google renova o acesso a cada hora;
            o app faz isso sozinho no próximo toque, sem pedir senha.
          </p>
          </>
        )}
      </section>

      {s.fonte === 'google' && (
        <section className="cartao-toy bloco">
          <h2 className="secao-titulo">Dados</h2>
          <p>Última atualização: {haQuanto(s.atualizadoEm)}</p>
          <button type="button" className="btn" disabled={!s.online || s.sync === 'carregando'} onClick={() => s.atualizar(true)}>
            {s.sync === 'carregando' ? 'Atualizando…' : '🔄 Atualizar agora'}
          </button>
          <p>
            Documentos no aparelho: {jaBaixados} de {arquivos.length}
            {tamanho > 0 && ` (${(tamanho / 1048576).toFixed(1)} MB no total)`}
          </p>
          <button
            type="button"
            className="btn"
            disabled={!s.online || !!baixando}
            onClick={async () => {
              try {
                await s.baixarTudo((n, t) => setBaixando(`${n} de ${t}`));
                setBaixando(null);
              } catch (e) {
                setBaixando(null);
                alert(e instanceof Error ? e.message : 'Erro ao baixar');
              }
            }}
          >
            {baixando ? `Baixando ${baixando}…` : '⬇️ Baixar tudo para offline'}
          </button>
        </section>
      )}

      {s.fonte === 'google' && relacao.length > 0 && (
        <section className="cartao-toy bloco">
          <h2 className="secao-titulo">Comprovantes da planilha</h2>
          <p>
            {relacao.length - faltando} de {relacao.length} achados nas pastas de Viagem-Japao
            {faltando > 0 ? ` · ${faltando} não achado${faltando > 1 ? 's' : ''}` : ' 🎉'}
          </p>
          <details>
            <summary>Ver onde cada um foi achado</summary>
            <ul className="lista-docs">
              {relacao.map((r) => (
                <li key={r.ref}>
                  <span aria-hidden="true">{r.arquivos.length ? '✅' : '❌'}</span>
                  <span>
                    <span className="doc-ref">{r.ref}</span>
                    <br />
                    <span className={r.arquivos.length ? 'doc-local' : 'doc-local doc-falta'}>
                      {r.arquivos.length
                        ? `${r.local}${r.arquivos.length > 1 ? ` (${r.arquivos.length} arquivos)` : ''}`
                        : 'não achado: suba o arquivo em qualquer pasta de Viagem-Japao ou ponha na planilha o nome exato do arquivo ou da pasta'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <section className="cartao-toy bloco">
        <h2 className="secao-titulo">Preferências</h2>
        <label className="chave">
          <input type="checkbox" checked={s.ajustes.som} onChange={(e) => s.setAjuste('som', e.target.checked)} />
          <span>Som</span>
        </label>
        <label className="chave">
          <input type="checkbox" checked={s.ajustes.animReduzidas} onChange={(e) => s.setAjuste('animReduzidas', e.target.checked)} />
          <span>Animações reduzidas</span>
        </label>
      </section>

      <section className="cartao-toy bloco">
        <button
          type="button"
          className="btn btn-perigo"
          onClick={() => {
            if (confirm('Sair e apagar todos os dados deste aparelho (roteiro, comprovantes, moedas)?')) void s.sairEApagar();
          }}
        >
          Sair e apagar dados deste aparelho
        </button>
      </section>
    </div>
  );
}

// ---------- Entrada ----------

export function Entrada() {
  const s = useStore();
  useEffect(() => prepararLogin(), []);
  return (
    <div className="entrada">
      <Musubi pose="jump" size={140} className="pula" />
      <h1>Japão em Família</h1>
      <p lang="ja" className="kanji-grande">日本</p>
      <p>Guia de bolso da viagem. Entre com a sua conta Google para ver o roteiro.</p>
      {CLIENT_ID ? (
        <button type="button" className="btn btn-primario btn-grande" onClick={s.entrarGoogle} disabled={s.sync === 'carregando'}>
          {s.sync === 'carregando' ? 'Entrando…' : 'Entrar com Google'}
        </button>
      ) : (
        <p className="aviso-box">Login Google ainda não configurado (falta o Client ID).</p>
      )}
      {s.sync === 'sem_acesso' && <p className="aviso-box">Sem acesso ao roteiro. Peça para quem organizou a viagem compartilhar a pasta Viagem-Japao com a sua conta.</p>}
      {s.sync === 'erro' && <p className="aviso-box">{s.erro}</p>}
      <button type="button" className="btn" onClick={s.usarExemplo}>Ver com dados de exemplo</button>
    </div>
  );
}

export function SemAcesso() {
  const s = useStore();
  return (
    <div className="entrada">
      <Musubi pose="sleep" size={120} />
      <h1>Sem acesso ao roteiro</h1>
      <p>Esta conta não consegue abrir a pasta Viagem-Japao. Peça para quem organizou a viagem compartilhar com você e tente de novo.</p>
      <button type="button" className="btn btn-primario" onClick={() => s.atualizar(true)}>Tentar de novo</button>
      <button type="button" className="btn" onClick={s.sairEApagar}>Sair</button>
    </div>
  );
}

// ---------- Lembretes no celular ----------

function BlocoLembretes({ roteiro }: { roteiro: Roteiro }) {
  const n = itensComLembrete(roteiro).length;
  if (!n) return null;
  return (
    <section className="cartao-toy bloco">
      <h2 className="secao-titulo">⏰ Lembretes no celular</h2>
      <p>
        Baixa um arquivo com os {n} itens importantes, cada um com alarme antes da hora. Abra o arquivo e toque em
        "Adicionar todos". O alarme toca mesmo sem internet e com o app fechado.
      </p>
      <button type="button" className="btn" onClick={() => baixarIcs(roteiro)}>
        Adicionar lembretes ao celular
      </button>
      <p className="legenda">Se o roteiro mudar, baixe de novo: os eventos são atualizados, não duplicados.</p>
    </section>
  );
}

// ---------- Contatos ----------

const ICONE_CONTATO: Record<string, string> = { hotel: '🏨', emergencia: '🚨', transporte: '✈️', servico: '🧳' };
const ORDEM_CONTATO = ['emergencia', 'hotel', 'transporte', 'servico'];

export function Contatos({ roteiro }: { roteiro: Roteiro }) {
  const ui = useUi();
  const lista = [...roteiro.contatos].sort(
    (a, b) => (ORDEM_CONTATO.indexOf(a.tipo) + 9) % 9 - (ORDEM_CONTATO.indexOf(b.tipo) + 9) % 9,
  );
  return (
    <div className="contatos">
      <h1 className="tela-titulo">Contatos</h1>
      {lista.length === 0 && (
        <div className="vazio">
          <Musubi pose="idle" />
          <p>Nenhum contato na planilha ainda.</p>
        </div>
      )}
      <ul className="lista-contatos">
        {lista.map((c, i) => {
          const tel = linkTelefone(c.telefone);
          return (
            <li key={`${c.nome}-${i}`} className={`cartao-toy contato contato-${c.tipo}`}>
              <p className="contato-nome">
                <span aria-hidden="true">{ICONE_CONTATO[c.tipo] ?? '📌'}</span> {c.nome}
              </p>
              {c.notas && <p className="contato-notas">{c.notas}</p>}
              <div className="item-botoes contato-botoes">
                {tel && (
                  <a className="btn-mini btn-ligar" href={tel}>
                    📞 {c.telefone}
                  </a>
                )}
                {c.link_maps && (
                  <a className="btn-mini" href={c.link_maps} target="_blank" rel="noreferrer">📍 Maps</a>
                )}
                {c.endereco_jp && (
                  <button type="button" className="btn-mini" onClick={() => ui.abrirTaxi({ titulo: c.nome, endereco_jp: c.endereco_jp })}>
                    🚕 Mostrar ao taxista
                  </button>
                )}
              </div>
              {!tel && c.tipo !== 'hotel' && <p className="legenda contato-sem-tel">Telefone ainda não confirmado</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
