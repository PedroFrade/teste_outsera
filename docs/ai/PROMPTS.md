# Registro de prompts

Registro das instruções dadas ao agente de IA (Claude Code) neste repositório. O prompt inicial
está na íntegra; cada nova instrução é adicionada com data e um resumo do que foi feito.

## 2026-11-11 — Prompt inicial (íntegra)

Arquivo-fonte: `prompt-claude-code-outsera.md`. Reproduzido abaixo sem alterações, dentro de um
bloco de citação.

> # Contexto
>
> Você vai construir do zero uma API RESTful em Node.js + TypeScript para um teste técnico de
> Back-End. Ela lê a lista de indicados e vencedores da categoria Pior Filme do Golden Raspberry
> Awards a partir de um CSV e expõe os dados. O código vai passar por uma revisão como a de um
> pull request (qualidade, clareza, desempenho) e eu preciso conseguir defender cada decisão numa
> entrevista. Prefira sempre a solução mais simples que atenda corretamente a todos os
> requisitos. Não faça overengineering: tudo o que entrar no código precisa ter uma justificativa
> ligada a um requisito.
>
> O avaliador vai rodar a aplicação com OUTROS arquivos CSV, com cenários diferentes. A precisão
> do resultado com qualquer entrada válida é o critério mais importante de todos.
>
> # Requisitos obrigatórios do teste (não negociáveis)
>
> 1. Ler o CSV e inserir os dados no banco **ao iniciar a aplicação**, antes de começar a
>    aceitar requisições.
> 2. Endpoint que retorna o produtor com MAIOR intervalo entre dois prêmios consecutivos e o que
>    obteve dois prêmios MAIS RÁPIDO, exatamente no formato abaixo.
> 3. API REST no nível 2 de maturidade de Richardson (recursos com substantivos, verbos HTTP e
>    status codes corretos).
> 4. **Somente testes de integração.** Não crie testes unitários nem testes de carga. Os testes
>    precisam garantir que os dados retornados batem com os do CSV fornecido.
> 5. Banco **em memória** com SGBD embarcado: SQLite via better-sqlite3 com `:memory:`. Nenhuma
>    instalação externa, nenhum arquivo `.db` em disco.
> 6. README com instruções para rodar o projeto e os testes.
> 7. Código em repositório git.
> 8. Registro das interações com o agente de IA dentro do repositório (ver "Registro de IA").
>
> ## Formato da resposta (exato)
>
> ```json
> {
>   "min": [{ "producer": "Producer 1", "interval": 1, "previousWin": 2008, "followingWin": 2009 }],
>   "max": [{ "producer": "Producer 1", "interval": 99, "previousWin": 1900, "followingWin": 1999 }]
> }
> ```
>
> `min` e `max` são sempre arrays, porque pode haver empates.
>
> # Stack
>
> - Node.js LTS ativo, declarado em `engines` e `.nvmrc`. TypeScript com `strict: true`.
> - Fastify v5, com JSON Schema em todas as rotas (validação de entrada e serialização de saída).
> - better-sqlite3 (`:memory:`), com todo o acesso ao banco isolado em uma camada de repositório
>   e prepared statements criados uma única vez.
> - csv-parse (API de streaming) para ler o CSV conforme a RFC 4180.
> - pino (o logger do Fastify) para logs JSON estruturados.
> - @fastify/helmet.
> - Testes: `node:test` + `app.inject()` do Fastify, sem subir uma porta.
> - Dev: `typescript`, `tsx`, `@types/node`, `@types/better-sqlite3`, ESLint + Prettier.
> - Não adicione nenhuma outra dependência sem justificar antes e esperar minha aprovação.
>   Explicitamente fora do escopo: worker threads/piscina, filas, Redis, upload multipart,
>   iconv-lite, rate limit, autocannon.
>
> # Configuração
>
> Toda configuração vem de variáveis de ambiente, validadas no startup. Se alguma for inválida, o
> processo não sobe e loga uma mensagem clara.
>
> - `PORT` (padrão 3000)
> - `HOST` (padrão 0.0.0.0)
> - `CSV_PATH` (padrão `./data/movielist.csv`; o CSV fornecido fica versionado nesse caminho)
> - `LOG_LEVEL` (padrão `info`; nos testes, `silent`)
>
> `buildApp({ csvPath, logger })` em `app.ts` monta e devolve a app já com os dados carregados,
> sem chamar `listen`. `server.ts` só lê a config, chama `buildApp` e `listen`. Assim os testes
> sobem uma instância isolada por fixture.
>
> # Modelo de dados (normalizado)
>
> - `movies(id INTEGER PK, year INTEGER NOT NULL, title TEXT NOT NULL, winner INTEGER NOT NULL CHECK (winner IN (0,1)))`
> - `producers(id INTEGER PK, name TEXT NOT NULL UNIQUE)`
> - `movie_producers(movie_id, producer_id, PK(movie_id, producer_id))`, com FKs
> - `studios` e `movie_studios`, na mesma estrutura
> - Índices que sirvam às consultas usadas: por exemplo `movies(winner, year)` e
>   `movie_producers(producer_id)`.
> - Schema criado por um script SQL versionado, aplicado no startup. Nunca inferido do CSV.
> - PRAGMA `foreign_keys = ON`. Não use WAL nem mmap: não se aplicam a banco em memória.
>
> # Regras de importação (definem o resultado; siga exatamente)
>
> - Delimitador `;`. Cabeçalho esperado: `year;title;studios;producers;winner`. A comparação dos
>   nomes de coluna ignora caixa e espaços nas pontas. Colunas extras são ignoradas. Se faltar
>   alguma coluna obrigatória, o startup falha com erro claro.
> - Aceitar BOM UTF-8, finais de linha CRLF e LF, campos entre aspas e linhas em branco
>   (ignoradas).
> - `winner`: `yes` (sem diferenciar caixa e com trim) = vencedor; vazio ou qualquer outro valor =
>   não vencedor.
> - `year`: inteiro obrigatório. Uma linha com ano inválido ou título vazio é ignorada e gera um
>   `warn` com o número da linha. No final, logar um resumo (lidas, importadas, ignoradas).
> - Separação de produtores (e de estúdios): separar o campo por `, and `, `,`, e `and`
>   (cobrindo a vírgula de Oxford, como em "A, B, and C"). Fazer trim e colapsar espaços
>   internos; descartar nomes vazios; deduplicar o mesmo nome dentro do mesmo filme. Não tente
>   corrigir erros de digitação dos dados (por exemplo "Brian Robbinsand Sharla Sumpter Bridgett"
>   fica como está).
> - Toda a inserção acontece em uma única transação, com prepared statements.
>
> # Regras de cálculo dos intervalos
>
> - Considerar apenas filmes vencedores. Para cada produtor, ordenar os anos das vitórias e
>   calcular o intervalo entre cada par de vitórias consecutivas (`followingWin - previousWin`).
> - Duas vitórias do mesmo produtor no mesmo ano (filmes diferentes) geram intervalo 0, que é
>   válido. Documentar essa decisão no README.
> - `min` = todos os pares com o menor intervalo; `max` = todos os pares com o maior intervalo
>   (empates incluídos). Um mesmo produtor pode aparecer mais de uma vez se tiver mais de um par
>   empatado.
> - Ordenação determinística dentro de cada array: `previousWin`, depois `producer`.
> - Se nenhum produtor tiver duas vitórias, a resposta é `200` com `{ "min": [], "max": [] }`.
> - Implementar em SQL com a função de janela `LAG(year) OVER (PARTITION BY producer_id ORDER BY year)`
>   no repositório. Como os dados não mudam depois do startup, calcular uma vez após a carga e
>   guardar o resultado em memória, servindo cada requisição em O(1). Explicar isso no README.
>
> # Endpoints
>
> Todos com schema de entrada e saída:
>
> - `GET /producers/award-intervals` → 200 no formato acima.
> - `GET /movies` → lista paginada. Filtros opcionais `winner` (boolean) e `year` (inteiro).
>   Paginação por cursor (keyset no `id`): `limit` (padrão 50, máx. 500) e `cursor` opaco em
>   base64url. Resposta `{ "data": [...], "page": { "limit", "nextCursor", "hasMore" } }`. Cada
>   filme vem com `producers` e `studios` como arrays.
> - `GET /movies/:id` → 200 ou 404.
> - `GET /health` → 200 `{ "status": "ok" }`.
> - A API é somente leitura, porque a fonte de verdade é o CSV. Justificar isso no README.
> - Método não suportado em rota existente → 405 com header `Allow`. Rota inexistente → 404.
>
> # Tratamento de erros
>
> - Hierarquia `AppError` → `NotFoundError`, `ValidationError`, e um único error handler global.
> - Todo erro responde em Problem Details (RFC 9457), com `Content-Type: application/problem+json`
>   e os campos `type`, `title`, `status`, `detail` e `instance`, mais `traceId` (= request id).
>   Em erros de validação, listar os campos inválidos em `errors`.
> - 500 sem stack trace na resposta; stack completa no log com o mesmo `traceId`.
> - Aceitar e propagar o header `x-request-id`.
> - Graceful shutdown em SIGTERM/SIGINT (`app.close()` e depois fechar o banco), com timeout.
>   `unhandledRejection`/`uncaughtException`: logar e encerrar.
>
> # Testes de integração (node:test + app.inject)
>
> 1. Com o CSV fornecido, `GET /producers/award-intervals` deve retornar EXATAMENTE:
>    ```json
>    {
>      "min": [
>        { "producer": "Joel Silver", "interval": 1, "previousWin": 1990, "followingWin": 1991 }
>      ],
>      "max": [
>        { "producer": "Matthew Vaughn", "interval": 13, "previousWin": 2002, "followingWin": 2015 }
>      ]
>    }
>    ```
>    (Os outros intervalos desse CSV, só para conferência: Bo Derek 6 (1984→1990) e
>    Buzz Feitshans 9 (1985→1994).) Faça `deepStrictEqual` da resposta inteira.
> 2. Contagens batendo com o CSV: total de filmes = 206 e total de vencedores = 42 (os dois
>    obtidos via `GET /movies` paginando até o fim), e alguns filmes específicos conferidos campo a
>    campo, inclusive um com vários produtores separados por vírgula e "and".
> 3. Fixtures em `test/fixtures/` para outros cenários, cada uma com o resultado esperado
>    calculado à mão:
>    - empate em `min` e em `max` com produtores diferentes;
>    - o mesmo produtor com vários intervalos (só os pares consecutivos contam);
>    - o mesmo produtor aparecendo em `min` e em `max`;
>    - nenhum produtor com duas vitórias → arrays vazios;
>    - duas vitórias no mesmo ano → intervalo 0;
>    - vírgula de Oxford, espaços extras, `Yes`/`YES`, BOM, CRLF, campos entre aspas e linhas em
>      branco;
>    - linha com ano inválido sendo ignorada sem derrubar a importação;
>    - cabeçalho sem coluna obrigatória → `buildApp` rejeita.
> 4. Endpoints: 200, 404 (`/movies/999999` e rota inexistente), 400 (`limit=0`, `limit=10000`,
>    `year=abc`, cursor inválido) no formato Problem Details, 405 com `Allow`, paginação sem
>    repetir nem perder registros, e `x-request-id` propagado.
> 5. `npm test` roda tudo sem nenhuma configuração prévia.
>
> # Estrutura
>
> ```
> src/
>   server.ts, app.ts
>   config/        # env validada
>   db/            # conexão, schema.sql, aplicação do schema
>   importer/      # leitura CSV em stream, parsing de produtores, carga
>   modules/movies/      # routes, schemas, repository, service
>   modules/producers/   # routes, schemas, repository, service
>   shared/        # errors, problem-details, pagination
> data/movielist.csv
> test/integration/, test/fixtures/
> docs/ai/
> ```
>
> Scripts npm: `dev` (tsx watch), `build`, `start` (código compilado), `test`, `lint`, `format`,
> `typecheck`.
>
> # README
>
> Pré-requisitos, instalação, como rodar (com um `CSV_PATH` personalizado), como rodar os testes,
> variáveis de ambiente, exemplos de `curl` de cada endpoint com a resposta, formato esperado do
> CSV, regras de parsing e de cálculo (com as decisões: intervalo 0, empates, ordenação, linhas
> ignoradas), decisões de arquitetura com justificativa e limitações conhecidas.
>
> # Registro de IA (obrigatório e avaliado)
>
> - `docs/ai/PROMPTS.md`: registre este prompt na íntegra e, a cada nova instrução minha, adicione
>   a instrução com a data e um resumo do que foi feito.
> - `docs/ai/DECISIONS.md`: cada decisão técnica relevante, com as alternativas consideradas e o
>   motivo da escolha.
> - `CLAUDE.md` na raiz com as convenções do projeto.
> - Ao fim de cada fase, lembre-me de exportar a sessão (`/export`) para `docs/ai/sessions/`.
>
> # Forma de trabalho
>
> 1. Antes de escrever código, apresente o plano: a árvore de arquivos, o schema SQL, a query de
>    intervalos, os contratos dos endpoints e as dúvidas que tiver. Espere minha aprovação.
> 2. Implemente em fases, rodando `npm run typecheck`, `npm run lint` e `npm test` ao fim de cada
>    uma e fazendo um commit por fase (Conventional Commits, em inglês):
>    - fase 1 — setup (git, tsconfig, lint, config, banco, schema, erros, health);
>    - fase 2 — importador de CSV + testes de importação;
>    - fase 3 — endpoint de intervalos + todos os testes de cenários;
>    - fase 4 — endpoints de movies com paginação + testes;
>    - fase 5 — README, revisão final e registro de IA.
> 3. Não avance de fase com teste falhando. Nunca altere um valor esperado de teste para fazê-lo
>    passar sem antes me explicar o motivo.
> 4. Se alguma decisão aqui se mostrar errada durante a implementação, pare e explique o problema
>    em vez de contorná-lo silenciosamente.

