// Estado do app: de onde vêm os dados, cópia local, moedas e ajustes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Fonte, Roteiro, StatusItem } from '../types';
import { apagarTudo, arquivoGet, arquivoSet, arquivosSalvos, kvGet, kvSet } from './db';
import {
  acharIds,
  baixarArquivo,
  entrar,
  lerRoteiro,
  lerUsuario,
  listarArvore,
  sair,
  SemAcessoError,
  TokenExpiradoError,
  carregarToken,
  carregarPreferenciaEscrita,
  gravarStatusItem,
  gravarStatusAcao,
  lerFinancas,
  podeEditarPlanilha,
  SemPermissaoEscritaError,
  tokenPodeEscrever,
  esquecerToken,
  prepararLogin,
  tokenAgora,
  tokenExpiraEm,
  type ArquivoDrive,
  type Usuario,
} from './google';
import exemplo from '../data/sample-roteiro.json';
import { referenciasDoRoteiro, resolverComprovante, type Resolucao } from './comprovantes';
import type { Financas } from './financas';
import { agora } from './time';

export type Sync = 'ocioso' | 'carregando' | 'precisa_login' | 'sem_acesso' | 'erro';

export interface Ajustes {
  som: boolean;
  animReduzidas: boolean;
}

interface Estado {
  pronto: boolean;
  fonte: Fonte | null;
  roteiro: Roteiro | null;
  atualizadoEm: number | null;
  usuario: Usuario | null;
  sync: Sync;
  erro?: string;
  /** todos os documentos dentro de Viagem-Japao (qualquer subpasta) */
  arvore: ArquivoDrive[];
  /** IDs dos arquivos já guardados no aparelho */
  baixados: Set<string>;
  /** a conta logada pode editar a planilha (só então aparece "Concluir pendência") */
  podeEditar: boolean;
  /** só existe para quem consegue abrir a Financas 2.0 */
  financas: Financas | null;
  /** datas (AAAA-MM-DD) em que o app foi aberto: para as conquistas */
  aberturas: string[];
  /** conquistas já ganhas: id → quando */
  conquistas: Record<string, number>;
  feitos: Record<string, number>;
  ajustes: Ajustes;
  online: boolean;
}

export type ResultadoComprovante =
  | { ok: true; url: string; mime: string; nome: string }
  | { ok: false; motivo: string };

interface Api extends Estado {
  usarExemplo(): Promise<void>;
  entrarGoogle(): Promise<void>;
  atualizar(interativo?: boolean): Promise<void>;
  marcar(chave: string, feito: boolean): void;
  resolver(ref: string): Resolucao;
  procurarDeNovo(): Promise<void>;
  abrirArquivo(arq: ArquivoDrive): Promise<ResultadoComprovante>;
  concluirPendencia(itemId: string, novoStatus: StatusItem): Promise<{ ok: true } | { ok: false; motivo: string }>;
  concluirAcao(numero: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
  registrarAbertura(datas: string[]): void;
  ganharConquistas(ids: string[]): void;
  baixarTudo(progresso: (feitos: number, total: number) => void): Promise<void>;
  sairEApagar(): Promise<void>;
  setAjuste<K extends keyof Ajustes>(k: K, v: Ajustes[K]): void;
}

const Ctx = createContext<Api | null>(null);

const AJUSTES_PADRAO: Ajustes = { som: false, animReduzidas: false };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [e, setE] = useState<Estado>({
    pronto: false,
    fonte: null,
    roteiro: null,
    atualizadoEm: null,
    usuario: null,
    sync: 'ocioso',
    arvore: [],
    baixados: new Set(),
    podeEditar: false,
    financas: null,
    aberturas: [],
    conquistas: {},
    feitos: {},
    ajustes: AJUSTES_PADRAO,
    online: navigator.onLine,
  });
  const estado = useRef(e);
  estado.current = e;
  const patch = useCallback((p: Partial<Estado>) => setE((s) => ({ ...s, ...p })), []);

