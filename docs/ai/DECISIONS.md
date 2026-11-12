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

## D15 — Ids de produtores e estúdios: de `ON CONFLICT ... RETURNING` para cache em `Map`

> **Substituída na fase 5 (pedido do autor), ver D31.** A versão inicial usava um único
> `INSERT ... ON CONFLICT (name) DO UPDATE ... RETURNING id` por nome.

- **Escolha atual:** `Map<nome, id>` local à chamada de `importCsv` (`idResolver`). Na primeira vez que
  um nome aparece, faz `INSERT` e guarda o `lastInsertRowid`; nas demais, só consulta o `Map`.
- **Alternativas:** `ON CONFLICT DO UPDATE ... RETURNING id` (a versão inicial: uma escrita no banco
  por nome em cada filme, mesmo para nomes repetidos); `SELECT` antes do `INSERT`.
- **Motivo:** o risco que levou à escolha inicial (o `Map` divergir do banco) não existe aqui: o `Map`
  vive só durante a importação, dentro da transação, e é descartado junto com ela (em erro há
  rollback e a exceção sobe). A restrição `UNIQUE (name)` continua como rede de segurança. Ganho
  medido na D31: importação de 200 mil linhas de ~10 s para ~5 s.

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

> **Resolvida na fase 4:** os testes de importação foram reescritos para passar pela API
> (`buildApp` + `GET /movies`) e nenhum teste chama mais `importCsv` nem acessa o banco.

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

## D22 — Paginação por cursor keyset no `id`, sem `COUNT`

- **Escolha:** `WHERE id > ? ORDER BY id LIMIT limit+1`; a linha extra indica `hasMore`. O cursor é
  `base64url({"id": N})`, validado por decodificação e recodificação idêntica; qualquer outra coisa
  (lixo, JSON diferente, chaves extras, id negativo ou não inteiro) é 400.
- **Alternativas:** `OFFSET`/`LIMIT` (custo cresce com a página e repete/perde registros se algo
  mudar); devolver o total com `COUNT(*)`.
- **Motivo:** o keyset tem custo constante por página e é estável. O total não foi pedido.

## D23 — Uma só prepared statement para todas as combinações de filtro

- **Escolha:** `(@winner IS NULL OR m.winner = @winner) AND (@year IS NULL OR m.year = @year)`,
  com `NULL` para o filtro ausente.
- **Alternativas:** montar o SQL dinamicamente por combinação; uma statement por combinação.
- **Motivo:** mantém "prepared statements criados uma única vez" sem SQL dinâmico. O custo é que
  um filtro raro percorre as linhas a partir do cursor; para os volumes deste teste é irrelevante.

## D24 — Produtores e estúdios no mesmo SELECT, na ordem do CSV

- **Escolha:** subqueries com `json_group_array(nome ORDER BY mp.rowid)`; uma query por página,
  sem N+1. As tabelas de ligação têm `rowid` implícito, e as linhas são inseridas na ordem em que
  os nomes aparecem no arquivo.
- **Alternativas:** ordem alfabética; segunda query com `IN (...)` dinâmico; coluna `position`.
- **Motivo:** devolver "Steven Perry and Joel Silver" como `["Steven Perry", "Joel Silver"]` é o
  mais fiel ao CSV e não exige coluna nova. Depende de `ORDER BY` dentro de agregado (SQLite
  ≥ 3.44; o better-sqlite3 instalado traz 3.54).

## D25 — `winner` como `type: boolean` (só `true`/`false`)

- **Escolha:** `winner: { type: 'boolean' }` no schema da query; o Ajv converte `"true"`/`"false"`.
  `winner=1` e `winner=0` respondem 400. (Decisão do autor na revisão da fase 4.)
- **Alternativas:** aceitar também `1`/`0` (enum de string convertido na rota).
- **Motivo:** o enum de string era código a mais sem requisito que o exigisse. Substitui a versão
  inicial da D25, que aceitava `1`/`0`.

## D26 — Ajv com `allErrors: true`

- **Escolha:** `ajv: { customOptions: { allErrors: true } }` no Fastify.
- **Alternativas:** deixar o padrão (para no primeiro erro).
- **Motivo:** o prompt manda listar os campos inválidos em `errors`; com o padrão só o primeiro
  aparecia (achado pelo teste `lists every invalid field`). As entradas são pequenas (4 params),
  então o custo é desprezível.

## D27 — CSV malformado reconhecido por `instanceof CsvError`

