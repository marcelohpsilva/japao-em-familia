// As 9 conquistas do escopo (seção 5.3). Ficam só no aparelho.
import type { Dia, Roteiro } from '../types';
import { cartoesDoDia, fusoDoItem, resumoDoDia } from './game';
import { hourInTz } from './time';

export interface Conquista {
  id: string;
  nome: string;
  como: string;
  icone: string;
}

export const CONQUISTAS: Conquista[] = [
  { id: 'decolagem', nome: 'Decolagem', como: 'Abrir o app no dia do embarque', icone: '✈️' },
  { id: 'primeiros-passos', nome: 'Primeiros passos em Osaka', como: 'Concluir a primeira fase de Osaka', icone: '👣' },
  { id: 'cacador-parques', nome: 'Caçador de parques', como: 'Concluir todos os dias de parque', icone: '🎡' },
  { id: 'mestre-trilhos', nome: 'Mestre dos trilhos', como: 'Marcar 15 deslocamentos de trem ou ônibus', icone: '🚄' },
  { id: 'madrugador', nome: 'Madrugador', como: 'Marcar um item feito antes das 8h', icone: '🌅' },
  { id: 'nada-esquecido', nome: 'Nada esquecido', como: 'Todos os itens importantes de um mundo feitos', icone: '✅' },
  { id: 'ano-novo', nome: 'Ano-Novo no Japão', como: 'Abrir o app em 01/01', icone: '🎆' },
  { id: 'rei-fuji', nome: 'Rei do Fuji', como: 'Concluir o Mundo 2 (Fuji)', icone: '🗻' },
  { id: 'zerou', nome: 'Zerou o Japão', como: 'Concluir todas as fases', icone: '🏆' },
];

/** Uma fase está concluída quando todos os itens importantes foram feitos
 *  (ou, num dia sem itens importantes, quando metade dos itens foi feita). */
export function faseConcluida(roteiro: Roteiro, dia: Dia, feitos: Record<string, number>): boolean {
  const r = resumoDoDia(roteiro, dia, feitos);
  if (r.total === 0) return false;
  return r.criticos > 0 ? r.criticosOk : r.estrelas >= 1;
}

export function conquistasGanhas(roteiro: Roteiro, feitos: Record<string, number>, aberturas: string[]): string[] {
  const v = roteiro.viagem;
  const ganhas: string[] = [];
  const dias = roteiro.dias;
  const ok = (d: Dia) => faseConcluida(roteiro, d, feitos);
  const comItens = dias.filter((d) => cartoesDoDia(roteiro, d.data).length > 0);

  if (aberturas.includes(`casa:${v.embarque_data}`)) ganhas.push('decolagem');

  const primeiroOsaka = dias.find((d) => d.mundo === 'osaka');
  if (primeiroOsaka && ok(primeiroOsaka)) ganhas.push('primeiros-passos');

  const parques = dias.filter((d) => d.tipo_dia === 'parque');
  if (parques.length && parques.every(ok)) ganhas.push('cacador-parques');

  let transportes = 0;
  let cedo = false;
  for (const d of dias) {
    for (const c of cartoesDoDia(roteiro, d.data)) {
      const quando = feitos[c.chave];
      if (!quando) continue;
      if (c.principal.tipo === 'transporte') transportes++;
      if (hourInTz(quando, fusoDoItem(c.principal, roteiro)) < 8) cedo = true;
    }
  }
  if (transportes >= 15) ganhas.push('mestre-trilhos');
  if (cedo) ganhas.push('madrugador');

  for (const mundo of ['osaka', 'fuji', 'toquio']) {
    const criticos = dias.filter((d) => d.mundo === mundo).flatMap((d) => cartoesDoDia(roteiro, d.data).filter((c) => c.critico));
    if (criticos.length && criticos.every((c) => feitos[c.chave])) {
      ganhas.push('nada-esquecido');
      break;
    }
  }

  if (aberturas.some((a) => a.endsWith('-01-01'))) ganhas.push('ano-novo');

  const fuji = dias.filter((d) => d.mundo === 'fuji' && cartoesDoDia(roteiro, d.data).length > 0);
  if (fuji.length && fuji.every(ok)) ganhas.push('rei-fuji');

  if (comItens.length && comItens.every(ok)) ganhas.push('zerou');
  return ganhas;
}