  // Carrega a cópia local logo ao abrir (funciona sem internet).
  useEffect(() => {
    (async () => {
      const [fonte, roteiro, atualizadoEm, usuario, arvore, feitos, ajustes, baixados] = await Promise.all([
        kvGet<Fonte>('fonte'),
        kvGet<Roteiro>('roteiro'),
        kvGet<number>('atualizadoEm'),
        kvGet<Usuario>('usuario'),
        kvGet<ArquivoDrive[]>('arvore'),
        kvGet<Record<string, number>>('feitos'),
        kvGet<Ajustes>('ajustes'),
        arquivosSalvos(),
        carregarToken(),
        carregarPreferenciaEscrita(),
      ]);
      const podeEditar = !!(await kvGet<boolean>('podeEditar'));
      const [financas, aberturas, conquistas] = await Promise.all([
        kvGet<Financas>('financas'),
        kvGet<string[]>('aberturas'),
        kvGet<Record<string, number>>('conquistas'),
      ]);
      const demoNaUrl = new URLSearchParams(location.search).has('demo');
      setE((s) => ({
        ...s,
        pronto: true,
        fonte: demoNaUrl ? 'demo' : (fonte ?? null),
        roteiro: demoNaUrl || fonte === 'demo' ? (exemplo as Roteiro) : (roteiro ?? null),
        atualizadoEm: atualizadoEm ?? null,
        usuario: usuario ?? null,
        arvore: Array.isArray(arvore) ? arvore : [],
        feitos: feitos ?? {},
        ajustes: { ...AJUSTES_PADRAO, ...ajustes },
        baixados: new Set(baixados),
        podeEditar,
        financas: fonte === 'google' && !demoNaUrl ? (financas ?? null) : null,
        aberturas: aberturas ?? [],
        conquistas: conquistas ?? {},
      }));
    })();
    const on = () => patch({ online: true });
    const off = () => patch({ online: false });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [patch]);

  const sincronizar = useCallback(
    async (token: string) => {
      const ler = async () => {
        const ids = await acharIds(token);
        return Promise.all([
          lerRoteiro(token, ids),
          estado.current.usuario ? Promise.resolve(estado.current.usuario) : lerUsuario(token),
          listarArvore(token, ids.pasta),
          podeEditarPlanilha(token, ids.roteiro),
        ]);
      };
      let resultado;
      try {
        resultado = await ler();
      } catch (err) {
        // A planilha ou a pasta pode ter sido recriada: esquece os IDs guardados e procura de novo pelo nome.
        if (!(err instanceof SemAcessoError)) throw err;
        await kvSet('ids', null);
        resultado = await ler();
      }
      const [roteiro, usuario, arvore, podeEditar] = resultado;
      const agoraMs = Date.now();
      await Promise.all([
        kvSet('roteiro', roteiro),
        kvSet('usuario', usuario),
        kvSet('arvore', arvore),
        kvSet('podeEditar', podeEditar),
        kvSet('atualizadoEm', agoraMs),
      ]);
      patch({ roteiro, usuario, arvore, podeEditar, atualizadoEm: agoraMs, sync: 'ocioso', erro: undefined });
      // Finanças: só aparece se esta conta abrir a Financas 2.0. Falhar aqui não atrapalha o resto.
      try {
        const financas = await lerFinancas(token, roteiro.viagem.embarque_data);
        await kvSet('financas', financas);
        patch({ financas });
      } catch {
        /* mantém a última leitura guardada */
      }
    },
    [patch],
  );

  const tratarErro = useCallback(
    async (err: unknown) => {
      if (err instanceof TokenExpiradoError) {
        esquecerToken();
        patch({ sync: 'precisa_login' });
      } else if (err instanceof SemAcessoError) {
        await kvSet('ids', null);
        patch({ sync: 'sem_acesso', erro: err.message });
      } else {
        patch({ sync: 'erro', erro: err instanceof Error ? err.message : String(err) });
      }
    },
    [patch],
  );

  // Renovação da chave do Google (dura 1 h): no próximo toque na tela, sem escolher conta.
  const armado = useRef(false);
  const renovarNoToque = useCallback(() => {
    if (armado.current || !navigator.onLine) return;
    armado.current = true;
    prepararLogin();
    const aoTocar = () => {
      armado.current = false;
      if (tokenAgora() || estado.current.fonte !== 'google' || !navigator.onLine) return;
      const pedido = entrar(true, estado.current.usuario?.email); // abre já, dentro do toque
      patch({ sync: 'carregando' });
      pedido
        .then((token) => sincronizar(token))
        .catch(() => patch({ sync: 'precisa_login' }));
    };
    window.addEventListener('pointerdown', aoTocar, { once: true, capture: true });
  }, [patch, sincronizar]);

  const atualizar = useCallback(
    async (interativo = false) => {
      if (estado.current.fonte !== 'google' || !navigator.onLine) return;
      const token = tokenAgora();
      if (!token) {
        if (!interativo) {
          renovarNoToque();
          return;
        }
        // Botão "Entrar de novo" / "Atualizar agora": abre a janela na hora (sem esperar nada antes).
        const pedido = entrar(false, estado.current.usuario?.email);
        patch({ sync: 'carregando' });
        try {
          await sincronizar(await pedido);
        } catch (err) {
          await tratarErro(err);
        }
        return;
      }
      patch({ sync: 'carregando' });
      try {
        await sincronizar(token);
      } catch (err) {
        if (err instanceof TokenExpiradoError) {
          esquecerToken();
          patch({ sync: 'ocioso' });
          renovarNoToque();
        } else {
          await tratarErro(err);
        }
      }
    },
    [patch, sincronizar, tratarErro, renovarNoToque],
  );

  // Ao voltar para o app (ou reconectar), atualiza se a última leitura tiver mais de 15 min.
  useEffect(() => {
    if (!e.pronto || e.fonte !== 'google') return;
    prepararLogin();
    const talvez = () => {
      if (document.visibilityState !== 'visible') return;
      const ultima = estado.current.atualizadoEm ?? 0;
      if (Date.now() - ultima > 15 * 60000 && estado.current.sync !== 'carregando') void atualizar(false);
    };
    document.addEventListener('visibilitychange', talvez);
    window.addEventListener('online', talvez);
    // Perto de vencer a chave, já deixa a renovação pronta para o próximo toque.
    const vence = tokenExpiraEm();
    const t = vence ? setTimeout(renovarNoToque, Math.max(0, vence - Date.now() - 5 * 60000)) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', talvez);
      window.removeEventListener('online', talvez);
      if (t) clearTimeout(t);
    };
  }, [e.pronto, e.fonte, e.atualizadoEm, atualizar, renovarNoToque]);

