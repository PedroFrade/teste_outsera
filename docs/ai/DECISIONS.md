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

## D11 — `x-request-id` gerado com `crypto.randomUUID()`

- **Escolha:** `genReqId: () => randomUUID()`.
- **Alternativas:** contador padrão do Fastify (`req-1`, `req-2`).
- **Motivo:** o contador reinicia a cada boot e o `traceId` repetiria entre logs de execuções
  diferentes. UUID v4 é nativo do Node, sem dependência. (Decisão pedida pelo autor na revisão.)

## D12 — Linha inválida: ignorar com `warn`, sem rollback, resumo em `warn`

- **Escolha:** ano inválido ou título vazio gera `warn` com a linha física e a linha é ignorada;
  se houver ao menos uma ignorada, o resumo final sai em nível `warn` avisando que os resultados
  (intervalos) podem ser afetados. Não é exposto na API. (Decisão do autor.)
- **Alternativas:** rollback total; expor as linhas ignoradas num endpoint.
- **Motivo:** um dado ruim não deve derrubar o serviço, mas o operador precisa ser avisado.
  O aviso fica no log e será explicado no README.

## D13 — Erros estruturais do CSV abortam o startup

- **Escolha:** arquivo inexistente, coluna obrigatória faltando e CSV malformado (aspas
  inválidas) fazem rollback, log `fatal` e saída com código 1.
- **Alternativas:** tratar CSV malformado como "linha ruim" (`skip_records_with_error`).
- **Motivo:** uma aspa mal fechada pode engolir as linhas seguintes. Seguir adiante em silêncio
  comprometeria justamente a precisão do resultado, que é o critério principal.

## D14 — Transação manual (`BEGIN`/`COMMIT`) em vez de `db.transaction()`

- **Escolha:** `db.exec('BEGIN')` e `COMMIT`/`ROLLBACK` em volta de um `for await`.
- **Alternativas:** carregar todas as linhas em memória e inserir dentro de `db.transaction()`.
- **Motivo:** `db.transaction()` só aceita função síncrona. A leitura é em stream (memória
  constante para CSVs grandes) e, durante o startup, nada mais usa a conexão.

## D15 — `INSERT ... ON CONFLICT DO UPDATE ... RETURNING id` para produtores e estúdios

- **Escolha:** um único prepared statement devolve o id, novo ou existente.
- **Alternativas:** `INSERT OR IGNORE` seguido de `SELECT id` (duas statements por nome); cache
  `Map<nome, id>` em memória.
- **Motivo:** uma statement por nome, sem estado extra e sem risco de o `Map` divergir do banco.

## D16 — Regras de separação e de linhas em branco

- **Separador:** regex `/,\s*and\s+|,|\s+and\s+/`, sensível a maiúsculas, como na especificação
  (" and " em minúsculas). "Robbinsand" não tem espaços, então não é separado, de propósito.
- **Linha em branco:** `skip_empty_lines` do csv-parse, mais descarte de linhas com todos os campos
  vazios (ex.: `;;;;`), que não contam como "lidas".
- **Número de linha:** `info.lines` do csv-parse, que é a linha onde o registro termina; coincide
  com a linha de início, salvo campos entre aspas com quebra de linha. Validado no teste (6 e 7).

## D17 — Teste de importação sem endpoint de filmes

- **Escolha:** em `csv-import.test.ts`, os testes chamam `importCsv` com um banco `:memory:` real
  e consultam as tabelas; o `buildApp` é usado para os casos de falha de startup.
- **Alternativas:** esperar a fase 4 (`GET /movies`) para testar a importação.
- **Motivo:** continua sendo teste de integração (arquivo real, SQLite real, sem mocks) e dá
  cobertura da importação já na fase 2. Só o logger é um stub, para capturar os avisos.

> **Pendência (D17):** por decisão do autor, na fase 4 os testes de `csv-import.test.ts` serão
> reescritos para passar pela API (`buildApp` + `GET /movies`), e as chamadas diretas a
> `importCsv` serão removidas. A D17 vale só até lá.

## D18 — CSV só com cabeçalho sobe normalmente

- **Escolha:** `warn` ("header but no data rows") e API com resultados vazios. O startup só falha
  com arquivo inexistente, coluna obrigatória faltando ou CSV malformado. (Decisão do autor.)
- **Alternativas:** falhar o startup com CSV vazio.
- **Motivo:** um CSV sem filmes é uma entrada válida; o contrato de `min`/`max` já prevê arrays
  vazios.

## D19 — Intervalos calculados em SQL com `LAG`, uma vez após a carga

- **Escolha:** CTE `wins` (só `winner = 1`) → `pairs` (`LAG(year) OVER (PARTITION BY producer_id
ORDER BY year)`) → `intervals`; duas prepared statements (`MIN` e `MAX`) filtram os pares com o
  menor e o maior intervalo, ordenados por `previousWin`, `producer`. O service executa as duas
  uma vez ao subir e as requisições devolvem o resultado em memória.
- **Alternativas:** calcular em TypeScript a cada requisição; carregar todas as vitórias e agrupar
  em JS; materializar uma tabela de intervalos.
- **Motivo:** os dados são imutáveis depois do startup, então calcular uma vez dá O(1) por
  requisição. A função de janela expressa "pares consecutivos" sem laços e sem risco de contar
  pares não consecutivos. Uma tabela materializada seria estado extra sem ganho.

## D20 — `SELECT DISTINCT` no resultado dos intervalos

- **Escolha:** pares idênticos (mesmo produtor, mesmo `previousWin` e `followingWin`) saem uma vez.
- **Alternativas:** devolver o par repetido.
- **Motivo:** três vitórias do mesmo produtor no mesmo ano geram duas vezes o par (ano, ano) com
  intervalo 0; repetir a mesma linha idêntica na resposta seria ruído. Um produtor continua
  aparecendo mais de uma vez quando os pares empatados são diferentes. Coberto por teste
  (`intervals-same-year.csv`, Lou). **Decisão a confirmar com o autor.**

## D21 — Fixtures com resultado calculado à mão

- **Escolha:** uma fixture por cenário, com o raciocínio do resultado esperado no comentário do
  teste (ex.: Eve 1980, 1982, 1990, 2000 → gaps 2, 8, 10; 1980→2000 não é par).
- **Motivo:** o avaliador usará outros CSVs; cada cenário isola uma regra (empates, pares
  consecutivos, mesmo produtor em `min` e `max`, vazio, intervalo 0, formatação, linha inválida).
