# rikiki-social-event-discovery

Script CLI que lista eventos culturais e infantis na região de Coimbra (e
concelhos vizinhos) entre agora e uma data limite futura, correndo dentro de
um container Docker (`node:alpine`) — sem necessidade de instalar Node.js na
máquina local.

## Pré-requisitos

- **Docker** instalado e o daemon a correr (Docker Desktop no macOS/Windows,
  ou Docker Engine no Linux).
- Bash (o script usa `#!/bin/bash`).

Não é preciso ter Node.js instalado localmente — o `eventos.js` corre sempre
dentro do container `node:alpine`, que é descarregado automaticamente no
primeiro uso (`docker pull node:alpine`).

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
  `AAAA-MM-DD`. Tem de ser uma data futura (posterior ao momento em que o
  script corre). O script lista todos os eventos entre **agora** e essa data,
  inclusive.
- **`[filtro-categoria-ou-local]`** (opcional): texto livre que filtra os
  resultados por categoria, concelho, local do evento ou tipo de público
  (correspondência parcial, sem distinguir maiúsculas/minúsculas). Se omitido,
  lista todos os eventos no intervalo de datas.

### Exemplos

Listar todos os eventos até ao final do ano:

```bash
./listar-eventos.sh 2026-12-31
```

Só eventos em Coimbra:

```bash
./listar-eventos.sh 2026-12-31 coimbra
```

Só eventos infantis/familiares:

```bash
./listar-eventos.sh 2026-12-31 infantil
```

Só concertos:

```bash
./listar-eventos.sh 2026-12-31 concertos
```

Só eventos na Figueira da Foz:

```bash
./listar-eventos.sh 2026-12-31 "figueira da foz"
```

### Exemplo de saída

```
A pesquisar eventos até 2026-12-31 (filtro: "coimbra")...

==============================================================================
Eventos culturais e infantis: 2026-09-12 -> 2026-12-31  (filtro: "coimbra")
==============================================================================

[domingo, 20/09/2026, 20:00] Festas — Coimbra / Praxis Cervejeira
  Praxis Cervejeira de Outono
  Festa académica com bandas locais e tasquinhas de rua.
...

------------------------------------------------------------------------------
Total: 6 evento(s) encontrado(s).
```

## Erros comuns

| Situação | Mensagem | Código de saída |
|---|---|---|
| Nenhum argumento, ou mais de 2 | `número de argumentos inválido` + uso | 1 |
| Data num formato diferente de `AAAA-MM-DD` | `data limite "..." não está no formato AAAA-MM-DD` | 1 |
| Data válida no formato mas não é um dia real (ex: `2026-02-30`) | `"..." não corresponde a uma data válida do calendário` | 1 |
| Data no passado ou igual a agora | `a data limite (...) tem de ser posterior a agora` | 1 |
| Docker não instalado / não está no `PATH` | `o Docker não está instalado ou não está no PATH` | 1 |
| Docker instalado mas o daemon não responde | `o daemon do Docker não está a responder` | 1 |
| Filtro sem correspondências | `Nenhum evento encontrado para os critérios indicados.` | 0 (não é erro) |

## Categorias de eventos

- Stand-up comedy
- Teatro
- Concertos
- Festas
- Eventos Infantis / Familiares
- Exposições
- Museus

## Locais cobertos pela base de dados simulada

- **Coimbra**: Convento de São Francisco, Teatro Académico de Gil Vicente
  (TAGV), UC Exploratório, Praxis Cervejeira, Conservatório de Música, Praça
  da Canção.
- **Figueira da Foz**: Centro de Artes e Espectáculos (CAE).
- **Outros concelhos**: Condeixa-a-Nova, Soure, Pombal, Aveiro.

## Arquitetura

- **[`listar-eventos.sh`](listar-eventos.sh)** — casca em Bash: valida os
  argumentos (número, formato da data) e o ambiente (Docker instalado e a
  correr) e depois invoca o container. Não conhece a lógica de datas nem os
  dados dos eventos.
- **[`eventos.js`](eventos.js)** — corre dentro do container `node:alpine`
  (montado via `docker run -v`). Contém a "base de dados" simulada de
  eventos e toda a lógica de validação semântica da data e de filtragem
  (janela temporal `[agora, data-limite]` + filtro opcional).

O container corre com `--network none`: os dados são simulados/embutidos no
próprio script, por isso o processo não precisa de acesso à rede — isto
reduz a superfície de ataque sem custo funcional.

Para ligar a uma fonte de dados real (API ou base de dados), o único ponto a
alterar é a função que produz o array `eventos` em `eventos.js` — a lógica de
filtragem por data/categoria/local mantém-se igual.
