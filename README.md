# rikiki-social-event-discovery

Script CLI que agrega e lista eventos culturais e infantis **reais** na região de
Coimbra (e concelhos vizinhos) entre agora e uma data limite futura. Os dados
vêm de scraping ao vivo de fontes públicas (não há nenhuma base de dados
inventada) e todo o processamento corre dentro de containers Docker
(`node:24-alpine`) — sem necessidade de instalar Node.js na máquina local.

## Pré-requisitos

- **Docker** instalado e o daemon a correr (Docker Desktop no macOS/Windows,
  ou Docker Engine no Linux).
- Bash (o script usa `#!/bin/bash`).
- Ligação à Internet (necessária apenas no passo 1, a recolha de dados).

Não é preciso ter Node.js instalado localmente.

## Instalação

```bash
git clone <url-deste-repositorio>
cd rikiki-social-event-discovery
chmod +x listar-eventos.sh   # normalmente já vem com permissão de execução
```

## Uso

```bash
./listar-eventos.sh <data-limite-AAAA-MM-DD> [filtro-categoria-ou-local]
```

- **`<data-limite-AAAA-MM-DD>`** (obrigatório): data limite, no formato ISO
  `AAAA-MM-DD`. Tem de ser uma data futura. O script lista todos os eventos
  entre **agora** e essa data, inclusive.
- **`[filtro-categoria-ou-local]`** (opcional): texto livre que filtra os
  resultados por categoria, concelho, local ou fonte do evento
  (correspondência parcial, sem distinguir maiúsculas/minúsculas).

### Exemplos

```bash
./listar-eventos.sh 2026-12-31
./listar-eventos.sh 2026-12-31 coimbra
./listar-eventos.sh 2026-12-31 "figueira da foz"
./listar-eventos.sh 2026-12-31 teatro
./listar-eventos.sh 2026-12-31 infantil
```

### Exemplos por concelho

```bash
./listar-eventos.sh 2026-12-31 coimbra
./listar-eventos.sh 2026-12-31 "figueira da foz"
./listar-eventos.sh 2026-12-31 soure
./listar-eventos.sh 2026-12-31 "condeixa-a-nova"
./listar-eventos.sh 2026-12-31 pombal
./listar-eventos.sh 2026-12-31 aveiro
```

Condeixa-a-Nova e Soure têm menos atividade cultural registada nas fontes
usadas do que os outros concelhos — não é invulgar o filtro devolver poucos
ou nenhuns eventos, consoante a agenda real no momento em que corres o
comando (não é um bug).

### Exemplos por tipo de evento

