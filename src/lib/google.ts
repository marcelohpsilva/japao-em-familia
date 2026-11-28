// Login Google (token model do Google Identity Services) e leitura do Drive/Sheets.
// Tudo roda no navegador: sem servidor e sem segredo. O Client ID não é segredo.
// O app só LÊ. Os arquivos são achados por nome, e os IDs ficam só no IndexedDB.
import { kvGet, kvSet } from './db';
import { parseRoteiro } from './parse';
import type { Roteiro } from '../types';

export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

// Leitura para todos. A escrita na planilha é pedida à parte, só quando alguém conclui
// uma pendência pela primeira vez (quem só consulta nunca vê esse pedido).
const ESCOPO_ESCRITA = 'https://www.googleapis.com/auth/spreadsheets';
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

const PASTA = 'Viagem-Japao';
const ROTEIRO = 'Roteiro';
const MIME_PASTA = 'application/vnd.google-apps.folder';
const MIME_PLANILHA = 'application/vnd.google-apps.spreadsheet';

export class SemAcessoError extends Error {}
export class TokenExpiradoError extends Error {}
export class SemPermissaoEscritaError extends Error {}

interface Token {
  access_token: string;
  expira: number;
  /** permissões que o Google deu para esta chave */
  escopos?: string;
}

export interface Usuario {
  email: string;
  nome: string;
  foto?: string;
}

export interface IdsDrive {
  pasta: string;
  roteiro: string;
}

import type { ArquivoDrive } from './comprovantes';
import { lerAcoes, lerAPagar, lerCambio, lerCategorias, lerLancamentos, lerProjeto, type Financas } from './financas';
export type { ArquivoDrive };

interface ArquivoDriveApi {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

// ---------- Script do Google Identity Services ----------

interface TokenClient {
  requestAccessToken(o?: { prompt?: string; login_hint?: string; scope?: string }): void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string;
        scope: string;
        callback: (r: { access_token?: string; expires_in?: number; error?: string; scope?: string }) => void;
        error_callback?: (e: { type: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

let gisPromise: Promise<Gis> | null = null;
function carregarGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts) return Promise.resolve(w.google);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve((window as unknown as { google: Gis }).google);
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Não deu para carregar o login do Google. Confira a internet.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

let tokenAtual: Token | null = null;

/** Lê do aparelho a chave salva (chamado ao abrir o app). */
export async function carregarToken() {
  if (!tokenAtual) tokenAtual = (await kvGet<Token>('token')) ?? null;
}

/** Chave em memória, sem esperar nada (para não perder o "toque" do usuário no Safari). */
export function tokenAgora(): string | null {
  if (tokenAtual && tokenAtual.expira - 60_000 > Date.now()) return tokenAtual.access_token;
  return null;
}

/** Quando a chave atual vence (ms), ou null. */
export function tokenExpiraEm(): number | null {
  return tokenAtual?.expira ?? null;
}

export async function tokenValido(): Promise<string | null> {
  await carregarToken();
  return tokenAgora();
}

export function esquecerToken() {
  tokenAtual = null;
  void kvSet('token', null);
}

/** Baixa o script de login do Google antes, para o toque abrir a janela na hora. */
export function prepararLogin() {
  if (CLIENT_ID) carregarGis().catch(() => {});
}

/** A chave atual pode gravar na planilha? */
export function tokenPodeEscrever(): boolean {
  return !!tokenAtual?.escopos?.split(' ').includes(ESCOPO_ESCRITA);
}

let escritaConcedida = false;
/** Lembra que esta pessoa já deu permissão de escrita (para as renovações manterem). */
export async function carregarPreferenciaEscrita() {
  escritaConcedida = !!(await kvGet<boolean>('escrita'));
}

function pedirToken(gis: Gis, silencioso: boolean, dica?: string, comEscrita = false): Promise<string> {
  const querEscrita = comEscrita || escritaConcedida;
  const escopos = querEscrita ? `${SCOPES} ${ESCOPO_ESCRITA}` : SCOPES;
  return new Promise((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: escopos,
      callback: async (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error ?? 'Login cancelado'));
          return;
        }
        tokenAtual = {
          access_token: r.access_token,
          expira: Date.now() + (r.expires_in ?? 3600) * 1000,
          escopos: r.scope ?? escopos,
        };
        await kvSet('token', tokenAtual);
        if (tokenPodeEscrever() && !escritaConcedida) {
          escritaConcedida = true;
          await kvSet('escrita', true);
        }
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Login cancelado' : e.type)),
    });
    // Sem tela de escolher conta nem de permissões quando a pessoa já autorizou antes.
    client.requestAccessToken({ prompt: silencioso ? 'none' : '', login_hint: dica });
  });
}

