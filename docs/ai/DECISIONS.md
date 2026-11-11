# Decisões técnicas

Cada decisão relevante, com as alternativas consideradas e o motivo.

## D1 — ESM + `module: NodeNext`

- **Escolha:** `"type": "module"`, imports com extensão `.js`.
- **Alternativas:** CommonJS (imports sem extensão).
- **Motivo:** é o padrão atual do Node 24; Fastify 5, better-sqlite3 e csv-parse funcionam em ESM.
  O custo é só escrever `.js` nos imports.

## D2 — Testes com `node --import tsx --test`

- **Escolha:** `node:test` executado via `tsx`, que roda TypeScript sem passo de build.
- **Alternativas:** compilar antes de testar; Vitest/Jest.
- **Motivo:** o prompt fixa `node:test`; `tsx` já é dependência de dev e `npm test` roda sem
  configuração prévia.

## D3 — Config validada à mão, sem biblioteca de schema

- **Escolha:** `loadConfig()` com 4 variáveis, reportando todos os problemas de uma vez.
- **Alternativas:** zod, envalid.
- **Motivo:** são 4 variáveis; uma dependência nova exigiria aprovação e não se justifica.

## D4 — `type: "about:blank"` em Problem Details

- **Escolha:** `type` fixo `about:blank`, `title` = frase do status HTTP.
- **Alternativas:** URIs próprias por tipo de problema (`/problems/not-found`).
- **Motivo:** a RFC 9457 define `about:blank` para problemas sem semântica além do status HTTP. URIs
  próprias só valem a pena se houver documentação por tipo; aqui o status já descreve o erro.

## D5 — 405 via `onRoute` + not-found handler

- **Escolha:** coletar as rotas no hook `onRoute` e, no handler de 404, checar se o path existe com
  outros métodos; se sim, 405 com `Allow`.
- **Alternativas:** registrar rotas catch-all por verbo; plugin de terceiros.
- **Motivo:** o Fastify não tem 405 nativo. Esta opção tem ~30 linhas, nenhuma dependência e `Allow`
  sai correto (inclui `HEAD`, criado automaticamente para cada `GET`).

## D6 — Fechamento do banco no hook `onClose`

- **Escolha:** `app.addHook('onClose', () => db.close())` dentro de `buildApp`.
- **Alternativas:** `server.ts` fechar o banco depois de `app.close()`.
- **Motivo:** o Fastify executa `onClose` depois de drenar as requisições, garantindo a ordem
  "app.close() e depois o banco". Também funciona nos testes, que só chamam `app.close()`.

## D7 — `buildApp` não chama `app.ready()`

- **Escolha:** devolver a app sem `ready()`.
- **Motivo:** `inject()` e `listen()` chamam `ready()` sozinhos. Isso permite que um teste registre
  uma rota de teste (ex.: `/boom` para provar que o 500 não vaza stack) antes da primeira requisição.

## D8 — Falhas de startup sem logger

- **Escolha:** erro de configuração vai para `console.error` e `exit(1)`; erros posteriores usam o
  logger do Fastify.
- **Motivo:** o logger (pino) só existe depois da config. Não importo `pino` direto porque é
  dependência transitiva do Fastify, e declarar outra dependência exigiria aprovação.

## D9 — Rota de health em `modules/health/`

- **Escolha:** pasta nova `modules/health/`, fora da estrutura do prompt.
- **Motivo:** manter `app.ts` só com a montagem; é um arquivo pequeno e segue o padrão por módulo.

## D10 — Dependências de ESLint

- **Escolha:** `eslint`, `@eslint/js` e `typescript-eslint`; sem `eslint-config-prettier`.
- **Motivo:** ESLint com TypeScript exige `typescript-eslint` e `@eslint/js` (config recomendada).
  As regras recomendadas não tocam em formatação, então não há conflito com o Prettier.