- **Escolha:** qualquer `CsvError` do csv-parse vira `CsvImportError` ("Malformed CSV near line N").
- **Alternativas:** checar o prefixo `CSV_` do `code`.
- **Motivo:** os códigos do csv-parse não são uniformes (`INVALID_OPENING_QUOTE` não tem o prefixo),
  então o teste de CSV malformado pegou uma aspa solta que passaria como erro genérico. Observação:
  para aspa aberta e nunca fechada o parser informa a linha onde desistiu (fim do arquivo), não
  a linha onde a aspa abriu.

## D28 — `.npmrc` com `ignore-scripts=true`

- **Escolha:** `.npmrc` versionado com `ignore-scripts=true`.
- **Alternativas:** instalar com `npm ci --ignore-scripts` (só no README); trocar o `better-sqlite3`
  por uma versão que baixa o binário com `prebuild-install`; exigir Python e C++ no ambiente.
- **Motivo:** achado no teste de clone limpo. O `better-sqlite3` 13 declara `gypfile: false` e traz
  binários prontos em `prebuilds/`, mas o `package-lock.json` não guarda o `gypfile`; então o
  `npm ci` assume o `node-gyp rebuild` implícito e falha sem Python e compilador C++ (reproduzido
  no Windows; um `npm install` sem lockfile não falha). O `.npmrc` vale para qualquer versão do npm
  e nenhuma dependência precisa de script de instalação (os 61 testes passam sem eles). Efeito
  colateral: com `ignore-scripts`, o npm não roda `prestart`; ver D29.

## D29 — `npm start` compila e sobe

- **Escolha:** `"start": "npm run build && node dist/server.js"`.
- **Alternativas:** `prestart` (não roda com `ignore-scripts`); `start` com `tsx`; exigir o build manual.
- **Motivo:** num clone limpo não existe `dist/`, e o avaliador vai rodar `npm ci` e `npm start`.
  O script continua executando o código compilado, como pede o prompt.

## D30 — `engines` `>=22`

- **Escolha:** `"node": ">=22"`; o `.nvmrc` continua em 24 (versão de desenvolvimento).
- **Alternativas:** manter `>=24`.
- **Motivo:** o avaliador pode não estar no Node 24. O `better-sqlite3` 13 já exige `>=22`, então 22 é
  o piso real. Verificado: `npm ci`, typecheck, lint, `npm test` (61 de 61) e `npm start` em Node 22.23
  e em Node 24.22, a partir de uma cópia limpa.

## D31 — Desempenho: medido; cache de ids em `Map` adotado

- **Primeira medição** (fora do repositório; CSV sintético de 200 mil linhas, ~17 MB, com poucos
  produtores distintos): parse 0,7 s; importação 8,8 s; cálculo dos intervalos (2 queries `LAG`)
  0,26 s; `GET /movies?limit=500` ~4 ms; `GET /movies/:id` < 1 ms. A importação dominava.
- **Alternativas medidas para o upsert** (mesmo CSV): `SELECT` antes do `INSERT` 5,1 s; `Map` 4,1 s;
  `ON CONFLICT DO UPDATE` (então em uso) 8,7 s. Na época, decidi manter o upsert por ser mais simples,
  porque o ganho só aparecia em arquivos grandes.
- **Pedido do autor:** testar o `Map`; manter se melhorasse bem. Como o CSV sintético tinha poucos
  produtores distintos (o que favorece um cache), a comparação final usou um CSV novo, de 200 mil
  linhas e 17,5 MB, com 59.997 produtores e 1.500 estúdios distintos, e o código real
  (`importCsv`), três execuções cada:

  | Versão                                         | Importação             |
  | ---------------------------------------------- | ---------------------- |
  | `ON CONFLICT DO UPDATE ... RETURNING` (antes)  | 10,30 / 9,96 / 10,09 s |
  | `Map` com `INSERT` só para nomes novos (agora) | 5,23 / 5,00 / 5,04 s   |

  Mesmos resultados nas duas versões: 200.000 filmes, 59.997 produtores, 1.500 estúdios e 599.991
  vínculos. Startup completo (importação, schema e intervalos) com o `Map`: 5,33 s.

- **Escolha:** manter o `Map` (metade do tempo), com 61 testes passando. A mudança são ~12 linhas
  (`idResolver`) e substitui as duas statements de upsert (D15).
- **Demais números (com o `Map`):** `GET /producers/award-intervals` ~50 ms na primeira
  requisição (serializa ~50 KB); `GET /movies?limit=500` ~4 ms; `GET /movies/:id` < 1 ms; RSS ~170 MB.
- **O que continua sendo o custo:** os ~1,2 milhão de `INSERT` de filmes e vínculos. Para o CSV do
  teste (~16 KB) tudo isso leva milissegundos.
