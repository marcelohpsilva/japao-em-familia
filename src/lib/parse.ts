// Converte as abas da planilha Roteiro (linhas cruas da Sheets API) no formato do app.
// O app acha as colunas pelo nome do cabeçalho, então a ordem pode mudar.
import type { Contato, Dia, Item, Roteiro, Viagem } from '../types';

type Cell = string | number | boolean | null | undefined;

/** Número de série do Sheets (dias desde 30/12/1899) → "AAAA-MM-DD". */
function serialToDate(n: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Fração do dia do Sheets → "HH:MM". */
function serialToTime(n: number): string {
  const totalMin = Math.round((n - Math.floor(n)) * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function str(v: Cell): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function normData(v: Cell): string {
  if (typeof v === 'number') return serialToDate(v);
  const s = str(v);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return s.slice(0, 10);
}

export function normHora(v: Cell): string {
  if (typeof v === 'number') return serialToTime(v);
  const s = str(v);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function normNum(v: Cell): number | undefined {
  if (typeof v === 'number') return v;
  const s = str(v).replace(/[^\d,.-]/g, '');
  if (!s) return undefined;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function simNao(v: Cell): boolean {
  if (typeof v === 'boolean') return v;
  return str(v).toLowerCase() === 'sim';
}

function opt(v: Cell): string | undefined {
  const s = str(v);
  return s ? s : undefined;
}

/** Linhas → objetos com as chaves do cabeçalho (linha 1). */
export function rowsToObjects(rows: Cell[][]): Record<string, Cell>[] {
  if (!rows.length) return [];
  const header = rows[0].map((h) => str(h).toLowerCase());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => str(c) !== ''))
    .map((r) => {
      const o: Record<string, Cell> = {};
      header.forEach((h, i) => {
        if (h) o[h] = r[i];
      });
      return o;
    });
}

export function parseRoteiro(abas: Record<string, Cell[][]>): Roteiro {
  const kv: Record<string, Cell> = {};
  for (const o of rowsToObjects(abas['Viagem'] ?? [])) kv[str(o.chave)] = o.valor;

  const viagem: Viagem = {
    nome_viagem: str(kv.nome_viagem) || 'Japão em Família',
    embarque_data: normData(kv.embarque_data),
    embarque_hora: normHora(kv.embarque_hora),
    embarque_fuso: str(kv.embarque_fuso) || 'America/Vancouver',
    inicio_japao: normData(kv.inicio_japao),
    fim_viagem: normData(kv.fim_viagem),
    moeda_local: str(kv.moeda_local) || 'JPY',
    versao_export: normData(kv.versao_export),
  };

  const dias: Dia[] = rowsToObjects(abas['Dias'] ?? []).map((o) => ({
    data: normData(o.data),
    mundo: (str(o.mundo).toLowerCase() || 'osaka') as Dia['mundo'],
    fase: normNum(o.fase) ?? 0,
    titulo: str(o.titulo),
    tipo_dia: str(o.tipo_dia) as Dia['tipo_dia'],
    parque: opt(o.parque),
    hotel: str(o.hotel),
    resumo: str(o.resumo),
    dica_do_dia: opt(o.dica_do_dia),
    status_dia: str(o.status_dia) as Dia['status_dia'],
  }));

  const itens: Item[] = rowsToObjects(abas['Itens'] ?? []).map((o) => ({
    id: str(o.id),
    data: normData(o.data),
    hora_inicio: normHora(o.hora_inicio) || undefined,
    hora_fim: normHora(o.hora_fim) || undefined,
    fuso: opt(o.fuso),
    tipo: (str(o.tipo) || 'livre') as Item['tipo'],
    titulo: str(o.titulo),
    descricao: opt(o.descricao),
    local: opt(o.local),
    endereco_jp: opt(o.endereco_jp),
    link_maps: opt(o.link_maps),
    linha: opt(o.linha),
    de: opt(o.de),
    para: opt(o.para),
    duracao_min: normNum(o.duracao_min),
    como_pagar: opt(o.como_pagar) as Item['como_pagar'],
    status: (str(o.status) || 'comprado') as Item['status'],
    grupo_opcoes: opt(o.grupo_opcoes),
    custo_previsto_jpy: normNum(o.custo_previsto_jpy),
    pago: o.pago === undefined || str(o.pago) === '' ? undefined : simNao(o.pago),
    comprovante: opt(o.comprovante),
    critico: simNao(o.critico),
    lembrete_min: normNum(o.lembrete_min),
    notas: opt(o.notas),
  }));

  const contatos: Contato[] = rowsToObjects(abas['Contatos'] ?? []).map((o) => ({
    nome: str(o.nome),
    tipo: (str(o.tipo) || 'servico') as Contato['tipo'],
    telefone: opt(o.telefone),
    endereco_jp: opt(o.endereco_jp),
    link_maps: opt(o.link_maps),
    notas: opt(o.notas),
  }));

  dias.sort((a, b) => a.data.localeCompare(b.data));
  return { viagem, dias, itens: itens.filter((i) => i.id && i.data), contatos };
}