**O que foi feito:** o agente leu o prompt e o enunciado oficial (`Avaliação Outsera - Back-End.pdf`)
e, seguindo a "Forma de trabalho", parou na etapa 1 para apresentar o plano (árvore de arquivos,
schema, query de intervalos, contratos dos endpoints e dúvidas). Nenhum código foi escrito antes da
aprovação.

## 2026-11-11 — Aprovação do plano e respostas às dúvidas

Instrução: o CSV e o enunciado estão em `C:\Users\pedro\Downloads\back-end-ai-test`; o projeto vai
no repositório `PedroFrade/teste_outsera`; **nenhum commit nem push pelo agente** (o autor revisa e
faz manualmente). Respostas: 405 via tabela de rotas (ok); manter o Node atual (24) por causa de
outros projetos; linha ruim na importação não causa rollback, mas o usuário deve ser notificado de
que a análise pode ter sido afetada; número de linha física nos `warn` (ok); `winner` aceita
`true`/`false` e `1`/`0`.

**O que foi feito (fase 1 — setup):** `package.json` (ESM, `engines >=24`), `.nvmrc`, tsconfig
estrito, ESLint + Prettier, config validada por env, banco `:memory:` + `schema.sql`, hierarquia de
erros, error handler global em Problem Details (RFC 9457), 404/405 com `Allow`, propagação de
`x-request-id`, `GET /health`, `server.ts` com graceful shutdown, 6 testes de integração. CSV
copiado para `data/movielist.csv`. Sem commits.

