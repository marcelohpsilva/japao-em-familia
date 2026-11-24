// Tudo que fica no aparelho: cópia do roteiro, IDs achados no Drive,
// comprovantes baixados, moedas e ajustes. Nada disso vai para a planilha.
import { openDB, type IDBPDatabase } from 'idb';

interface Schema {
  kv: { key: string; value: unknown };
  arquivos: { key: string; value: { blob: Blob; mime: string; salvoEm: number } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<Schema>('japao-em-familia', 1, {
      upgrade(d) {
        d.createObjectStore('kv');
        d.createObjectStore('arquivos');
      },
    });
  }
  return dbp;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return (await (await db()).get('kv', key)) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown) {
  try {
    await (await db()).put('kv', value, key);
  } catch {
    /* sem armazenamento: o app segue funcionando só em memória */
  }
}

/** Documentos guardados no aparelho, pelo ID do arquivo no Drive. */
export async function arquivoGet(id: string) {
  try {
    return await (await db()).get('arquivos', id);
  } catch {
    return undefined;
  }
}

export async function arquivoSet(id: string, blob: Blob, mime: string) {
  await (await db()).put('arquivos', { blob, mime, salvoEm: Date.now() }, id);
}

export async function arquivosSalvos(): Promise<string[]> {
  try {
    return (await (await db()).getAllKeys('arquivos')) as string[];
  } catch {
    return [];
  }
}

/** Botão "Sair e apagar dados deste aparelho". */
export async function apagarTudo() {
  try {
    const d = await db();
    d.close();
  } catch {
    /* ignora */
  }
  dbp = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('japao-em-familia');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  if ('caches' in window) {
    for (const k of await caches.keys()) await caches.delete(k);
  }
}