  // Ao abrir com internet, atualiza em segundo plano.
  const jaTentou = useRef(false);
  useEffect(() => {
    if (e.pronto && e.fonte === 'google' && !jaTentou.current) {
      jaTentou.current = true;
      void atualizar(false);
    }
  }, [e.pronto, e.fonte, atualizar]);

  const api = useMemo<Api>(
    () => ({
      ...e,
      async usarExemplo() {
        await kvSet('fonte', 'demo');
        patch({ fonte: 'demo', roteiro: exemplo as Roteiro, sync: 'ocioso' });
      },
      async entrarGoogle() {
        const pedido = entrar(false);
        patch({ sync: 'carregando', erro: undefined });
        try {
          const token = await pedido;
          await kvSet('fonte', 'google');
          patch({ fonte: 'google' });
          await sincronizar(token);
        } catch (err) {
          await tratarErro(err);
        }
      },
      atualizar,
      marcar(chave, feito) {
        setE((s) => {
          const feitos = { ...s.feitos };
          if (feito) feitos[chave] = agora();
          else delete feitos[chave];
          void kvSet('feitos', feitos);
          return { ...s, feitos };
        });
      },
      resolver(ref) {
        return resolverComprovante(ref, estado.current.arvore);
      },
      async procurarDeNovo() {
        // Documento enviado depois da última atualização: relê as pastas.
        const token = tokenAgora();
        if (!token || !navigator.onLine) return;
        const ids = await kvGet<{ pasta?: string }>('ids');
        if (!ids?.pasta) return;
        const arvore = await listarArvore(token, ids.pasta);
        await kvSet('arvore', arvore);
        setE((x) => ({ ...x, arvore }));
      },
      async abrirArquivo(arq) {
        const local = await arquivoGet(arq.id);
        if (local) return { ok: true, url: URL.createObjectURL(local.blob), mime: local.mime, nome: arq.nome };
        if (!navigator.onLine) return { ok: false, motivo: 'Sem internet, e este documento ainda não foi baixado para o aparelho.' };
        const token = tokenAgora();
        if (!token) {
          renovarNoToque();
          return { ok: false, motivo: 'A conexão com o Google expirou. Toque em qualquer lugar para reconectar e abra de novo.' };
        }
        try {
          const blob = await baixarArquivo(token, arq.id);
          await arquivoSet(arq.id, blob, arq.mimeType);
          setE((s) => ({ ...s, baixados: new Set([...s.baixados, arq.id]) }));
          return { ok: true, url: URL.createObjectURL(blob), mime: arq.mimeType, nome: arq.nome };
        } catch (err) {
          return { ok: false, motivo: err instanceof Error ? err.message : 'Erro ao abrir' };
        }
      },
      async baixarTudo(progresso) {
        const s = estado.current;
        if (s.fonte !== 'google') return;
        const token = tokenAgora() ?? (await entrar(false, s.usuario?.email));
        const usados = new Map<string, ArquivoDrive>();
        for (const ref of referenciasDoRoteiro(s.roteiro?.itens ?? [])) {
          for (const a of resolverComprovante(ref, s.arvore).arquivos) usados.set(a.id, a);
        }
        const faltam = [...usados.values()].filter((a) => !s.baixados.has(a.id));
        let n = 0;
        progresso(0, faltam.length);
        for (const arq of faltam) {
          const blob = await baixarArquivo(token, arq.id);
          await arquivoSet(arq.id, blob, arq.mimeType);
          n++;
          setE((x) => ({ ...x, baixados: new Set([...x.baixados, arq.id]) }));
          progresso(n, faltam.length);
        }
      },
      concluirPendencia(itemId, novoStatus) {
        const s = estado.current;
        const aplicarLocal = async () => {
          setE((x) => {
            if (!x.roteiro) return x;
            const roteiro = { ...x.roteiro, itens: x.roteiro.itens.map((i) => (i.id === itemId ? { ...i, status: novoStatus } : i)) };
            if (x.fonte === 'google') void kvSet('roteiro', roteiro);
            return { ...x, roteiro };
          });
        };
        if (s.fonte === 'demo') {
          return aplicarLocal().then(() => ({ ok: true as const }));
        }
        if (!navigator.onLine) {
          return Promise.resolve({ ok: false as const, motivo: 'Sem internet. Conclua quando tiver sinal: a planilha precisa ser atualizada online.' });
        }
        // Se ainda não temos permissão de escrita, pede AGORA (dentro do toque, para o Safari não bloquear).
        const token = tokenAgora();
        const pedido = token && tokenPodeEscrever() ? Promise.resolve(token) : entrar(false, s.usuario?.email, true);
        return (async () => {
          try {
            const t = await pedido;
            if (!tokenPodeEscrever()) {
              return { ok: false as const, motivo: 'O Google não deu permissão para editar a planilha. Tente de novo e marque a opção de editar.' };
            }
            const ids = await kvGet<{ roteiro?: string }>('ids');
            if (!ids?.roteiro) return { ok: false as const, motivo: 'Planilha Roteiro não encontrada. Toque em Atualizar agora e tente de novo.' };
            await gravarStatusItem(t, ids.roteiro, itemId, novoStatus);
            await aplicarLocal();
            void atualizar(false); // relê a planilha em segundo plano para confirmar
            return { ok: true as const };
          } catch (err) {
            if (err instanceof SemPermissaoEscritaError) {
              setE((x) => ({ ...x, podeEditar: false }));
              void kvSet('podeEditar', false);
            }
            if (err instanceof TokenExpiradoError) esquecerToken();
            return { ok: false as const, motivo: err instanceof Error ? err.message : 'Erro ao gravar' };
          }
        })();
      },
      concluirAcao(numero) {
        const s = estado.current;
        if (!navigator.onLine) {
          return Promise.resolve({ ok: false as const, motivo: 'Sem internet. Conclua quando tiver sinal: a Financas 2.0 precisa ser atualizada online.' });
        }
        const token = tokenAgora();
        const pedido = token && tokenPodeEscrever() ? Promise.resolve(token) : entrar(false, s.usuario?.email, true);
        return (async () => {
          try {
            const t = await pedido;
            if (!tokenPodeEscrever()) {
              return { ok: false as const, motivo: 'O Google não deu permissão para editar. Tente de novo e marque a opção de editar.' };
            }
            await gravarStatusAcao(t, numero, 'Feito');
            setE((x) => {
              if (!x.financas) return x;
              const financas = { ...x.financas, acoes: x.financas.acoes.filter((a) => a.numero !== numero) };
              void kvSet('financas', financas);
              return { ...x, financas };
            });
            return { ok: true as const };
          } catch (err) {
            if (err instanceof TokenExpiradoError) esquecerToken();
            return { ok: false as const, motivo: err instanceof Error ? err.message : 'Erro ao gravar' };
          }
        })();
      },
      registrarAbertura(datas) {
        setE((x) => {
          const novas = datas.filter((d) => !x.aberturas.includes(d));
          if (!novas.length) return x;
          const aberturas = [...x.aberturas, ...novas];
          void kvSet('aberturas', aberturas);
          return { ...x, aberturas };
        });
      },
      ganharConquistas(ids) {
        setE((x) => {
          const novas = ids.filter((id) => !x.conquistas[id]);
          if (!novas.length) return x;
          const conquistas = { ...x.conquistas };
          for (const id of novas) conquistas[id] = agora();
          void kvSet('conquistas', conquistas);
          return { ...x, conquistas };
        });
      },
      async sairEApagar() {
        await sair();
        await apagarTudo();
        location.replace(location.pathname);
      },
      setAjuste(k, v) {
        setE((s) => {
          const ajustes = { ...s.ajustes, [k]: v };
          void kvSet('ajustes', ajustes);
          return { ...s, ajustes };
        });
      },
    }),
    [e, patch, atualizar, sincronizar, tratarErro, renovarNoToque],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore fora do StoreProvider');
  return c;
}