## 2026-11-11 — Revisão da fase 1 e início da fase 2

Instrução: fase 1 testada à mão e aprovada. Pediu para trocar o id de requisição gerado quando o
header `x-request-id` não é enviado (`req-1`, `req-2`, ... repetia entre reinícios e colidia nos
logs) por `crypto.randomUUID()` e ajustar o teste. Sobre as linhas ignoradas na importação: deixar
só no log, com o resumo, explicar no README, sem expor no endpoint. Autorizou a fase 2.

**O que foi feito:**

- `genReqId: () => randomUUID()` em `buildApp`; o teste agora exige formato UUID e ids diferentes
  em duas requisições.
- Fase 2 — importador de CSV: `csv-reader.ts` (stream com csv-parse), `parse-names.ts`,
  `import-csv.ts` (transação única, prepared statements, `warn` por linha ignorada com a linha
  física e resumo final em `warn` quando há linhas ignoradas). `buildApp` agora recebe `csvPath`
  e rejeita se a importação falhar; `server.ts` encerra com código 1.
- Testes de importação (`csv-import.test.ts`): CSV oficial (206 filmes, 42 vencedores, filmes
  conferidos campo a campo) e fixtures (`import-messy.csv`, `missing-column.csv`,
  `header-only.csv`). Total: 17 testes passando. Sem commits.

