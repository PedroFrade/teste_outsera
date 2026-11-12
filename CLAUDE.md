# Convenções do projeto

API REST em Node.js + TypeScript (Fastify 5, better-sqlite3 `:memory:`) que importa o CSV de
indicados do Golden Raspberry Awards (Pior Filme) no startup e expõe os dados. O código passa por
revisão de PR e a precisão do cálculo de intervalos com qualquer CSV válido é o critério principal.

## Regras

- Solução mais simples que atenda ao requisito. Sem overengineering; toda linha tem justificativa.
- **Não criar dependências sem aprovação.** Fora de escopo: worker threads, filas, Redis, upload,
  iconv-lite, rate limit, autocannon.
- **Somente testes de integração** (`node:test` + `app.inject()`), em `test/integration/`. Nada de
  testes unitários nem de carga. Os testes entram pela API (`buildApp` + `app.inject()`), sem chamar
  funções internas. **Pendente (fase 4):** `csv-import.test.ts` ainda chama `importCsv` direto e
  deve ser reescrito via `GET /movies`.
- Nunca alterar um valor esperado de teste para passar sem explicar o motivo ao autor.
- **Não fazer `git commit` nem `git push`:** o autor revisa e faz manualmente. Sugerir a mensagem
  (Conventional Commits, em inglês) ao fim de cada fase.
- Registrar cada nova instrução em `docs/ai/PROMPTS.md` e cada decisão em `docs/ai/DECISIONS.md`.
  Ao fim de cada fase, lembrar o autor de rodar `/export` para `docs/ai/sessions/`.

## Código

- TypeScript `strict`, ESM, imports locais com extensão `.js`.
- Acesso ao banco só nos `repository.ts`, com prepared statements criados uma vez.
- Erros: lançar `NotFoundError`/`ValidationError` (`src/shared/errors.ts`); o error handler global
  responde em Problem Details (`application/problem+json`) com `traceId`.
- Toda rota tem JSON Schema de entrada e de saída.
- Config só por variáveis de ambiente, validadas em `src/config/env.ts`.

## Comandos

`npm run dev | build | start | test | lint | format | typecheck`. Ao fim de cada fase rodar
`typecheck`, `lint` e `test`.