/**
 * Abre o login do Google. Precisa ser chamado DIRETO dentro de um toque (sem esperar
 * nada antes), senão o Safari bloqueia a janela. `silencioso` = renovar sem mostrar nada.
 */
export function entrar(silencioso = false, dica?: string, comEscrita = false): Promise<string> {
  if (!CLIENT_ID) return Promise.reject(new Error('Falta configurar o VITE_GOOGLE_CLIENT_ID.'));
  const g = (window as unknown as { google?: Gis }).google;
  if (g?.accounts) return pedirToken(g, silencioso, dica, comEscrita);
  return carregarGis().then((gis) => pedirToken(gis, silencioso, dica, comEscrita));
}

export async function sair() {
  const t = await tokenValido();
  tokenAtual = null;
  if (t) {
    try {
      const gis = await carregarGis();
      gis.accounts.oauth2.revoke(t);
    } catch {
      /* offline: tudo bem, os dados locais são apagados mesmo assim */
    }
  }
}

// ---------- Chamadas às APIs ----------

async function api<T>(url: string, token: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) throw new TokenExpiradoError('Token expirou');
  if (r.status === 403 || r.status === 404) throw new SemAcessoError(`Sem acesso (${r.status})`);
  if (!r.ok) throw new Error(`Erro ${r.status} ao falar com o Google`);
  return r.json() as Promise<T>;
}

export async function lerUsuario(token: string): Promise<Usuario> {
  const u = await api<{ email: string; name?: string; picture?: string }>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    token,
  );
  return { email: u.email, nome: u.name ?? u.email, foto: u.picture };
}