## 2026-11-11 — Aprovação da fase 2, ajustes e início da fase 3

Instrução: fase 2 aprovada. Ajuste 1: CSV só com cabeçalho não derruba o startup; sobe com um
`warn` e o endpoint devolve `min` e `max` vazios. O startup só falha com arquivo inexistente,
coluna faltando ou CSV malformado. Ajuste 2: como o teste é "somente integração", **na fase 4
reescrever os testes de importação para passarem pela API (`buildApp` + `GET /movies`) e remover as
chamadas diretas a `importCsv`** (podem ficar até lá). Confirmou: CSV malformado continua abortando
o startup, e o `.gitattributes` fica. Autorizou a fase 3.

**O que foi feito:**

- Ajuste 1: `importCsv` loga `warn` ("CSV has a header but no data rows") quando não há linhas de
  dados; o teste de header-only agora confere o aviso, e o endpoint de intervalos devolve arrays
  vazios com esse arquivo.
- Ajuste 2: registrado como pendência da fase 4 (D17 e `CLAUDE.md`).
- Fase 3: `modules/producers/` (`repository.ts` com a query `LAG`, `service.ts` que calcula uma vez
  após a carga, `schemas.ts`, `routes.ts`) e `GET /producers/award-intervals`. 8 fixtures novas e
  `award-intervals.test.ts` (12 testes). Total: 29 testes passando. Sem commits.

