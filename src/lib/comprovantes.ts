// Relaciona o nome que está na coluna "comprovante" com os arquivos reais do Drive.
//
// A planilha usa nomes padronizados (ex.: 2026-12-30_ingresso_usj-dia1.pdf), mas os
// documentos podem estar em qualquer subpasta de Viagem-Japao, com o nome original
// (ex.: Parques/Universal/30-12/Day 1 Studio Pass/Ingresso 1.pdf). A ordem de busca é:
//   1. arquivo com o nome exato, em qualquer subpasta;
//   2. pasta com o nome exato (ou caminho "Parques/Universal/...") → todos os arquivos dela;
//   3. busca automática: data + palavras do nome padronizado comparadas com o caminho
//      e o nome de cada pasta e arquivo. Se der empate entre arquivos da mesma pasta,
//      a pasta inteira é o comprovante (ex.: um ingresso por pessoa).

export interface ArquivoDrive {
  id: string;
  nome: string;
  mimeType: string;
  size?: string;
  /** pastas desde Viagem-Japao (sem incluir ela), ex.: ["Parques", "Universal"] */
  caminho: string[];
}

export interface Resolucao {
  arquivos: ArquivoDrive[];
  /** onde achou, para mostrar ao usuário (ex.: "Parques/Universal/30-12/Day 1 Studio Pass") */
  local?: string;
  como?: 'exato' | 'pasta' | 'automatico';
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function semExtensao(nome: string): string {
  return nome.replace(/\.[a-z0-9]{2,5}$/i, '');
}

/** Palavras de um texto + pares juntos ("fuji q" → "fujiq", "day 1" → "day1"). */
function palavras(texto: string): Set<string> {
  const t = normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set(t);
  for (let i = 0; i < t.length - 1; i++) out.add(t[i] + t[i + 1]);
  return out;
}

/** Datas que aparecem no caminho ("30-12", "01-02") → "MM-DD" possíveis. */
function datasNoTexto(texto: string): Set<string> {
  const out = new Set<string>();
  for (const m of texto.matchAll(/(?<!\d)(\d{1,2})[-_.](\d{1,2})(?!\d)/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const fmt = (mes: number, dia: number) => `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) out.add(fmt(b, a)); // DD-MM
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) out.add(fmt(a, b)); // MM-DD
  }
  return out;
}

// Sinônimos genéricos (português ↔ como os sites de reserva costumam chamar).
const SINONIMOS: Record<string, string[]> = {
  usj: ['usj', 'universal'],
  // "ticket" fica de fora: é usado também nos ingressos dos parques.
  voo: ['voo', 'voos', 'passagem', 'passagens', 'tkt', 'eticket', 'flight', 'flights', 'bilhete', 'bilhetes', 'boarding'],
  bilhete: ['bilhete', 'bilhetes', 'passagem', 'passagens', 'tkt', 'eticket'],
  bilhetes: ['bilhete', 'bilhetes', 'passagem', 'passagens', 'tkt', 'eticket'],
  passagem: ['passagem', 'passagens', 'tkt', 'eticket', 'bilhete'],
  hotel: ['hotel', 'hoteis', 'hotels', 'hospedagem', 'reserva'],
  ingresso: ['ingresso', 'ingressos', 'ticket', 'tickets', 'pass', 'entrada'],
  pacote: ['pacote', 'package', 'booking', 'reservation', 'reservations', 'reserva'],
  reserva: ['reserva', 'booking', 'reservation', 'reservations'],
  recibo: ['recibo', 'receipt', 'comprovante'],
  kawaguchiko: ['kawaguchiko', 'fuji'],
  fujikawaguchiko: ['kawaguchiko', 'fuji'],
  tokyo: ['tokyo', 'toquio'],
  toquio: ['tokyo', 'toquio'],
  express: ['express'],
};

/** Grupos de palavras do nome padronizado: basta uma do grupo aparecer. */
function gruposDaReferencia(ref: string) {
  const m = normalizar(semExtensao(ref)).match(/^(\d{4})-(\d{2})-(\d{2})_([a-z0-9]+)_(.+)$/);
  if (!m) {
    return { data: null as string | null, grupos: [...palavras(ref)].filter((p) => p.length > 2).map((p) => [p]), tipo: null };
  }
  const [, , mes, dia, tipo, desc] = m;
  const grupos: string[][] = [];
  for (const parte of desc.split(/[^a-z0-9]+/).filter(Boolean)) {
    const num = parte.match(/^([a-z]+)(\d+)$/);
    if (num) {
      const [, palavra, n] = num;
      // "dia1" → "dia1"/"day1"; "express4" → "express4"/"express"
      grupos.push(palavra === 'dia' || palavra === 'day' ? [`dia${n}`, `day${n}`] : [parte, palavra]);
    } else if (parte.length > 1) {
      grupos.push(SINONIMOS[parte] ?? [parte]);
    }
  }
  return { data: `${mes}-${dia}`, grupos, tipo: SINONIMOS[tipo] ?? [tipo] };
}

interface Candidato {
  chave: string;
  pasta: boolean;
  caminho: string[]; // para pasta: o próprio caminho; para arquivo: caminho da pasta
  arquivo?: ArquivoDrive;
  palavras: Set<string>;
  datas: Set<string>;
}

function candidatos(arvore: ArquivoDrive[]): Candidato[] {
  const out: Candidato[] = [];
  const pastas = new Map<string, string[]>();
  for (const a of arvore) {
    for (let i = 1; i <= a.caminho.length; i++) {
      const c = a.caminho.slice(0, i);
      pastas.set(c.join('/'), c);
    }
    const texto = [...a.caminho, semExtensao(a.nome)].join(' ');
    out.push({ chave: a.id, pasta: false, caminho: a.caminho, arquivo: a, palavras: palavras(texto), datas: datasNoTexto([...a.caminho, a.nome].join('/')) });
  }
  for (const [k, c] of pastas) {
    out.push({ chave: `pasta:${k}`, pasta: true, caminho: c, palavras: palavras(c.join(' ')), datas: datasNoTexto(c.join('/')) });
  }
  return out;
}

function dentroDe(caminho: string[], pasta: string[]) {
  return pasta.length <= caminho.length && pasta.every((p, i) => caminho[i] === p);
}

function arquivosDaPasta(arvore: ArquivoDrive[], pasta: string[]) {
  return arvore.filter((a) => dentroDe(a.caminho, pasta)).sort((x, y) => x.nome.localeCompare(y.nome, 'pt', { numeric: true }));
}

export function resolverComprovante(ref: string, arvore: ArquivoDrive[]): Resolucao {
  const alvo = ref.trim();
  if (!alvo) return { arquivos: [] };

  // 1. Nome exato do arquivo
  const exato = arvore.filter((a) => a.nome === alvo);
  if (exato.length) return { arquivos: exato, local: [...exato[0].caminho, exato[0].nome].join('/'), como: 'exato' };

  // 2. Pasta pelo nome ou caminho
  const alvoNorm = normalizar(alvo).replace(/\/+$/, '');
  const c = candidatos(arvore).filter((x) => x.pasta);
  const pasta =
    c.find((x) => normalizar(x.caminho.join('/')) === alvoNorm) ??
    c.find((x) => normalizar(x.caminho[x.caminho.length - 1]) === alvoNorm);
  if (pasta) return { arquivos: arquivosDaPasta(arvore, pasta.caminho), local: pasta.caminho.join('/'), como: 'pasta' };

  // 3. Busca automática
  const { data, grupos, tipo } = gruposDaReferencia(alvo);
  if (!grupos.length) return { arquivos: [] };
  const pontuados = candidatos(arvore).map((cand) => {
    let pontos = 0;
    let descricao = 0;
    for (const g of grupos) {
      if (g.some((p) => cand.palavras.has(p))) {
        pontos++;
        descricao++;
      }
    }
    if (tipo && tipo.some((p) => cand.palavras.has(p))) pontos++;
    if (data && cand.datas.size) pontos += cand.datas.has(data) ? 1 : -2;
    return { cand, pontos, descricao };
  });
  const validos = pontuados.filter((p) => p.pontos >= 2 && p.descricao >= 1);
  if (!validos.length) return { arquivos: [] };
  const max = Math.max(...validos.map((p) => p.pontos));
  const topo = validos.filter((p) => p.pontos === max).map((p) => p.cand);

  if (topo.length === 1) {
    const t = topo[0];
    return t.pasta
      ? { arquivos: arquivosDaPasta(arvore, t.caminho), local: t.caminho.join('/'), como: 'automatico' }
      : { arquivos: [t.arquivo!], local: [...t.caminho, t.arquivo!.nome].join('/'), como: 'automatico' };
  }
  // Empate: se todos estão numa mesma pasta (que não seja a raiz), o comprovante é a pasta.
  let comum = topo[0].caminho;
  for (const t of topo) {
    let i = 0;
    while (i < comum.length && i < t.caminho.length && comum[i] === t.caminho[i]) i++;
    comum = comum.slice(0, i);
  }
  const todosDentro = topo.every((t) => dentroDe(t.caminho, comum));
  // A pasta comum tem que ser específica: uma das empatadas, ou a pasta direta dos arquivos empatados.
  const especifica = topo.some((t) => t.pasta && t.caminho.join('/') === comum.join('/')) || topo.every((t) => !t.pasta && t.caminho.join('/') === comum.join('/'));
  if (comum.length && todosDentro && especifica) {
    return { arquivos: arquivosDaPasta(arvore, comum), local: comum.join('/'), como: 'automatico' };
  }
  return { arquivos: [] }; // ambíguo: melhor dizer "não achado" do que abrir o documento errado
}

/** Todos os comprovantes citados na planilha (separados por ";"), sem repetir. */
export function referenciasDoRoteiro(itens: { comprovante?: string }[]): string[] {
  const out = new Set<string>();
  for (const i of itens) for (const r of (i.comprovante ?? '').split(';')) if (r.trim()) out.add(r.trim());
  return [...out];
}

export function rotuloArquivo(a: ArquivoDrive): string {
  return semExtensao(a.nome);
}