async function buscarPorNome(token: string, nome: string, mime: string, pai?: string) {
  const esc = nome.replace(/'/g, "\\'");
  let q = `name = '${esc}' and mimeType = '${mime}' and trashed = false`;
  if (pai) q += ` and '${pai}' in parents`;
  const url =
    'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({
      q,
      fields: 'files(id,name)',
      pageSize: '10',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
  const r = await api<{ files: { id: string }[] }>(url, token);
  return r.files[0]?.id;
}

/** Acha a pasta Viagem-Japao, a planilha Roteiro e a pasta Comprovantes pelo nome. */
export async function acharIds(token: string): Promise<IdsDrive> {
  const salvo = await kvGet<IdsDrive>('ids');
  if (salvo?.roteiro) return salvo;
  const pasta = await buscarPorNome(token, PASTA, MIME_PASTA);
  if (!pasta) throw new SemAcessoError('Pasta Viagem-Japao não encontrada');
  const roteiro = await buscarPorNome(token, ROTEIRO, MIME_PLANILHA, pasta);
  if (!roteiro) throw new SemAcessoError('Planilha Roteiro não encontrada');
  const ids = { pasta, roteiro };
  await kvSet('ids', ids);
  return ids;
}

const ABAS = ['Viagem', 'Dias', 'Itens', 'Contatos'];

export async function lerRoteiro(token: string, ids: IdsDrive): Promise<Roteiro> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${ids.roteiro}`;
  const meta = await api<{ sheets: { properties: { title: string } }[] }>(
    `${base}?fields=sheets.properties.title`,
    token,
  );
  const existentes = new Set(meta.sheets.map((s) => s.properties.title));
  const abas = ABAS.filter((a) => existentes.has(a));
  const params = new URLSearchParams({
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });
  for (const a of abas) params.append('ranges', `${a}!A1:Z2000`);
  const r = await api<{ valueRanges: { range: string; values?: (string | number | boolean)[][] }[] }>(
    `${base}/values:batchGet?${params}`,
    token,
  );
  const dados: Record<string, (string | number | boolean)[][]> = {};
  r.valueRanges.forEach((vr, i) => {
    dados[abas[i]] = vr.values ?? [];
  });
  return parseRoteiro(dados);
}

/**
 * Lista TODOS os documentos dentro de Viagem-Japao, em qualquer subpasta
 * (Passagens, Hoteis, Parques/Universal/30-12/...), guardando o caminho de pastas.
 * Planilhas e documentos Google ficam de fora: só PDFs, imagens etc.
 */
export async function listarArvore(token: string, pastaRaiz: string): Promise<ArquivoDrive[]> {
  const out: ArquivoDrive[] = [];
  const fila: { id: string; caminho: string[] }[] = [{ id: pastaRaiz, caminho: [] }];
  const vistas = new Set<string>();
  while (fila.length) {
    const atual = fila.shift()!;
    if (vistas.has(atual.id) || atual.caminho.length > 8) continue;
    vistas.add(atual.id);
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${atual.id}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,size)',
        pageSize: '200',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const r = await api<{ nextPageToken?: string; files: ArquivoDriveApi[] }>(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        token,
      );
      for (const f of r.files) {
        if (f.mimeType === MIME_PASTA) fila.push({ id: f.id, caminho: [...atual.caminho, f.name] });
        else if (!f.mimeType.startsWith('application/vnd.google-apps.')) {
          out.push({ id: f.id, nome: f.name, mimeType: f.mimeType, size: f.size, caminho: atual.caminho });
        }
      }
      pageToken = r.nextPageToken;
    } while (pageToken);
  }
  return out;
}

export async function baixarArquivo(token: string, id: string): Promise<Blob> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) throw new TokenExpiradoError('Token expirou');
  if (!r.ok) throw new Error(`Erro ${r.status} ao baixar`);
  return r.blob();
}

// ---------- Escrita na planilha (só a coluna status de um item) ----------

/** A conta logada pode editar a planilha Roteiro? (quem só tem leitura não vê o botão) */
export async function podeEditarPlanilha(token: string, planilhaId: string): Promise<boolean> {
  try {
    const r = await api<{ capabilities?: { canEdit?: boolean } }>(
      `https://www.googleapis.com/drive/v3/files/${planilhaId}?fields=capabilities(canEdit)&supportsAllDrives=true`,
      token,
    );
    return !!r.capabilities?.canEdit;
  } catch {
    return false;
  }
}

function letraColuna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Grava UMA célula: na aba indicada, acha a linha de cabeçalho (nas 15 primeiras linhas)
 * que tem as colunas `chave` e `coluna`, acha a linha cujo valor em `chave` é `valorChave`
 * e grava `valor` na coluna `coluna`. Tudo pelo texto, nada por posição fixa.
 */
export async function gravarPorChave(o: {
  token: string;
  planilhaId: string;
  aba: string;
  chave: string;
  valorChave: string;
  coluna: string;
  valor: string;
}) {
  const { token, planilhaId, aba, chave, valorChave, coluna, valor } = o;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${planilhaId}/values`;
  const faixa = (a1: string) => encodeURIComponent(`'${aba.replace(/'/g, "''")}'!${a1}`);
  const topo = await api<{ values?: string[][] }>(`${base}/${faixa('1:15')}`, token);
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  let linhaCab = -1;
  let colChave = -1;
  let colAlvo = -1;
  (topo.values ?? []).forEach((l, i) => {
    const h = l.map(norm);
    if (linhaCab < 0 && h.includes(norm(chave)) && h.includes(norm(coluna))) {
      linhaCab = i;
      colChave = h.indexOf(norm(chave));
      colAlvo = h.indexOf(norm(coluna));
    }
  });
  if (linhaCab < 0) throw new Error(`A aba ${aba} não tem as colunas "${chave}" e "${coluna}".`);
  const L = letraColuna(colChave);
  const col = await api<{ values?: string[][] }>(`${base}/${faixa(`${L}:${L}`)}`, token);
  const achadas = (col.values ?? [])
    .map((r, i) => ({ v: String(r[0] ?? '').trim(), linha: i + 1 }))
    .filter((r) => r.linha > linhaCab + 1 && r.v === valorChave);
  if (achadas.length !== 1) {
    throw new Error(achadas.length ? `"${valorChave}" aparece mais de uma vez em ${aba}.` : `"${valorChave}" não está mais em ${aba}.`);
  }
  const celula = `'${aba.replace(/'/g, "''")}'!${letraColuna(colAlvo)}${achadas[0].linha}`;
  const r = await fetch(`${base}/${encodeURIComponent(celula)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: celula, values: [[valor]] }),
  });
  if (r.status === 401) throw new TokenExpiradoError('Token expirou');
  if (r.status === 403) throw new SemPermissaoEscritaError('Esta conta não tem permissão para editar esta planilha.');
  if (!r.ok) throw new Error(`Erro ${r.status} ao gravar na planilha`);
}

/** Roteiro: muda só a coluna "status" do item com aquele id (aba Itens). */
export function gravarStatusItem(token: string, planilhaId: string, itemId: string, status: string) {
  return gravarPorChave({ token, planilhaId, aba: 'Itens', chave: 'id', valorChave: itemId, coluna: 'status', valor: status });
}

// ---------- Financas 2.0 (só leitura dos intervalos do escopo; escrita só do Status de uma ação) ----------

export const NOME_FINANCAS = 'Financas 2.0';

type Celula = string | number | boolean;

async function lerFaixas(token: string, id: string, faixas: string[]): Promise<Celula[][][]> {
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
  for (const f of faixas) params.append('ranges', f);
  const r = await api<{ valueRanges: { values?: Celula[][] }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params}`,
    token,
  );
  return r.valueRanges.map((v) => v.values ?? []);
}