## 2026-11-11 — Aprovação da fase 3 e início da fase 4

Instrução: fase 3 aprovada e endpoint testado à mão; manter o `DISTINCT`. Seguir para a fase 4 e
reescrever os testes de importação para passarem pela API.

**O que foi feito (fase 4):**

- `modules/movies/` (`repository.ts`, `service.ts`, `schemas.ts`, `routes.ts`) e
  `shared/pagination.ts`: `GET /movies` (filtros `winner` com `true/false/1/0` e `year`,
  paginação por cursor keyset em base64url, `limit` padrão 50 e máximo 500) e `GET /movies/:id`
  (200, 404, 400).
- `test/integration/movies.test.ts` (paginação sem repetir nem perder registros para vários
  `limit`, filtros, 404, 400 em Problem Details para `limit=0`, `limit=10000`, `year=abc` e
  cursores inválidos, 405 com `Allow`, `x-request-id`).
- `csv-import.test.ts` reescrito: passa por `buildApp` + `GET /movies` e captura os logs de
  startup; nenhum teste chama `importCsv` ou acessa o banco. Pendência da fase 2 resolvida.
- Dois defeitos achados pelos testes e corrigidos no código: o Ajv parava no primeiro campo
  inválido (agora `allErrors: true`, listando todos em `errors`) e `INVALID_OPENING_QUOTE` do
  csv-parse não era reconhecido como CSV malformado (agora `instanceof CsvError`).
