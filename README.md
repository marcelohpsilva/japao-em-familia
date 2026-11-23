# Japão em Família

Guia de bolso, só de leitura, para a família usar no celular durante a viagem ao Japão.
PWA estático (Vite + React + TypeScript), hospedado no GitHub Pages. Depois do login Google,
o celular lê a planilha **Roteiro** e a pasta **Viagem-Japao** direto do Drive e guarda uma cópia
no aparelho para funcionar sem internet.

> **Privacidade:** nenhum dado pessoal vai para este repositório. Os arquivos são achados por nome
> em tempo de execução e os IDs ficam só no IndexedDB do aparelho. O exemplo em
> `src/data/sample-roteiro.json` é fictício.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra `http://localhost:5173/?demo=1` para usar os dados de exemplo sem login.

### Modo simulação de data

Acrescente `agora=` na URL para o app agir como se fosse aquele momento (o relógio segue andando a partir dele):

- `?demo=1&agora=2026-11-23T10:00-08:00` → contagem regressiva ("Faltam 34 dias")
- `?demo=1&agora=2026-12-27T21:40-08:00` → "É hoje!"
- `?demo=1&agora=2026-12-30T11:00+09:00` → dia de parque, 3 itens recolhidos, AGORA e próximo
- `?demo=1&agora=2027-01-14T10:00-08:00` → Fim de jogo

## Configurar o login Google (uma vez)

1. Entre em <https://console.cloud.google.com/> e crie um projeto chamado `Japao em Familia`.
2. Em **APIs e serviços → Biblioteca**, ative **Google Sheets API** e **Google Drive API**.
3. Em **APIs e serviços → Tela de consentimento OAuth** (ou **Google Auth Platform**):
   - Tipo de usuário: **Externo**. Nome do app: `Japão em Família`.
   - Escopos: `spreadsheets.readonly`, `drive.readonly`, `openid`, `email`, `profile`.
   - Status de publicação: **Testing**. Em **Test users**, adicione as três contas Google da família.
4. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - **Origens JavaScript autorizadas**: `https://SEU-USUARIO.github.io` e `http://localhost:5173`.
   - Não precisa de URI de redirecionamento.
   - Copie o **Client ID** (termina em `.apps.googleusercontent.com`).
5. Para testar no computador, crie `.env.local` com `VITE_GOOGLE_CLIENT_ID=<o Client ID>`.

Na primeira entrada, cada pessoa vê uma vez o aviso "O Google não verificou este app": toque em
**Continuar**. Isso é esperado no modo Testing.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `japao-em-familia`) e envie este código para a branch `main`.
2. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → aba Variables → New repository variable**:
   nome `GOOGLE_CLIENT_ID`, valor = o Client ID.
4. Cada push na `main` publica em `https://SEU-USUARIO.github.io/japao-em-familia/`.

## Preparar o Drive

Veja as seções 3 e 10 do escopo: pasta `Viagem-Japao` com a planilha `Roteiro` e a subpasta
`Comprovantes` (nomes `AAAA-MM-DD_tipo_descricao.ext`), compartilhada com o resto da família como Leitor.

## Instalar no celular

- **iPhone:** abra o link no Safari → Compartilhar → **Adicionar à Tela de Início**. Precisa ser
  instalado assim para o iOS não apagar os dados locais.
- **Android:** abra no Chrome → menu → **Instalar app**.

## Estrutura

```
src/
  lib/time.ts      fuso horário e modo ?agora=
  lib/parse.ts     abas da planilha → objetos (colunas pelo nome)
  lib/google.ts    login (Google Identity Services) e leitura de Drive/Sheets
  lib/db.ts        IndexedDB: cópia do roteiro, comprovantes, moedas
  lib/store.tsx    estado do app e sincronização
  lib/game.ts      cartões do dia, moedas e estrelas
  components/      telas (Hoje, Mapa, Pendências, Ajustes) e arte provisória em SVG
  data/sample-roteiro.json   dados fictícios
```
