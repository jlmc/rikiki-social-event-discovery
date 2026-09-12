#!/usr/bin/env node
'use strict';

/**
 * Passo 2 do pipeline: lê eventos.json (produzido por recolher-eventos.js)
 * e lista os eventos entre "agora" e uma data limite, com filtro opcional
 * por categoria/concelho/local/fonte.
 *
 * Corre dentro de um container SEM acesso à rede — só lê o ficheiro JSON
 * já montado no volume. Uso: node listar-eventos.js <data-limite> [filtro]
 */

const fs = require('fs');
const path = require('path');

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const FICHEIRO_EVENTOS = path.join(__dirname, 'eventos.json');

function falhar(mensagem) {
  console.error(`Erro: ${mensagem}`);
  process.exit(1);
}

const [, , dataLimiteArg, filtroArg] = process.argv;

if (!dataLimiteArg || !DATA_REGEX.test(dataLimiteArg)) {
  falhar(
    `data limite em falta ou em formato inválido: "${dataLimiteArg ?? ''}" ` +
      '(formato esperado: AAAA-MM-DD, ex: 2026-12-31)'
  );
}

const agora = new Date();
const dataLimite = new Date(`${dataLimiteArg}T23:59:59`);

if (Number.isNaN(dataLimite.getTime())) {
  falhar(`"${dataLimiteArg}" não corresponde a uma data válida do calendário`);
}

if (dataLimite <= agora) {
  falhar(
    `a data limite (${dataLimiteArg}) tem de ser posterior a agora ` +
      `(agora: ${agora.toISOString()})`
  );
}

if (!fs.existsSync(FICHEIRO_EVENTOS)) {
  falhar(
    'eventos.json não encontrado. Corre primeiro o passo de recolha ' +
      '("node recolher-eventos.js", com acesso à rede) antes de listar eventos.'
  );
}

let dados;
try {
  dados = JSON.parse(fs.readFileSync(FICHEIRO_EVENTOS, 'utf8'));
} catch (erro) {
  falhar(`eventos.json não é um JSON válido: ${erro.message}`);
}

const filtro = (filtroArg || '').trim().toLowerCase();

function dentroDaJanelaTemporal(evento) {
  const dataEvento = new Date(evento.dataHora);
  return dataEvento >= agora && dataEvento <= dataLimite;
}

function correspondeAoFiltro(evento) {
  if (!filtro) return true;
  return [evento.categoria, evento.concelho, evento.local, evento.fonte].some((campo) =>
    (campo || '').toLowerCase().includes(filtro)
  );
}

const resultados = (dados.eventos || [])
  .filter(dentroDaJanelaTemporal)
  .filter(correspondeAoFiltro)
  .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));

// ---------------------------------------------------------------------------
// Avisos: uma fonte partida nunca deve passar despercebida.
// ---------------------------------------------------------------------------
const fontesComFalha = (dados.fontes || []).filter((f) => !f.ok);
if (fontesComFalha.length > 0) {
  console.warn('!'.repeat(78));
  console.warn(`AVISO: ${fontesComFalha.length} fonte(s) falharam na última recolha de dados:`);
  for (const fonte of fontesComFalha) {
    console.warn(`  - ${fonte.nome}: ${fonte.erro}`);
  }
  console.warn('Os resultados abaixo podem estar incompletos.');
  console.warn('!'.repeat(78));
  console.warn('');
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const formatoData = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

console.log('='.repeat(78));
console.log(
  `Eventos culturais e infantis: ${agora.toISOString().slice(0, 10)} -> ${dataLimiteArg}` +
    (filtro ? `  (filtro: "${filtro}")` : '') +
    `  [dados de ${dados.geradoEm}]`
);
console.log('='.repeat(78));

if (resultados.length === 0) {
  console.log('\nNenhum evento encontrado para os critérios indicados.');
} else {
  for (const evento of resultados) {
    const dataFormatada = formatoData.format(new Date(evento.dataHora));
    console.log(
      `\n[${dataFormatada}] ${evento.categoria} — ${evento.concelho} / ${evento.local}`
    );
    console.log(`  ${evento.titulo}`);
    console.log(`  fonte: ${evento.fonte}${evento.url ? ` (${evento.url})` : ''}`);
  }
}

console.log('\n' + '-'.repeat(78));
console.log(`Total: ${resultados.length} evento(s) encontrado(s).`);
