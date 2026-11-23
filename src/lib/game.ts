// Pontos, estrelas e agrupamento dos itens do dia em "cartões".
import type { Dia, Item, Roteiro } from '../types';
import { TZ_JAPAO, zonedToEpoch } from './time';

export const PONTOS_ITEM = 10;
export const PONTOS_CRITICO = 20;
export const PONTOS_DIA_CRITICOS = 50;

/** Um cartão na linha do tempo: um item, ou um grupo "escolha uma opção". */
export interface Cartao {
  chave: string;
  itens: Item[];
  principal: Item;
  critico: boolean;
  inicio?: number;
  fim?: number;
}

export function fusoDoItem(item: Item, roteiro: Roteiro): string {
  if (item.fuso) return item.fuso;
  // Vazio = Asia/Tokyo, exceto antes do Japão, quando o padrão é o fuso do embarque.
  if (item.data < roteiro.viagem.inicio_japao) return roteiro.viagem.embarque_fuso;
  return TZ_JAPAO;
}

export function cartoesDoDia(roteiro: Roteiro, data: string): Cartao[] {
  const doDia = roteiro.itens.filter((i) => i.data === data);
  const grupos = new Map<string, Item[]>();
  const cartoes: Cartao[] = [];
  for (const it of doDia) {
    if (it.grupo_opcoes) {
      const g = grupos.get(it.grupo_opcoes);
      if (g) {
        g.push(it);
        continue;
      }
      const arr = [it];
      grupos.set(it.grupo_opcoes, arr);
      cartoes.push({ chave: `g:${it.grupo_opcoes}`, itens: arr, principal: it, critico: false });
    } else {
      cartoes.push({ chave: it.id, itens: [it], principal: it, critico: it.critico });
    }
  }
  for (const c of cartoes) {
    c.critico = c.itens.some((i) => i.critico);
    // Num grupo de opções, o horário vem da primeira opção que tiver hora.
    const it = c.itens.find((i) => i.hora_inicio) ?? c.principal;
    if (it.hora_inicio) {
      const tz = fusoDoItem(it, roteiro);
      c.inicio = zonedToEpoch(it.data, it.hora_inicio, tz);
      if (it.hora_fim) {
        let f = zonedToEpoch(it.data, it.hora_fim, tz);
        if (f < c.inicio) f += 86400000; // passa da meia-noite
        c.fim = f;
      } else {
        c.fim = c.inicio + 30 * 60000;
      }
    }
  }
  // Ordenação: itens com hora pelo instante absoluto (cada um no seu fuso).
  // Itens sem hora ficam "presos" ao item com hora que vem antes deles na planilha,
  // mantendo a ordem das linhas. Empates seguem a ordem da planilha (estável).
  const ordemPlanilha = (c: Cartao) => c.principal.ordem ?? 0;
  const porLinha = [...cartoes].sort((a, b) => ordemPlanilha(a) - ordemPlanilha(b));
  const chaveTempo = new Map<Cartao, number>();
  let ultimo = Number.NEGATIVE_INFINITY;
  for (const c of porLinha) {
    if (c.inicio !== undefined) ultimo = c.inicio;
    chaveTempo.set(c, ultimo);
  }
  // Itens sem hora no começo do dia ficam antes do primeiro item com hora.
  return porLinha.sort((a, b) => chaveTempo.get(a)! - chaveTempo.get(b)! || ordemPlanilha(a) - ordemPlanilha(b));
}

export function pontosDoCartao(c: Cartao) {
  return c.critico ? PONTOS_CRITICO : PONTOS_ITEM;
}

export function estrelas(feitos: number, total: number): number {
  if (!total) return 0;
  const p = feitos / total;
  if (p >= 1) return 3;
  if (p >= 0.8) return 2;
  if (p >= 0.5) return 1;
  return 0;
}

export function resumoDoDia(roteiro: Roteiro, dia: Dia, feitos: Record<string, number>) {
  const cartoes = cartoesDoDia(roteiro, dia.data);
  const total = cartoes.length;
  const feitosN = cartoes.filter((c) => feitos[c.chave]).length;
  const criticos = cartoes.filter((c) => c.critico);
  const criticosOk = criticos.length > 0 && criticos.every((c) => feitos[c.chave]);
  return { total, feitos: feitosN, estrelas: estrelas(feitosN, total), criticos: criticos.length, criticosOk };
}

export function totalMoedas(roteiro: Roteiro, feitos: Record<string, number>): number {
  let soma = 0;
  for (const dia of roteiro.dias) {
    const cartoes = cartoesDoDia(roteiro, dia.data);
    for (const c of cartoes) if (feitos[c.chave]) soma += pontosDoCartao(c);
    const crit = cartoes.filter((c) => c.critico);
    if (crit.length && crit.every((c) => feitos[c.chave])) soma += PONTOS_DIA_CRITICOS;
  }
  return soma;
}

export const NUMERO_MUNDO: Record<string, number> = { osaka: 1, fuji: 2, toquio: 3 };
export const NOME_MUNDO: Record<string, string> = { osaka: 'Osaka', fuji: 'Fuji', toquio: 'Tóquio', voo: 'Voo' };
export const KANJI_MUNDO: Record<string, string> = { osaka: '大阪', fuji: '富士', toquio: '東京', voo: '空' };

export function rotuloFase(dia: Dia): string {
  const n = NUMERO_MUNDO[dia.mundo];
  return n ? `Mundo ${n} · Fase ${dia.fase}` : `Voo · Fase ${dia.fase}`;
}
