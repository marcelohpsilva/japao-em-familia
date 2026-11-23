// Folhas e telas por cima: detalhe do item, mostrar ao taxista, comprovante, aviso.
import { createContext, useContext } from 'react';
import type { Item } from '../types';

export interface Ui {
  abrirItem(item: Item): void;
  abrirTaxi(item: { titulo: string; endereco_jp?: string; local?: string }): void;
  abrirComprovante(nomes: string): void;
  aviso(texto: string): void;
  irParaDia(data: string): void;
}

export const UiCtx = createContext<Ui | null>(null);

export function useUi() {
  const c = useContext(UiCtx);
  if (!c) throw new Error('useUi fora do provider');
  return c;
}

export const ICONE_TIPO: Record<string, string> = {
  voo: '✈️',
  transporte: '🚆',
  atracao: '🎡',
  parque: '🎢',
  refeicao: '🍙',
  hotel: '🏨',
  servico: '🧳',
  compras: '🛍️',
  livre: '⭐',
};

export const TEXTO_PAGAR: Record<string, string> = {
  ic: 'Cartão IC',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão de crédito',
  incluso: 'Incluso',
  ja_pago: 'Já pago',
};

export const TEXTO_STATUS: Record<string, string> = {
  comprado: 'Comprado',
  reservado: 'Reservado',
  contratar_no_japao: 'Contratar no Japão',
  a_confirmar: 'A confirmar',
  a_reservar: 'A reservar',
  a_planejar: 'A planejar',
  ideia: 'Ideia',
};

export const STATUS_PENDENTE = new Set(['contratar_no_japao', 'a_confirmar', 'a_reservar']);

export function ienes(n?: number) {
  if (n === undefined) return '';
  return `¥ ${n.toLocaleString('pt-BR')}`;
}
