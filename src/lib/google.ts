// Login Google (token model do Google Identity Services) e leitura do Drive/Sheets.
// Tudo roda no navegador: sem servidor e sem segredo. O Client ID não é segredo.
// O app só LÊ. Os arquivos são achados por nome, e os IDs ficam só no IndexedDB.
import { kvGet, kvSet } from './db';
import { parseRoteiro } from './parse';
import type { Roteiro } from '../types';

export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

const PASTA = 'Viagem-Japao';
const ROTEIRO = 'Roteiro';
const COMPROVANTES = 'Comprovantes';
const MIME_PASTA = 'application/vnd.google-apps.folder';
const MIME_PLANILHA = 'application/vnd.google-apps.spreadsheet';

export class SemAcessoError extends Error {}
export class TokenExpiradoError extends Error {}

interface Token {
  access_token: string;
  expira: number;
}

export interface Usuario {
  email: string;
  nome: string;
  foto?: string;
}

export interface IdsDrive {
  pasta: string;
  roteiro: string;
  comprovantes?: string;
}

export interface ArquivoDrive {
  id: string;
  mimeType: string;
  size?: string;
}

// ---------- Script do Google Identity Services ----------

interface TokenClient {
  requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string;
        scope: string;
        callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
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

export async function tokenValido(): Promise<string | null> {
  if (!tokenAtual) tokenAtual = (await kvGet<Token>('token')) ?? null;
  if (tokenAtual && tokenAtual.expira - 60_000 > Date.now()) return tokenAtual.access_token;
  return null;
}

/**
 * Abre o login do Google. `silencioso` tenta renovar sem mostrar tela
 * (funciona se a pessoa já autorizou antes; senão dá erro e pedimos o toque).
 */
export async function entrar(silencioso = false, dica?: string): Promise<string> {
  if (!CLIENT_ID) throw new Error('Falta configurar o VITE_GOOGLE_CLIENT_ID.');
  const gis = await carregarGis();
  return new Promise((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error ?? 'Login cancelado'));
          return;
        }
        tokenAtual = { access_token: r.access_token, expira: Date.now() + (r.expires_in ?? 3600) * 1000 };
        await kvSet('token', tokenAtual);
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Login cancelado' : e.type)),
    });
    client.requestAccessToken({ prompt: silencioso ? '' : undefined, login_hint: dica });
  });
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
  const comprovantes = await buscarPorNome(token, COMPROVANTES, MIME_PASTA, pasta);
  const ids = { pasta, roteiro, comprovantes };
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

/** Lista nome → arquivo da pasta Comprovantes. */
export async function listarComprovantes(token: string, pastaId: string) {
  const mapa: Record<string, ArquivoDrive> = {};
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${pastaId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,size)',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const r = await api<{ nextPageToken?: string; files: (ArquivoDrive & { name: string })[] }>(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      token,
    );
    for (const f of r.files) mapa[f.name] = { id: f.id, mimeType: f.mimeType, size: f.size };
    pageToken = r.nextPageToken;
  } while (pageToken);
  return mapa;
}

export async function baixarArquivo(token: string, id: string): Promise<Blob> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) throw new TokenExpiradoError('Token expirou');
  if (!r.ok) throw new Error(`Erro ${r.status} ao baixar`);
  return r.blob();
}
