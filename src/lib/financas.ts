// Finanças (só para quem consegue abrir a planilha "Financas 2.0").
// O app lê SÓ estes intervalos (regra do escopo):
//   Projetos (linha "Japão 2026"), Japão 2026 (tabela e itens), Ações Japão,
//   Lancamentos (colunas Data, Descrição, Valor, Natureza, Projeto) e o câmbio
//   (intervalo nomeado CAMBIO_JPY_CAD ou só Parametros!A14:B14 — nunca a aba inteira).
// Linhas e colunas são achadas pelo TEXTO do cabeçalho, não por célula fixa.
import { normData } from './parse';

type Cell = string | number | boolean | null | undefined;

export const NOME_PROJETO = 'Japão 2026';

export interface CategoriaFin {
  categoria: string;
  natureza: string;
  orcado: number;
  realizado: number;
  saldo: number;
}

export interface ItemAPagar {
  item: string;
  status: string;
  valorCad: number;
  observacao?: string;
}

export interface Acao {
  numero: string;
  noite?: string;
  prazo?: string;
  /** prazo como AAAA-MM-DD (quando dá para entender a data) */
  prazoData?: string;
  acao: string;
  area?: string;
  tempoMin?: number;
  status: string;
  custoCad?: number;
  natureza?: string;
  comoFazer?: string;
}

export interface Lancamento {
  data: string;
  descricao: string;
  valor: number;
  natureza: string;
}

export interface Financas {
  orcado: number;
  gasto: number;
  saldo: number;
  categorias: CategoriaFin[];
  aPagar: ItemAPagar[];
  acoes: Acao[];
  lancamentos: Lancamento[];
  /** ienes por 1 CAD */
  cambio?: number;
  lidoEm: number;
}

function norm(v: Cell): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function texto(v: Cell): string {
  return String(v ?? '').trim();
}

