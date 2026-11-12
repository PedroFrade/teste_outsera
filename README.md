# API Golden Raspberry Awards — Pior Filme

API RESTful em Node.js + TypeScript que lê a lista de indicados e vencedores da categoria **Pior
Filme** do Golden Raspberry Awards a partir de um CSV, carrega os dados em um banco SQLite **em
memória** quando a aplicação inicia e expõe:

- o produtor com **maior** intervalo entre dois prêmios consecutivos e o que obteve dois prêmios
  **mais rápido**;
- a lista paginada de filmes e a consulta de um filme por id.

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Como rodar](#como-rodar)
- [Como rodar os testes](#como-rodar-os-testes)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Endpoints e exemplos](#endpoints-e-exemplos)
- [Formato esperado do CSV](#formato-esperado-do-csv)
- [Regras de importação](#regras-de-importação)
- [Regras de cálculo dos intervalos](#regras-de-cálculo-dos-intervalos)
- [Decisões de arquitetura](#decisões-de-arquitetura)
- [Limitações conhecidas](#limitações-conhecidas)
- [Uso de IA](#uso-de-ia)

## Pré-requisitos

- **Node.js 22 ou superior** (`engines: >=22`; o `better-sqlite3` já exige 22+). Verificado em Node
  22 e Node 24. O `.nvmrc` indica a versão usada no desenvolvimento (24).
- npm (já vem com o Node).
- **Nenhuma instalação externa**: nem banco de dados, nem Python, nem compilador C++.

## Instalação

```bash
npm ci
```

O repositório tem um `.npmrc` com `ignore-scripts=true`. Isso é intencional: o `better-sqlite3`
já traz binários prontos para Windows, macOS e Linux, mas o `npm ci` (que lê o `package-lock.json`)
tentaria compilá-lo com `node-gyp`, exigindo Python e um compilador C++. Nenhuma dependência do
projeto precisa de script de instalação.

## Como rodar

```bash
npm start
```

O `start` compila o TypeScript (`dist/`) e sobe o servidor em `http://localhost:3000`. Antes de
aceitar requisições, a aplicação lê o CSV e carrega os dados no banco. Se a carga falhar, o
processo encerra com código 1 e uma mensagem clara no log.

Com outro CSV (e outra porta):

```bash
# Linux / macOS / Git Bash
CSV_PATH=./meu-arquivo.csv PORT=4000 npm start

# PowerShell
$env:CSV_PATH = ".\meu-arquivo.csv"; $env:PORT = "4000"; npm start
```

Para desenvolvimento, com recarga automática: `npm run dev`.

Scripts disponíveis:

| Script              | O que faz                                  |
| ------------------- | ------------------------------------------ |
| `npm start`         | Compila e roda o código compilado          |
| `npm run dev`       | Roda com `tsx watch` (recarrega ao salvar) |
| `npm run build`     | Compila para `dist/`                       |
| `npm test`          | Roda os testes de integração               |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`)         |
| `npm run lint`      | ESLint                                     |
| `npm run format`    | Prettier                                   |

## Como rodar os testes

```bash
npm test
```

Não precisa de configuração prévia: os testes sobem uma instância isolada da aplicação por cenário
(`buildApp` + `app.inject()` do Fastify, sem abrir porta) e usam o CSV oficial em
`data/movielist.csv` e as fixtures de `test/fixtures/`.

São **somente testes de integração**, sempre pela API HTTP. Eles garantem que os dados retornados
batem com os do CSV fornecido (206 filmes, 42 vencedores, e o resultado exato do endpoint de
intervalos) e cobrem outros cenários de CSV, com resultado calculado à mão.

## Variáveis de ambiente

Toda a configuração vem do ambiente e é validada na inicialização. Se algum valor for inválido, o
processo não sobe e informa quais variáveis estão erradas.

| Variável    | Padrão                 | Descrição                                                      |
| ----------- | ---------------------- | -------------------------------------------------------------- |
| `PORT`      | `3000`                 | Porta HTTP (1 a 65535)                                         |
| `HOST`      | `0.0.0.0`              | Endereço de escuta                                             |
| `CSV_PATH`  | `./data/movielist.csv` | Caminho do CSV a importar                                      |
| `LOG_LEVEL` | `info`                 | `fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent` |

## Endpoints e exemplos

A API é **somente leitura**: a fonte de verdade é o CSV, carregado uma vez na inicialização.
Criar, alterar ou apagar registros via API faria o banco divergir do arquivo e seria perdido a cada
reinício. Por isso só existe `GET`; qualquer outro método em uma rota existente responde `405` com o
cabeçalho `Allow`, e uma rota inexistente responde `404`.

Os recursos são substantivos, os verbos HTTP têm o significado correto e os status codes refletem o
resultado (nível 2 de maturidade de Richardson).

### `GET /producers/award-intervals`

Produtores com o maior e o menor intervalo entre duas vitórias consecutivas.

```bash
curl http://localhost:3000/producers/award-intervals
```

```json
{
  "min": [{ "producer": "Joel Silver", "interval": 1, "previousWin": 1990, "followingWin": 1991 }],
  "max": [
    { "producer": "Matthew Vaughn", "interval": 13, "previousWin": 2002, "followingWin": 2015 }
  ]
}
```

`min` e `max` são sempre arrays, porque pode haver empates. Se ninguém tiver duas vitórias, a
resposta é `200` com `{ "min": [], "max": [] }`.

### `GET /movies`

Lista paginada por cursor, em ordem de `id` (a ordem do CSV).

| Parâmetro | Tipo    | Descrição                                                            |
| --------- | ------- | -------------------------------------------------------------------- |
| `winner`  | boolean | `true` ou `false`. Opcional                                          |
| `year`    | inteiro | Ano da premiação. Opcional                                           |
| `limit`   | inteiro | Itens por página: de 1 a 500, padrão 50                              |
| `cursor`  | string  | `page.nextCursor` da página anterior (opaco, em base64url). Opcional |

```bash
curl "http://localhost:3000/movies?winner=true&limit=2"
```

```json
{
  "data": [
    {
      "id": 1,
      "year": 1980,
      "title": "Can't Stop the Music",
      "winner": true,
      "producers": ["Allan Carr"],
      "studios": ["Associated Film Distribution"]
    },
    {
      "id": 11,
      "year": 1981,
      "title": "Mommie Dearest",
      "winner": true,
      "producers": ["Frank Yablans"],
      "studios": ["Paramount Pictures"]
    }
  ],
  "page": { "limit": 2, "nextCursor": "eyJpZCI6MTF9", "hasMore": true }
}
```

Próxima página: `curl "http://localhost:3000/movies?winner=true&limit=2&cursor=eyJpZCI6MTF9"`. Na última
página, `hasMore` é `false` e `nextCursor` é `null`. `producers` e `studios` seguem a ordem em que os
nomes aparecem no CSV.

### `GET /movies/:id`

```bash
curl http://localhost:3000/movies/202
```

```json
{
  "id": 202,
  "year": 2019,
  "title": "Cats",
  "winner": true,
  "producers": ["Debra Hayward", "Tim Bevan", "Eric Fellner", "Tom Hooper"],
  "studios": ["Universal Pictures"]
}
```

`404` se o filme não existe; `400` se `:id` não for um inteiro maior que zero.

### `GET /health`

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok" }
```

### Erros (Problem Details, RFC 9457)

Todo erro responde com `Content-Type: application/problem+json` e os campos `type`, `title`,
`status`, `detail` e `instance`, mais `traceId` (o id da requisição). Erros de validação listam
**todos** os campos inválidos em `errors`.

```bash
curl -i "http://localhost:3000/movies?limit=0&year=abc"
```

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed",
  "instance": "/movies?limit=0&year=abc",
  "traceId": "exemplo-123",
  "errors": [
    { "in": "querystring", "field": "year", "message": "must be integer" },
    { "in": "querystring", "field": "limit", "message": "must be >= 1" }
  ]
}
```

```bash
curl -i http://localhost:3000/movies/999999        # 404, detail: "Movie 999999 not found"
curl -i -X POST http://localhost:3000/movies       # 405, cabeçalho "Allow: GET, HEAD"
```

Um erro `500` nunca devolve stack trace: o cliente recebe uma mensagem genérica e a stack completa
vai para o log com o mesmo `traceId`.

**`x-request-id`:** se a requisição enviar esse cabeçalho, o valor é usado como `traceId` e devolvido
na resposta. Caso contrário, a API gera um UUID (único também entre reinícios).

## Formato esperado do CSV

```csv
year;title;studios;producers;winner
1980;Can't Stop the Music;Associated Film Distribution;Allan Carr;yes
1980;Cruising;Lorimar Productions, United Artists;Jerry Weintraub;
```

- Delimitador `;`, cabeçalho obrigatório `year;title;studios;producers;winner`.
- `studios` e `producers` aceitam vários nomes (ver regras abaixo).
- `winner` é `yes` para vencedor; vazio (ou qualquer outro valor) para não vencedor.

## Regras de importação

- **Cabeçalho:** as colunas são comparadas sem diferenciar maiúsculas de minúsculas e ignorando
  espaços nas pontas. Colunas extras são ignoradas. Se faltar alguma coluna obrigatória, a aplicação
  **não sobe**.
- **Formato aceito:** BOM UTF-8, finais de linha CRLF e LF, campos entre aspas (RFC 4180, inclusive
  `""` e `;` dentro de aspas) e linhas em branco (ignoradas).
- **`winner`:** `yes`, sem diferenciar maiúsculas e ignorando espaços, é vencedor. Vazio ou qualquer
  outro valor, não.
- **Separação de produtores e estúdios:** o campo é separado por `, and `, `,` e `and`, o que cobre
  a vírgula de Oxford (`A, B, and C`). Cada nome tem os espaços das pontas removidos e os espaços
  internos colapsados; nomes vazios são descartados e o mesmo nome repetido no mesmo filme conta uma
  vez. **Erros de digitação nos dados não são corrigidos**: por exemplo, `Brian Robbinsand Sharla
Sumpter Bridgett` fica como um único nome. Nomes são comparados exatamente (`Joel Silver` e
  `joel silver` seriam produtores diferentes).
- **Linhas ignoradas:** uma linha com ano inválido (não inteiro) ou título vazio é **ignorada**; a
  importação continua e **não há rollback**.
  - Cada linha ignorada gera um aviso (`warn`) no log, com o número da linha do arquivo (o
    cabeçalho é a linha 1): `CSV line 6 ignored: invalid year "abc"`.
  - Se houve ao menos uma, o resumo final também sai em `warn` e diz que os resultados podem ser
    afetados: `CSV import finished with 2 ignored line(s): the data is incomplete, so results such
as award intervals may be affected`.
  - Sem linhas ignoradas, o resumo sai em `info` com as contagens `read`, `imported` e `skipped`.
  - **As linhas ignoradas aparecem só no log.** A API não as expõe, e os endpoints respondem com os
    dados que foram importados. Acompanhe os logs ao trocar o CSV.
- **CSV só com cabeçalho:** a aplicação sobe normalmente, com um `warn`, e a API responde com
  resultados vazios (`{ "min": [], "max": [] }` e `data: []`).
- **O que impede a aplicação de subir:** arquivo inexistente, coluna obrigatória faltando ou CSV
  malformado (por exemplo, aspas abertas e nunca fechadas). Nesses casos tudo é revertido e o
  processo encerra com código 1. O CSV malformado não é tratado como "linha ruim" porque uma aspa
  mal fechada pode engolir as linhas seguintes, e seguir adiante comprometeria a precisão do
  resultado.
- Toda a inserção acontece em **uma única transação**, com prepared statements.

## Regras de cálculo dos intervalos

- Só filmes **vencedores** contam. Para cada produtor, as vitórias são ordenadas por ano e o
  intervalo é calculado entre cada **par consecutivo** (`followingWin - previousWin`). Não
  consecutivas não formam par: quem ganhou em 1980, 1982 e 1990 tem os pares 1980→1982 e 1982→1990.
- **Empates:** `min` traz todos os pares com o menor intervalo e `max`, todos os pares com o maior.
  Um mesmo produtor pode aparecer mais de uma vez (inclusive em `min` e `max`) se tiver mais de um
  par empatado.
- **Intervalo 0:** duas vitórias do mesmo produtor **no mesmo ano** (filmes diferentes) geram
  intervalo 0, que é um valor válido (e pode ser o `min`). Se um produtor vencer três filmes no mesmo
  ano, o par idêntico (ano, ano) é informado uma única vez.
- **Ordenação** em cada array, de forma determinística: `previousWin` e depois `producer`.
- **Sem pares:** se nenhum produtor tiver duas vitórias, a resposta é `200` com
  `{ "min": [], "max": [] }`.
- **Como é calculado:** em SQL, no repositório, com a função de janela
  `LAG(year) OVER (PARTITION BY producer_id ORDER BY year)`. Como os dados não mudam depois da
  inicialização, o resultado é calculado **uma única vez**, logo após a carga, e guardado em memória:
  cada requisição é atendida em O(1), sem tocar no banco.

## Decisões de arquitetura

As decisões completas, com as alternativas consideradas, estão em
[`docs/ai/DECISIONS.md`](docs/ai/DECISIONS.md). As principais:

| Decisão                                               | Motivo                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fastify 5 com JSON Schema em todas as rotas**       | Valida a entrada e serializa a saída com o mesmo schema; o formato da resposta é garantido.                                                                                                |
| **SQLite `:memory:` (better-sqlite3)**                | Banco embarcado e em memória, sem instalação nem arquivo em disco. Tem função de janela (`LAG`).                                                                                           |
| **Schema em `src/db/schema.sql`**                     | O schema é versionado e nunca inferido do CSV. Modelo normalizado (`movies`, `producers`, `studios` e tabelas de ligação), com chaves estrangeiras e índices para as consultas.            |
| **Acesso ao banco só nos repositórios**               | Camadas `routes` → `service` → `repository`; prepared statements criados uma única vez.                                                                                                    |
| **Importação em stream (`csv-parse`)**                | Memória constante, conforme a RFC 4180; transação única. Os ids de produtores e estúdios ficam num `Map` durante a carga, o que reduziu a importação de 200 mil linhas de ~10 s para ~5 s. |
| **Paginação por cursor (keyset no `id`)**             | Custo constante por página e estável, sem `OFFSET`. O `hasMore` vem de buscar uma linha a mais, sem `COUNT`.                                                                               |
| **Erros em Problem Details e um único error handler** | Formato único e previsível; hierarquia `AppError` → `NotFoundError`/`ValidationError`.                                                                                                     |
| **405 com `Allow`**                                   | O Fastify não tem 405 nativo; as rotas são coletadas no hook `onRoute`, sem dependência extra.                                                                                             |
| **Graceful shutdown**                                 | Em `SIGTERM`/`SIGINT` fecha a app (`app.close()`) e depois o banco, com timeout de 10 s. `unhandledRejection` e `uncaughtException` logam e encerram.                                      |
| **`buildApp({ csvPath, logger })`**                   | Monta a app já com os dados e sem chamar `listen`; os testes sobem uma instância isolada por cenário.                                                                                      |

Estrutura:

```
src/
  server.ts, app.ts
  config/        # variáveis de ambiente validadas
  db/            # conexão, schema.sql, aplicação do schema
  importer/      # leitura do CSV em stream, separação de nomes, carga
  modules/       # health, movies e producers (routes, schemas, service, repository)
  shared/        # erros, Problem Details, paginação, 404/405
data/movielist.csv
test/integration/, test/fixtures/, test/helpers/
docs/ai/         # registro das interações com a IA
```

Dependências de produção: `fastify`, `@fastify/helmet`, `better-sqlite3` e `csv-parse`. O logger é o
`pino` embutido no Fastify (logs JSON estruturados).

## Limitações conhecidas

- **Dados somente em memória:** tudo é recarregado do CSV a cada início, e a carga acontece antes de
  a API aceitar requisições. Para arquivos grandes o início demora (medição manual com um CSV
  sintético de 200 mil linhas, ~17 MB e ~60 mil produtores distintos: cerca de 5 s até a API
  aceitar requisições; depois disso, páginas de `/movies` em poucos milissegundos). O CSV do teste
  carrega em milissegundos.
- **Nomes comparados exatamente:** variações de grafia ou digitação do mesmo produtor contam como
  produtores diferentes. Não há correção automática, por decisão.
- **Linhas ignoradas só no log:** a API não informa o que foi descartado na importação.
- **Filtros de `/movies` sem índice dedicado:** a paginação percorre por `id` e filtra; um filtro
  raro em uma base muito grande varre mais linhas.
- **Somente leitura:** não há criação, alteração ou remoção de filmes, e trocar o CSV exige
  reiniciar a aplicação.
- **Graceful shutdown** não tem teste automatizado: sinais de término se comportam de forma
  diferente no Windows e nos testes de integração sem porta aberta.
- **`npm audit`** aponta vulnerabilidades moderadas apenas em dependências de **desenvolvimento**
  (cadeia do ESLint, via `minimatch`). Em produção (`npm audit --omit=dev`) não há nenhuma.

## Uso de IA

O desenvolvimento foi feito com o agente Claude Code, e o registro das interações está no
repositório:

- [`docs/ai/PROMPTS.md`](docs/ai/PROMPTS.md): o prompt inicial na íntegra e cada instrução seguinte,
  com data e um resumo do que foi feito.
- [`docs/ai/DECISIONS.md`](docs/ai/DECISIONS.md): cada decisão técnica relevante, com as
  alternativas consideradas e o motivo da escolha.
- [`docs/ai/sessions/`](docs/ai/sessions/): sessões exportadas (`/export`) de cada fase.
- [`CLAUDE.md`](CLAUDE.md): as convenções do projeto dadas ao agente.
