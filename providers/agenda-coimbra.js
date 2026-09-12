'use strict';

/**
 * Fonte: agenda.coimbra.pt — plataforma oficial da Câmara Municipal de
 * Coimbra + Universidade de Coimbra. A página inicial é renderizada no
 * servidor (SSR), por isso um simples fetch() já traz o HTML com os
 * cartões de evento, sem precisar de executar JavaScript no browser.
 *
 * O HTML usa classes utilitárias (Tailwind) sem nomes semânticos, por isso
 * a extração de datas assenta na ESTRUTURA (1º bloco filho = data/hora de
 * início, 2º = data/hora de fim) em vez de tentar interpretar o texto do
 * separador entre elas, que varia ("-" ou "a" consoante o intervalo).
 */

const cheerio = require('cheerio');

const NOME = 'agenda.coimbra.pt';
const PAGINA_URL = 'https://agenda.coimbra.pt/';
const CONCELHO = 'Coimbra';

const MESES = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function limparTexto(texto) {
  return texto.replace(/\s+/g, ' ').trim();
}

// Alguns cartões mostram a morada completa em várias linhas; só nos
// interessa a 1ª linha (o nome do local), antes de colapsar espaços.
function primeiraLinhaLimpa(texto) {
  const primeiraLinha = texto.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  return limparTexto(primeiraLinha);
}

function inferirAno(dia, mesIndex, anoExplicito, agora) {
  if (anoExplicito) return anoExplicito;
  const candidata = new Date(agora.getFullYear(), mesIndex, dia);
  const diffDias = (agora - candidata) / (1000 * 60 * 60 * 24);
  // Datas "no passado" há mais de ~2 meses são provavelmente do ano seguinte
  // (agendas mostram sempre o dia/mês, raramente o ano, quando é o ano corrente).
  return diffDias > 60 ? agora.getFullYear() + 1 : agora.getFullYear();
}

function extrairDataHoraInicio(textoBloco, agora) {
  const matchData = textoBloco.match(
    /(\d{1,2})\s+(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\w*\s*(\d{4})?/i
  );
  if (!matchData) return null;

  const dia = Number(matchData[1]);
  const mesIndex = MESES[matchData[2].toLowerCase()];
  const ano = inferirAno(dia, mesIndex, matchData[3] ? Number(matchData[3]) : null, agora);

  const matchHora = textoBloco.match(/(\d{1,2}):(\d{2})/);
  const hora = matchHora ? Number(matchHora[1]) : 0;
  const minuto = matchHora ? Number(matchHora[2]) : 0;

  const data = new Date(ano, mesIndex, dia, hora, minuto);
  return Number.isNaN(data.getTime()) ? null : data;
}

async function obterEventos() {
  const resposta = await fetch(PAGINA_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao aceder a ${PAGINA_URL}`);
  }

  const html = await resposta.text();
  const $ = cheerio.load(html);
  const agora = new Date();
  const eventos = [];

  $('a[href^="/event/"]').each((_, elemento) => {
    const $cartao = $(elemento);

    const titulo = limparTexto($cartao.find('.condensed-text.font-semibold').first().text());
    if (!titulo) return;

    const local = primeiraLinhaLimpa(
      $cartao.find('.line-clamp-1.text-ellipsis.flex-1.text-xs').first().text()
    );

    const categoria = $cartao
      .find('.semicondensed-text.uppercase')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(' / ') || 'Sem categoria';

    // Estrutura: div.text-lg.border-l-2 > [bloco início][separador][bloco fim]
    const blocoData = $cartao.find('.text-lg.border-l-2').first();
    const primeiroBloco = blocoData.children('div').first();
    const textoInicio = (primeiroBloco.length ? primeiroBloco : blocoData).text().trim();
    const dataHoraInicio = extrairDataHoraInicio(textoInicio, agora);
    if (!dataHoraInicio) return;

    const href = $cartao.attr('href');

    eventos.push({
      titulo,
      categoria,
      concelho: CONCELHO,
      local: local || 'Coimbra',
      dataHora: dataHoraInicio.toISOString(),
      fonte: NOME,
      url: href ? new URL(href, PAGINA_URL).toString() : PAGINA_URL,
    });
  });

  return eventos;
}

module.exports = { nome: NOME, url: PAGINA_URL, obterEventos };