O texto do filtro corresponde à taxonomia de cada fonte (ver [Categorias](#categorias)),
não a uma lista fixa — por isso um termo mais genérico costuma apanhar mais variantes
(ex.: `teatro` encontra tanto "Teatro" como "Teatro e Dança").

```bash
./listar-eventos.sh 2026-12-31 teatro
./listar-eventos.sh 2026-12-31 concertos
./listar-eventos.sh 2026-12-31 infantil
./listar-eventos.sh 2026-12-31 exposições
./listar-eventos.sh 2026-12-31 cinema
./listar-eventos.sh 2026-12-31 "stand-up"
./listar-eventos.sh 2026-12-31 festas
./listar-eventos.sh 2026-12-31 mercados
```

## Arquitetura: pipeline em dois passos

```
listar-eventos.sh
  │
  ├─ 1) docker run  (COM rede)        → node recolher-eventos.js  → escreve eventos.json
  │
  └─ 2) docker run  (--network none)  → node listar-eventos.js <data> [filtro]
```

- **Passo 1 — recolha** (`recolher-eventos.js`, dentro do container `node:24-alpine`
  com rede): corre um `npm install` (só a dependência `cheerio`, que fica em
  cache no `node_modules` montado — só é lento na 1ª execução) e depois chama
  cada [provider](#fontes-de-dados) em paralelo. Cada fonte corre isolada em
  `try/catch`: se uma falhar, as restantes continuam normalmente. O resultado
  agregado, deduplicado (por título + dia) e ordenado por data é escrito em
  `eventos.json`, incluindo o estado de cada fonte (`ok`/`erro`).
- **Passo 2 — apresentação** (`listar-eventos.js`, dentro de outro container
  `node:24-alpine`, desta vez com `--network none`): lê `eventos.json`, valida
  os argumentos, filtra pela janela `[agora, data-limite]` + filtro opcional e
  imprime os resultados. **Nunca tem acesso à rede** — mesmo tendo acabado de
  instalar uma dependência de terceiros no passo 1, este passo fica isolado
  por defesa em profundidade.

Se alguma fonte tiver falhado na última recolha, aparece sempre um **aviso
bem visível** no topo da listagem (nunca falha silenciosa):

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
AVISO: 1 fonte(s) falharam na última recolha de dados:
  - agenda.coimbra.pt: fetch failed
Os resultados abaixo podem estar incompletos.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

## Fontes de dados

| Provider | Ficheiro | Cobertura confirmada |
|---|---|---|
| Agenda de Coimbra (oficial, Câmara + Universidade de Coimbra) | [`providers/agenda-coimbra.js`](providers/agenda-coimbra.js) | Coimbra (Convento de São Francisco, TAGV, UC Exploratório, Casa Municipal da Cultura, etc.) |
| Convento São Francisco (oficial, Coimbra Cultura e Congressos) | [`providers/convento-sao-francisco.js`](providers/convento-sao-francisco.js) | Convento São Francisco, com detalhe de sala (Antiga Igreja, Grande Auditório, etc.) |
| ViralAgenda (agregador nacional) | [`providers/viral-agenda.js`](providers/viral-agenda.js) | Coimbra, Figueira da Foz (inclui o CAE), Soure, Condeixa-a-Nova, Pombal, Aveiro |
| BOL — Bilheteira Online (`bol.pt`) | [`providers/bol.js`](providers/bol.js) | Eventos de bilheteira nos distritos de Coimbra, Aveiro e Leiria (cobre indiretamente todos os concelhos pedidos) |

Todas as fontes são páginas renderizadas no servidor (HTML puro), por isso a
recolha é um `fetch()` HTTP simples seguido de parsing (com `cheerio`, exceto
o BOL, que já vem em JSON-LD estruturado — ver abaixo) — não é necessário
correr um browser dentro do container.

O BOL é um caso especial: em vez do HTML normal, a homepage vem com dezenas
de blocos `<script type="application/ld+json">` no formato schema.org
`Event` (o mesmo que a Google usa para SEO de eventos), com nome, data/hora e
local já estruturados — nem precisa de `cheerio`, só `JSON.parse`. Duas
limitações a ter em conta:
- O campo `addressLocality` do BOL é o **distrito**, não o concelho exato —
  um evento em Águeda ou Santa Maria da Feira aparece como `"Aveiro"` (o
  distrito), tal como a Figueira da Foz ficaria dentro de `"Coimbra"`.
  Mantemos o valor tal como o BOL o publica, sem inventar mais precisão do
  que a fonte dá.
- O BOL não inclui categoria/género do evento — esses eventos aparecem
  sempre com `categoria: "Sem categoria"`, por isso só são encontrados por
  filtros de concelho/local/título, não por tipo.
- A pesquisa avançada do próprio BOL (por distrito/sala) carrega os
  resultados via JavaScript, por isso o scraper usa sempre a homepage
  (que já vem cheia de eventos reais) e filtra localmente pelos distritos
  que interessam, em vez de tentar replicar esse filtro.

### Sites oficiais investigados e não incluídos (com o motivo)

Foram avaliados os sites oficiais de outros locais pedidos, mas não ficaram
com scraper próprio — por não serem tecnicamente viáveis com um simples
`fetch()`, ou por já estarem bem cobertos indiretamente pelas fontes acima.
Preferimos documentar isto a forçar um scraper frágil ou a inventar dados:

| Site | Motivo |
|---|---|
| UC Exploratório (`exploratorio.pt/agenda`) | Site construído em Wix (SPA client-side, "wix-thunderbolt") — a agenda não vem no HTML devolvido pelo servidor, precisaria de um browser real. Já coberto via ViralAgenda/agenda.coimbra.pt. |
| TAGV (`tagv.pt/agenda`) | Site esteve em baixo durante a investigação (502 Bad Gateway) — indisponibilidade que tornaria a fonte pouco fiável mesmo se fosse scrapável. Já coberto via ViralAgenda/agenda.coimbra.pt. |
| Conservatório de Música de Coimbra (`conservatoriomcoimbra.pt`) | Blog WordPress com a categoria "Eventos" desatualizada (último artigo de abril de 2025) — daria dados obsoletos, não uma agenda viva. |
| Praxis / Praxis Beer Fest (`praxisbeerfest.pt`) | É a página de um festival anual único (com museu e restaurante associados), não uma agenda recorrente com múltiplos eventos — scraping traria no máximo uma entrada, esforço desproporcionado. |
| CAE — Centro de Artes e Espectáculos (`cae.pt`) | A página "Programação" do site próprio carrega a lista de eventos de forma que não fica presente no HTML devolvido (nem via `fetch()` simples, nem no DOM after load) — parece exigir interação adicional. Já coberto de forma robusta via ViralAgenda (`/pt/coimbra/figueira-da-foz`) e via BOL. |
| BOL por subdomínio de sala (ex.: `tagv.bol.pt`) | Aplicação ASP.NET WebForms antiga: a lista de espetáculos é montada via postback/UpdatePanel, sem API JSON disponível — replicar isso exigiria simular tokens `__VIEWSTATE` a cada pedido (muito frágil) ou um browser real. O site principal `bol.pt` não tem este problema (ver [Fontes de dados](#fontes-de-dados)) e por isso está incluído. |

### Nota sobre o slug de Condeixa-a-Nova

Ao contrário da maioria dos concelhos no ViralAgenda, o slug de Condeixa-a-Nova
não segue o padrão "nome-com-hifens" (`condeixa-a-nova` devolve 404) — é
`condeixaanova`, sem hífens nenhuns. Só foi encontrado ao inspecionar a lista
de concelhos embutida no próprio site; por isso os slugs em
[`providers/viral-agenda.js`](providers/viral-agenda.js) foram confirmados um
a um em vez de gerados a partir do nome.

### Categorias

Ao contrário de uma lista fixa de categorias, cada fonte publica a sua
própria taxonomia (ex.: "Teatro e Dança", "Cinema e Vídeo", "Mercados, Festas,
Feiras e Romarias", "Infantil"). Mantemos a categoria tal como a fonte a
publica — forçá-la para uma lista fixa distorceria dados reais. O filtro por
substring continua a funcionar normalmente (`teatro` encontra "Teatro e
Dança").

## Erros comuns

| Situação | Mensagem | Código de saída |
|---|---|---|
| Nenhum argumento, ou mais de 2 | `número de argumentos inválido` + uso | 1 |
| Data num formato diferente de `AAAA-MM-DD` | `data limite "..." não está no formato AAAA-MM-DD` | 1 |
| Data válida no formato mas não é um dia real (ex: `2026-02-30`) | `"..." não corresponde a uma data válida do calendário` | 1 |
| Data no passado ou igual a agora | `a data limite (...) tem de ser posterior a agora` | 1 |
| Docker não instalado / não está no `PATH` | `o Docker não está instalado ou não está no PATH` | 1 |
| Docker instalado mas o daemon não responde | `o daemon do Docker não está a responder` | 1 |
| `eventos.json` não existe (passo 1 nunca correu) | `eventos.json não encontrado. Corre primeiro o passo de recolha...` | 1 |
| Uma fonte falhou na recolha | aviso visível no topo da listagem | 0 (recolha parcial, não é erro fatal) |
| Filtro sem correspondências | `Nenhum evento encontrado para os critérios indicados.` | 0 (não é erro) |

## Arquitetura de ficheiros

- **[`listar-eventos.sh`](listar-eventos.sh)** — casca em Bash: valida
  argumentos e o ambiente Docker, depois orquestra os dois passos.
- **[`recolher-eventos.js`](recolher-eventos.js)** — passo 1: chama os
  providers, agrega, deduplica e escreve `eventos.json`.
- **[`listar-eventos.js`](listar-eventos.js)** — passo 2: lê `eventos.json`,
  filtra e imprime os resultados (e os avisos de fontes falhadas).
- **[`providers/`](providers/)** — um ficheiro por fonte de dados; cada um
  exporta `{ nome, url, obterEventos() }` (ou, no caso do ViralAgenda, uma
  função que devolve uma lista destes, uma por concelho).
- **`eventos.json`** — artefacto gerado pelo passo 1 (não versionado,
  está no `.gitignore`).

Para adicionar uma nova fonte: criar um novo ficheiro em `providers/` que
exporte a mesma interface e registá-lo em `recolher-eventos.js`. A lógica de
filtragem por data/categoria/local em `listar-eventos.js` não precisa de
mudar.
