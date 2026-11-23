// Formato do Roteiro, igual à seção 3.2 do escopo.

export type Mundo = 'osaka' | 'fuji' | 'toquio' | 'voo';
export type TipoDia = 'chegada' | 'parque' | 'passeio' | 'deslocamento' | 'volta' | 'voo';
export type StatusDia = 'comprado' | 'reservado' | 'a_confirmar' | 'a_planejar' | 'a_reservar';
export type TipoItem =
  | 'voo' | 'transporte' | 'atracao' | 'parque' | 'refeicao'
  | 'hotel' | 'servico' | 'compras' | 'livre';
export type StatusItem =
  | 'comprado' | 'reservado' | 'contratar_no_japao' | 'a_confirmar' | 'a_reservar' | 'ideia';
export type ComoPagar = 'ic' | 'dinheiro' | 'cartao' | 'incluso' | 'ja_pago';

export interface Viagem {
  nome_viagem: string;
  embarque_data: string;
  embarque_hora: string;
  embarque_fuso: string;
  inicio_japao: string;
  fim_viagem: string;
  moeda_local: string;
  versao_export: string;
}

export interface Dia {
  data: string;
  mundo: Mundo;
  fase: number;
  titulo: string;
  tipo_dia: TipoDia;
  parque?: string;
  hotel: string;
  resumo: string;
  dica_do_dia?: string;
  status_dia: StatusDia;
}

export interface Item {
  id: string;
  data: string;
  hora_inicio?: string;
  hora_fim?: string;
  fuso?: string;
  tipo: TipoItem;
  titulo: string;
  descricao?: string;
  local?: string;
  endereco_jp?: string;
  link_maps?: string;
  linha?: string;
  de?: string;
  para?: string;
  duracao_min?: number;
  como_pagar?: ComoPagar;
  status: StatusItem;
  grupo_opcoes?: string;
  custo_previsto_jpy?: number;
  pago?: boolean;
  comprovante?: string;
  critico: boolean;
  lembrete_min?: number;
  notas?: string;
}

export interface Contato {
  nome: string;
  tipo: 'hotel' | 'emergencia' | 'transporte' | 'servico';
  telefone?: string;
  endereco_jp?: string;
  link_maps?: string;
  notas?: string;
}

export interface Roteiro {
  viagem: Viagem;
  dias: Dia[];
  itens: Item[];
  contatos: Contato[];
}

export type Fonte = 'demo' | 'google';
