// Estado do app: de onde vêm os dados, cópia local, moedas e ajustes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Fonte, Roteiro } from '../types';
import { apagarTudo, arquivoGet, arquivoSet, arquivosSalvos, kvGet, kvSet } from './db';
import {
  acharIds,
  baixarArquivo,
  entrar,
  lerRoteiro,
  lerUsuario,
  listarComprovantes,
  sair,
  SemAcessoError,
  TokenExpiradoError,
  tokenValido,
  type ArquivoDrive,
  type Usuario,
} from './google';
import exemplo from '../data/sample-roteiro.json';

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
  comprovantes: Record<string, ArquivoDrive>;
  baixados: Set<string>;
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
  abrirComprovante(nome: string): Promise<ResultadoComprovante>;
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
    comprovantes: {},
    baixados: new Set(),
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
      const [fonte, roteiro, atualizadoEm, usuario, comprovantes, feitos, ajustes, baixados] = await Promise.all([
        kvGet<Fonte>('fonte'),
        kvGet<Roteiro>('roteiro'),
        kvGet<number>('atualizadoEm'),
        kvGet<Usuario>('usuario'),
        kvGet<Record<string, ArquivoDrive>>('comprovantes'),
        kvGet<Record<string, number>>('feitos'),
        kvGet<Ajustes>('ajustes'),
        arquivosSalvos(),
      ]);
      const demoNaUrl = new URLSearchParams(location.search).has('demo');
      setE((s) => ({
        ...s,
        pronto: true,
        fonte: demoNaUrl ? 'demo' : (fonte ?? null),
        roteiro: demoNaUrl || fonte === 'demo' ? (exemplo as Roteiro) : (roteiro ?? null),
        atualizadoEm: atualizadoEm ?? null,
        usuario: usuario ?? null,
        comprovantes: comprovantes ?? {},
        feitos: feitos ?? {},
        ajustes: { ...AJUSTES_PADRAO, ...ajustes },
        baixados: new Set(baixados),
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
      const ids = await acharIds(token);
      const [roteiro, usuario, comprovantes] = await Promise.all([
        lerRoteiro(token, ids),
        estado.current.usuario ? Promise.resolve(estado.current.usuario) : lerUsuario(token),
        ids.comprovantes ? listarComprovantes(token, ids.comprovantes) : Promise.resolve({}),
      ]);
      const agoraMs = Date.now();
      await Promise.all([
        kvSet('roteiro', roteiro),
        kvSet('usuario', usuario),
        kvSet('comprovantes', comprovantes),
        kvSet('atualizadoEm', agoraMs),
      ]);
      patch({ roteiro, usuario, comprovantes, atualizadoEm: agoraMs, sync: 'ocioso', erro: undefined });
    },
    [patch],
  );

  const tratarErro = useCallback(
    async (err: unknown) => {
      if (err instanceof TokenExpiradoError) {
        await kvSet('token', null);
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

  const atualizar = useCallback(
    async (interativo = false) => {
      if (estado.current.fonte !== 'google') return;
      if (!navigator.onLine) return;
      patch({ sync: 'carregando' });
      try {
        let token = await tokenValido();
        if (!token) {
          if (!interativo) {
            // Tenta renovar sem tela; se não der, pede o toque sem esconder os dados.
            try {
              token = await entrar(true, estado.current.usuario?.email);
            } catch {
              patch({ sync: 'precisa_login' });
              return;
            }
          } else {
            token = await entrar(false, estado.current.usuario?.email);
          }
        }
        await sincronizar(token);
      } catch (err) {
        await tratarErro(err);
      }
    },
    [patch, sincronizar, tratarErro],
  );

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
        patch({ sync: 'carregando', erro: undefined });
        try {
          const token = await entrar(false);
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
          if (feito) feitos[chave] = Date.now();
          else delete feitos[chave];
          void kvSet('feitos', feitos);
          return { ...s, feitos };
        });
      },
      async abrirComprovante(nome) {
        const local = await arquivoGet(nome);
        if (local) return { ok: true, url: URL.createObjectURL(local.blob), mime: local.mime, nome };
        if (estado.current.fonte === 'demo') {
          return { ok: false, motivo: 'No modo exemplo não há comprovantes. Entre com o Google para ver os reais.' };
        }
        const arq = estado.current.comprovantes[nome];
        if (!arq) return { ok: false, motivo: 'Comprovante não achado na pasta Comprovantes.' };
        if (!navigator.onLine) return { ok: false, motivo: 'Sem internet e este comprovante ainda não foi baixado.' };
        try {
          let token = await tokenValido();
          if (!token) token = await entrar(true, estado.current.usuario?.email).catch(() => entrar(false));
          const blob = await baixarArquivo(token, arq.id);
          await arquivoSet(nome, blob, arq.mimeType);
          setE((s) => ({ ...s, baixados: new Set([...s.baixados, nome]) }));
          return { ok: true, url: URL.createObjectURL(blob), mime: arq.mimeType, nome };
        } catch (err) {
          return { ok: false, motivo: err instanceof Error ? err.message : 'Erro ao abrir' };
        }
      },
      async baixarTudo(progresso) {
        const s = estado.current;
        if (s.fonte !== 'google') return;
        let token = await tokenValido();
        if (!token) token = await entrar(false, s.usuario?.email);
        const usados = new Set(
          (s.roteiro?.itens ?? []).flatMap((i) => (i.comprovante ?? '').split(';').map((x) => x.trim())).filter(Boolean),
        );
        const faltam = [...usados].filter((n) => s.comprovantes[n] && !s.baixados.has(n));
        let n = 0;
        progresso(0, faltam.length);
        for (const nome of faltam) {
          const arq = s.comprovantes[nome];
          const blob = await baixarArquivo(token, arq.id);
          await arquivoSet(nome, blob, arq.mimeType);
          n++;
          setE((x) => ({ ...x, baixados: new Set([...x.baixados, nome]) }));
          progresso(n, faltam.length);
        }
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
    [e, patch, atualizar, sincronizar, tratarErro],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore fora do StoreProvider');
  return c;
}
