#!/usr/bin/env node
'use strict';

/**
 * Lista eventos culturais e infantis na região de Coimbra entre "agora" e uma
 * data limite, com filtro opcional por categoria/concelho/local.
 *
 * Uso: node eventos.js <data-limite-AAAA-MM-DD> [filtro]
 *
 * Este script corre dentro de um container Docker (node:alpine) invocado por
 * listar-eventos.sh — é aqui que vive toda a lógica de datas e filtragem.
 */

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

const filtro = (filtroArg || '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// "Base de dados" simulada de eventos culturais/infantis da região de Coimbra.
// Em produção isto seria substituído por uma chamada a uma API/BD real, mas a
// lógica de filtragem por data e por categoria/local abaixo mantém-se igual.
// ---------------------------------------------------------------------------
const eventos = [
  {
    id: 1,
    titulo: 'Retrospetiva de Escultura Contemporânea',
    categoria: 'Exposições',
    concelho: 'Coimbra',
    local: 'Convento de São Francisco',
    dataHora: '2026-07-10T10:00:00',
    publico: 'geral',
    descricao: 'Mostra coletiva de escultura contemporânea portuguesa.',
  },
  {
    id: 2,
    titulo: 'Sonho de Uma Noite de Verão',
    categoria: 'Teatro',
    concelho: 'Coimbra',
    local: 'Teatro Académico de Gil Vicente (TAGV)',
    dataHora: '2026-10-03T21:30:00',
    publico: 'geral',
    descricao: 'Adaptação da peça de Shakespeare por companhia universitária.',
  },
  {
    id: 3,
    titulo: 'Oficina "Pequenos Cientistas"',
    categoria: 'Eventos Infantis / Familiares',
    concelho: 'Coimbra',
    local: 'UC Exploratório',
    dataHora: '2026-10-18T15:00:00',
    publico: 'infantil/família',
    descricao: 'Atividades experimentais de física e química para crianças dos 6 aos 12 anos.',
  },
  {
    id: 4,
    titulo: 'Exposição Permanente "Ciência Viva"',
    categoria: 'Museus',
    concelho: 'Coimbra',
    local: 'UC Exploratório',
    dataHora: '2026-11-05T10:00:00',
    publico: 'infantil/família',
    descricao: 'Módulos interativos sobre ciência e tecnologia para todas as idades.',
  },
  {
    id: 5,
    titulo: 'Praxis Cervejeira de Outono',
    categoria: 'Festas',
    concelho: 'Coimbra',
    local: 'Praxis Cervejeira',
    dataHora: '2026-09-20T20:00:00',
    publico: 'geral',
    descricao: 'Festa académica com bandas locais e tasquinhas de rua.',
  },
  {
    id: 6,
    titulo: 'Recital de Piano e Cordas',
    categoria: 'Concertos',
    concelho: 'Coimbra',
    local: 'Conservatório de Música',
    dataHora: '2026-11-21T19:00:00',
    publico: 'geral',
    descricao: 'Concerto de música clássica com alunos e docentes do Conservatório.',
  },
  {
    id: 7,
    titulo: 'Verão na Praça da Canção',
    categoria: 'Concertos',
    concelho: 'Coimbra',
    local: 'Praça da Canção',
    dataHora: '2026-08-15T21:00:00',
    publico: 'geral',
    descricao: 'Ciclo de concertos ao ar livre de música popular portuguesa.',
  },
  {
    id: 8,
    titulo: 'Noite de Stand-up com Humoristas Convidados',
    categoria: 'Stand-up comedy',
    concelho: 'Figueira da Foz',
    local: 'Centro de Artes e Espectáculos (CAE)',
    dataHora: '2026-10-24T22:00:00',
    publico: 'geral',
    descricao: 'Serão de comédia com quatro humoristas nacionais.',
  },
  {
    id: 9,
    titulo: 'Orquestra Filarmónica da Figueira',
    categoria: 'Concertos',
    concelho: 'Figueira da Foz',
    local: 'Centro de Artes e Espectáculos (CAE)',
    dataHora: '2027-01-16T21:00:00',
    publico: 'geral',
    descricao: 'Concerto de ano novo com a orquestra filarmónica regional.',
  },
  {
    id: 10,
    titulo: 'Visita Guiada às Ruínas de Conímbriga',
    categoria: 'Museus',
    concelho: 'Condeixa-a-Nova',
    local: 'Museu Monográfico de Conímbriga',
    dataHora: '2026-09-27T10:30:00',
    publico: 'geral',
    descricao: 'Visita guiada às ruínas romanas e ao museu monográfico.',
  },
  {
    id: 11,
    titulo: 'Festas do Concelho de Soure',
    categoria: 'Festas',
    concelho: 'Soure',
    local: 'Parque Municipal de Soure',
    dataHora: '2026-11-14T19:00:00',
    publico: 'geral',
    descricao: 'Festas populares com arraial, artesanato e animação musical.',
  },
  {
    id: 12,
    titulo: 'Bordado e Arte Popular de Pombal',
    categoria: 'Exposições',
    concelho: 'Pombal',
    local: 'Casa Municipal da Cultura de Pombal',
    dataHora: '2026-12-05T18:00:00',
    publico: 'geral',
    descricao: 'Exposição de artesanato e bordado tradicional da região.',
  },
  {
    id: 13,
    titulo: 'Aveiro a Rir',
    categoria: 'Stand-up comedy',
    concelho: 'Aveiro',
    local: 'Teatro Aveirense',
    dataHora: '2027-02-06T21:30:00',
    publico: 'geral',
    descricao: 'Festival de stand-up comedy com humoristas emergentes.',
  },
  {
    id: 14,
    titulo: 'Feira da Família',
    categoria: 'Eventos Infantis / Familiares',
    concelho: 'Coimbra',
    local: 'Praça da Canção',
    dataHora: '2026-12-20T11:00:00',
    publico: 'infantil/família',
    descricao: 'Insufláveis, oficinas e teatro de fantoches para toda a família.',
  },
  {
    id: 15,
    titulo: 'Exposição de Instrumentos Antigos',
    categoria: 'Exposições',
    concelho: 'Coimbra',
    local: 'Conservatório de Música',
    dataHora: '2027-03-12T17:00:00',
    publico: 'geral',
    descricao: 'Mostra de instrumentos musicais históricos do espólio do Conservatório.',
  },
  {
    id: 16,
    titulo: 'Concerto de Reis',
    categoria: 'Concertos',
    concelho: 'Coimbra',
    local: 'Convento de São Francisco',
    dataHora: '2027-01-06T18:00:00',
    publico: 'geral',
    descricao: 'Concerto de música coral para assinalar o Dia de Reis.',
  },
  {
    id: 17,
    titulo: 'Feira Medieval de Soure',
    categoria: 'Festas',
    concelho: 'Soure',
    local: 'Centro Histórico de Soure',
    dataHora: '2026-06-06T10:00:00',
    publico: 'geral',
    descricao: 'Recriação histórica com mercado, música e teatro de rua (evento já passado).',
  },
];

// ---------------------------------------------------------------------------
// Filtragem: janela temporal [agora, dataLimite] + filtro opcional de
// categoria/concelho/local (correspondência parcial, sem distinguir maiúsculas).
// ---------------------------------------------------------------------------
function dentroDaJanelaTemporal(evento) {
  const dataEvento = new Date(evento.dataHora);
  return dataEvento >= agora && dataEvento <= dataLimite;
}

function correspondeAoFiltro(evento) {
  if (!filtro) return true;
  return [evento.categoria, evento.concelho, evento.local, evento.publico].some((campo) =>
    campo.toLowerCase().includes(filtro)
  );
}

const resultados = eventos
  .filter(dentroDaJanelaTemporal)
  .filter(correspondeAoFiltro)
  .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));

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
    (filtro ? `  (filtro: "${filtro}")` : '')
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
    console.log(`  ${evento.descricao}`);
  }
}

console.log('\n' + '-'.repeat(78));
console.log(`Total: ${resultados.length} evento(s) encontrado(s).`);