/** Número em qualquer formato: 16666.27, "16.666,27", "–", "-", "" → 0. */
export function numero(v: Cell): number {
  if (typeof v === 'number') return v;
  const s = texto(v).replace(/[^\d,.-]/g, '');
  if (!s || s === '-' || s === '–') return 0;
  // pt-BR: "16.666,27" e "5.822" (ponto = milhar); senão, número comum.
  const milhar = /^-?\d{1,3}(\.\d{3})+$/.test(s);
  const n = s.includes(',') || milhar ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Acha uma linha de cabeçalho que tenha todos os títulos pedidos. */
function acharCabecalho(linhas: Cell[][], titulos: string[]) {
  const alvo = titulos.map(norm);
  for (let r = 0; r < linhas.length; r++) {
    const cab = (linhas[r] ?? []).map(norm);
    const cols = alvo.map((t) => cab.indexOf(t));
    if (cols.every((c) => c >= 0)) return { linha: r, cols: Object.fromEntries(titulos.map((t, i) => [t, cols[i]])) as Record<string, number> };
  }
  return null;
}

export function lerProjeto(linhas: Cell[][]) {
  const cab = acharCabecalho(linhas, ['Projeto', 'Orçamento (CAD)', 'Gasto realizado (CAD)', 'Saldo do orçamento']);
  if (!cab) return null;
  const linha = linhas.slice(cab.linha + 1).find((l) => norm(l?.[cab.cols['Projeto']]) === norm(NOME_PROJETO));
  if (!linha) return null;
  return {
    orcado: numero(linha[cab.cols['Orçamento (CAD)']]),
    gasto: Math.abs(numero(linha[cab.cols['Gasto realizado (CAD)']])),
    saldo: numero(linha[cab.cols['Saldo do orçamento']]),
  };
}

/** Tabela "ORÇADO × REALIZADO" da aba Japão 2026 (posição achada pelo título). */
export function lerCategorias(linhas: Cell[][]) {
  let r0 = -1;
  let c0 = -1;
  for (let r = 0; r < linhas.length && r0 < 0; r++) {
    (linhas[r] ?? []).forEach((v, c) => {
      const t = norm(v);
      if (r0 < 0 && t.includes('orcado') && t.includes('realizado') && t.length < 30) {
        r0 = r;
        c0 = c;
      }
    });
  }
  if (r0 < 0) return { categorias: [] as CategoriaFin[], total: null };
  const cab = (linhas[r0] ?? []).map(norm);
  const col = (t: string) => cab.findIndex((h, i) => i > c0 && h === norm(t));
  const cOrc = col('Orçado (CAD)');
  const cReal = col('Realizado (CAD)');
  const cSaldo = col('Saldo (CAD)');
  const cNat = col('Natureza para lançar');
  const categorias: CategoriaFin[] = [];
  let total: { orcado: number; realizado: number; saldo: number } | null = null;
  for (let r = r0 + 1; r < linhas.length; r++) {
    const nome = texto(linhas[r]?.[c0]);
    if (!nome || (cOrc >= 0 && linhas[r]?.[cOrc] === undefined && !linhas[r]?.[cReal])) break;
    const reg = {
      orcado: numero(linhas[r][cOrc]),
      realizado: Math.abs(numero(linhas[r][cReal])),
      saldo: numero(linhas[r][cSaldo]),
    };
    if (norm(nome) === 'total') {
      total = reg;
      break;
    }
    categorias.push({ categoria: nome, natureza: cNat >= 0 ? texto(linhas[r][cNat]) : '', ...reg });
  }
  return { categorias, total };
}

/** Itens da aba Japão 2026 com status Estimar ou Pendente: "ainda vai sair dinheiro". */
export function lerAPagar(linhas: Cell[][]): ItemAPagar[] {
  const cab = acharCabecalho(linhas, ['Item', 'Status', 'Valor em CAD']);
  if (!cab) return [];
  const cObs = (linhas[cab.linha] ?? []).map(norm).indexOf('observacao');
  const out: ItemAPagar[] = [];
  for (const l of linhas.slice(cab.linha + 1)) {
    const status = texto(l?.[cab.cols['Status']]);
    if (!['estimar', 'pendente'].includes(norm(status))) continue;
    out.push({
      item: texto(l[cab.cols['Item']]),
      status,
      valorCad: numero(l[cab.cols['Valor em CAD']]),
      observacao: cObs >= 0 ? texto(l[cObs]) || undefined : undefined,
    });
  }
  return out;
}

/** "13/11 (sex.)" → "2026-11-13". O ano vem da viagem (dez → ano do embarque, jan → ano seguinte). */
export function dataDoPrazo(prazo: string, embarque: string): string | undefined {
  const m = prazo.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return undefined;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(embarque.slice(0, 4));
  if (!m[3] && mes < 6 && Number(embarque.slice(5, 7)) >= 6) ano += 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function lerAcoes(linhas: Cell[][], embarque: string): Acao[] {
  const cab = acharCabecalho(linhas, ['Nº', 'Ação', 'Status']);
  if (!cab) return [];
  const h = (linhas[cab.linha] ?? []).map(norm);
  const c = (t: string) => h.indexOf(norm(t));
  const cols = {
    noite: c('Noite planejada'),
    prazo: c('Prazo final'),
    area: c('Área'),
    tempo: c('Tempo (min)'),
    custo: c('Custo previsto (CAD)'),
    natureza: c('Natureza ao pagar'),
    como: c('Como fazer / observações'),
  };
  const opt = (l: Cell[], i: number) => (i >= 0 ? texto(l[i]) || undefined : undefined);
  const out: Acao[] = [];
  for (const l of linhas.slice(cab.linha + 1)) {
    const acao = texto(l?.[cab.cols['Ação']]);
    const status = texto(l?.[cab.cols['Status']]);
    if (!acao || norm(status) === 'feito') continue;
    const prazo = opt(l, cols.prazo);
    out.push({
      numero: texto(l[cab.cols['Nº']]),
      noite: opt(l, cols.noite),
      prazo,
      prazoData: prazo ? dataDoPrazo(prazo, embarque) : undefined,
      acao,
      area: opt(l, cols.area),
      tempoMin: cols.tempo >= 0 && texto(l[cols.tempo]) ? numero(l[cols.tempo]) : undefined,
      status,
      custoCad: cols.custo >= 0 && texto(l[cols.custo]) ? numero(l[cols.custo]) : undefined,
      natureza: opt(l, cols.natureza),
      comoFazer: opt(l, cols.como),
    });
  }
  return out.sort((a, b) => (a.prazoData ?? '9999').localeCompare(b.prazoData ?? '9999') || Number(a.numero) - Number(b.numero));
}

/** Colunas da aba Lancamentos, lidas uma a uma (cada array começa pelo cabeçalho). */
export function lerLancamentos(colunas: Record<'data' | 'descricao' | 'valor' | 'natureza' | 'projeto', Cell[]>): Lancamento[] {
  const out: Lancamento[] = [];
  const n = colunas.projeto.length;
  for (let i = 1; i < n; i++) {
    if (norm(colunas.projeto[i]) !== norm(NOME_PROJETO)) continue;
    out.push({
      data: normData(colunas.data[i] as string | number),
      descricao: texto(colunas.descricao[i]),
      valor: numero(colunas.valor[i]),
      natureza: texto(colunas.natureza[i]),
    });
  }
  return out;
}

export function lerCambio(linha: Cell[] | undefined): number | undefined {
  if (!linha) return undefined;
  // Intervalo nomeado: um valor só. Parametros!A14:B14: rótulo + valor (confere o rótulo).
  if (linha.length === 1) return numero(linha[0]) || undefined;
  if (!norm(linha[0]).includes('cambio')) return undefined;
  return numero(linha[1]) || undefined;
}

// ---------- Contas para a tela ----------

export type Semaforo = 'verde' | 'amarelo' | 'vermelho';

export function semaforo(gasto: number, orcado: number): Semaforo {
  if (!orcado) return 'verde';
  const p = gasto / orcado;
  if (p > 1) return 'vermelho';
  if (p >= 0.9) return 'amarelo';
  return 'verde';
}

/** Gasto por dia dentro da viagem (despesas são valores negativos em Lancamentos). */
export function gastoPorDia(lancs: Lancamento[], inicio: string, fim: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lancs) {
    if (l.data < inicio || l.data > fim) continue;
    m.set(l.data, (m.get(l.data) ?? 0) - l.valor);
  }
  return m;
}
