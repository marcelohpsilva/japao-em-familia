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

/** Hora local de cada lugar: só avisa a cidade quando não é o Japão. */
export function nomeDoFuso(fuso?: string): string | null {
  if (!fuso || fuso === 'Asia/Tokyo') return null;
  const nomes: Record<string, string> = { 'Asia/Seoul': 'Seul', 'America/Vancouver': 'Vancouver' };
  return nomes[fuso] ?? fuso.split('/').pop()!.replace(/_/g, ' ');
}

export function horaAConfirmar(item: { notas?: string }): boolean {
  return /^hor[áa]rio a confirmar/i.test(item.notas ?? '');
}

/** Copia texto; se o navegador não deixar, devolve false. */
export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.value = texto;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** "+81 6-4706-8800" → "tel:+81647068800". Vazio → null (esconde o botão). */
export function linkTelefone(tel?: string): string | null {
  const limpo = (tel ?? '').replace(/[^\d+]/g, '');
  return limpo ? `tel:${limpo}` : null;
}
