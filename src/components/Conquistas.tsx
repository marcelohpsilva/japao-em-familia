import { CONQUISTAS } from '../lib/conquistas';
import { useStore } from '../lib/store';

/** Medalhas: coloridas quando ganhas, apagadas (com o "como ganhar") quando não. */
export function PainelConquistas({ titulo = true }: { titulo?: boolean }) {
  const { conquistas } = useStore();
  const n = CONQUISTAS.filter((c) => conquistas[c.id]).length;
  return (
    <section className="cartao-toy bloco">
      {titulo && <h2 className="secao-titulo">🏅 Conquistas ({n}/{CONQUISTAS.length})</h2>}
      <ul className="medalhas">
        {CONQUISTAS.map((c) => {
          const ganha = !!conquistas[c.id];
          return (
            <li key={c.id} className={ganha ? 'medalha ganha' : 'medalha'}>
              <span className="medalha-icone" aria-hidden="true">{ganha ? c.icone : '🔒'}</span>
              <span className="medalha-nome">{c.nome}</span>
              <span className="medalha-como">{ganha ? 'Conquistada!' : c.como}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