- Total: 60 testes passando. Sem commits.

## 2026-11-11 — Aprovação da fase 4 e fase 5

Instrução: fase 4 aprovada. Ajuste: `winner` deve aceitar só `true`/`false`, com `type: boolean`
normal (aceitar `1`/`0` é código a mais). Na fase 5, além do README e da revisão final: README em
português; conferir se roda no Node 22 e, se rodar, baixar `engines` para `>=22`; testar como o
avaliador (clone limpo em pasta temporária, `npm ci`, `npm test` e `npm start` do zero) e reportar
qualquer aviso ou erro; ao fim, checklist item a item do PDF do teste.

**O que foi feito (fase 5):**

- `winner` simplificado (schema `type: boolean`, rota sem conversão; `winner=1` agora é 400 e tem
  teste). D25 reescrita.
- Teste de clone limpo (cópia dos arquivos versionáveis para uma pasta temporária) em Node 24 e em
  Node 22. **Achou um erro real:** `npm ci` falhava (`node-gyp rebuild` sem Python). Corrigido com
  `.npmrc` `ignore-scripts=true` (D28) e `start` que compila sozinho (D29). `engines` para `>=22`
  (D30). Reportados os avisos restantes: 10 vulnerabilidades moderadas só em dev (ESLint/minimatch).
- Medição manual de desempenho com 200 mil linhas (D31), sem alterar o código.
- `README.md` em português e revisão final de código. Sem commits.

## 2026-11-11 — Fechamento da fase 5

Instrução: (1) remover da raiz os arquivos vazios `npm`, `tsx` e `teste-outsera@1.0.0`; (2) o
tempo de ~9 s para 200 mil linhas incomodou: cachear os ids de produtores e estúdios num `Map`
durante a importação, em vez do upsert por nome; se melhorar bem, manter e atualizar os números no
README e na D31; se não, deixar como está.

**O que foi feito:**

- Os três arquivos vazios foram removidos da árvore de trabalho (a remoção aparece como `D` no
  `git status`; o commit é do autor).
- `idResolver` em `import-csv.ts`: `Map<nome, id>` local à importação, com `INSERT` só na primeira
  ocorrência de cada nome. Medido com um CSV novo de 200 mil linhas e ~60 mil produtores distintos
  (mais exigente que o primeiro): importação de ~10,1 s para ~5,1 s, com resultados idênticos.
  Mantido. README, D15 e D31 atualizados. 61 testes passando. Sem commits.

**Incidente durante a verificação final (registrado por transparência):** um script de teste do
agente copiava os arquivos listados por `git ls-files`, que ainda inclui os três arquivos recém
removidos (continuam no índice). O `cp` falhou, o `cd` para a pasta temporária foi pulado e o
`npm ci` rodou dentro do repositório real, apagando parte do `node_modules` (parou com `EPERM` num
`esbuild.exe` em uso pelo `npm run dev` do autor). Nenhum arquivo versionado foi afetado. O
`node_modules` foi restaurado com `npm install`; os 5 arquivos `.log` criados por engano na raiz
foram removidos. O script passou a ignorar arquivos inexistentes e a abortar fora da pasta
temporária, e o ciclo de clone limpo foi refeito (Node 24 e 22: `npm ci`, typecheck, lint, 61 testes
e `npm start` sem erros nem avisos).

**Efeito colateral aceito:** o `npm install` sincronizou o `package-lock.json` com o `package.json`
(`engines` do projeto raiz de `>=24` para `>=22`, que estava desatualizado desde a D30) e registrou
`hasInstallScript: true` no `better-sqlite3` (o `node-gyp` implícito descrito na D28; sem efeito com
o `.npmrc`).