/** Acha a planilha "Financas 2.0" pelo nome exato (backups têm outro nome). Sem acesso → null. */
export async function acharFinancas(token: string): Promise<string | null> {
  const salvo = await kvGet<string>('idFinancas');
  if (salvo) return salvo;
  try {
    const id = await buscarPorNome(token, NOME_FINANCAS, MIME_PLANILHA);
    if (id) await kvSet('idFinancas', id);
    return id ?? null;
  } catch {
    return null;
  }
}

export async function lerFinancas(token: string, embarque: string): Promise<Financas | null> {
  const id = await acharFinancas(token);
  if (!id) return null;
  try {
    const [projetos, japao, acoes, data, descricao, valor, natureza, projeto] = await lerFaixas(token, id, [
      'Projetos!A1:L60',
      "'Japão 2026'!A1:N80",
      "'Ações Japão'!A1:J300",
      'Lancamentos!B:B',
      'Lancamentos!F:F',
      'Lancamentos!G:G',
      'Lancamentos!H:H',
      'Lancamentos!L:L',
    ]);
    // Câmbio: intervalo nomeado, se existir; senão só Parametros!A14:B14 (nunca a aba inteira).
    let cambioLinha: Celula[] | undefined;
    try {
      cambioLinha = (await lerFaixas(token, id, ['CAMBIO_JPY_CAD']))[0]?.[0];
    } catch {
      cambioLinha = (await lerFaixas(token, id, ['Parametros!A14:B14']))[0]?.[0];
    }
    const proj = lerProjeto(projetos);
    const { categorias, total } = lerCategorias(japao);
    const base = proj ?? (total ? { orcado: total.orcado, gasto: total.realizado, saldo: total.saldo } : null);
    if (!base) return null;
    const col = (c: Celula[][]) => c.map((l) => l[0]);
    return {
      ...base,
      categorias,
      aPagar: lerAPagar(japao),
      acoes: lerAcoes(acoes, embarque),
      lancamentos: lerLancamentos({ data: col(data), descricao: col(descricao), valor: col(valor), natureza: col(natureza), projeto: col(projeto) }),
      cambio: lerCambio(cambioLinha),
      lidoEm: Date.now(),
    };
  } catch (err) {
    if (err instanceof SemAcessoError) {
      await kvSet('idFinancas', null);
      return null;
    }
    throw err;
  }
}

/** Marca uma ação da aba "Ações Japão" com o status pedido (coluna Status), achando a linha pelo Nº. */
export async function gravarStatusAcao(token: string, numero: string, status: string) {
  const id = await acharFinancas(token);
  if (!id) throw new Error('Planilha Financas 2.0 não encontrada.');
  return gravarPorChave({ token, planilhaId: id, aba: 'Ações Japão', chave: 'Nº', valorChave: numero, coluna: 'Status', valor: status });
}
