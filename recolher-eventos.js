#!/usr/bin/env node
'use strict';

/**
 * Passo 1 do pipeline: percorre todas as fontes reais configuradas,
 * agrega os eventos encontrados e escreve tudo em eventos.json.
 *
 * Corre dentro de um container COM acesso à rede (ao contrário do passo de
 * apresentação, listar-eventos.js). Cada fonte é isolada em try/catch: uma
 * fonte partida fica registada em "fontes" com ok:false e um erro legível,
 * mas nunca impede as restantes fontes de serem processadas.
 */

const fs = require('fs');
const path = require('path');

const agendaCoimbra = require('./providers/agenda-coimbra');
const viralAgenda = require('./providers/viral-agenda');
const conventoSaoFrancisco = require('./providers/convento-sao-francisco');

const FICHEIRO_SAIDA = path.join(__dirname, 'eventos.json');

function chaveDeduplicacao(evento) {
  const diaISO = evento.dataHora.slice(0, 10);
  return `${evento.titulo.trim().toLowerCase()}|${diaISO}`;
}

function deduplicar(eventos) {
  const vistos = new Set();
  const resultado = [];
  for (const evento of eventos) {
    const chave = chaveDeduplicacao(evento);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(evento);
  }
  return resultado;
}

async function processarFonte(fonte, resultadoFontes, todosOsEventos) {
  try {
    const eventos = await fonte.obterEventos();
    resultadoFontes.push({ nome: fonte.nome, url: fonte.url, ok: true, numEventos: eventos.length });
    todosOsEventos.push(...eventos);
  } catch (erro) {
    resultadoFontes.push({
      nome: fonte.nome,
      url: fonte.url,
      ok: false,
      erro: erro.message || String(erro),
    });
  }
}

async function main() {
  const resultadoFontes = [];
  const todosOsEventos = [];

  const fontesViralAgenda = await viralAgenda.obterFontes();
  const fontes = [
    { nome: agendaCoimbra.nome, url: agendaCoimbra.url, obterEventos: agendaCoimbra.obterEventos },
    {
      nome: conventoSaoFrancisco.nome,
      url: conventoSaoFrancisco.url,
      obterEventos: conventoSaoFrancisco.obterEventos,
    },
    ...fontesViralAgenda,
  ];

  await Promise.all(fontes.map((fonte) => processarFonte(fonte, resultadoFontes, todosOsEventos)));

  const eventosSemDuplicados = deduplicar(todosOsEventos).sort(
    (a, b) => new Date(a.dataHora) - new Date(b.dataHora)
  );
  const eventosComId = eventosSemDuplicados.map((evento, indice) => ({ id: indice + 1, ...evento }));

  const saida = {
    geradoEm: new Date().toISOString(),
    fontes: resultadoFontes,
    eventos: eventosComId,
  };

  fs.writeFileSync(FICHEIRO_SAIDA, JSON.stringify(saida, null, 2));

  const fontesComFalha = resultadoFontes.filter((f) => !f.ok);
  console.log(
    `Recolha concluída: ${eventosComId.length} evento(s) únicos de ${resultadoFontes.length} fonte(s) ` +
      `(${resultadoFontes.length - fontesComFalha.length} ok, ${fontesComFalha.length} com falha).`
  );
  for (const fonte of fontesComFalha) {
    console.warn(`  AVISO: falha em "${fonte.nome}": ${fonte.erro}`);
  }
}

main().catch((erro) => {
  console.error(`Erro fatal na recolha de eventos: ${erro.message || erro}`);
  process.exit(1);
});
