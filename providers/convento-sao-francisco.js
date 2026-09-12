'use strict';

/**
 * Fonte: coimbraconvento.pt — site oficial do Convento de São Francisco
 * (Coimbra Cultura e Congressos). Página SSR simples, sem JavaScript
 * necessário: cada evento é um <li class="bloco-agenda"> com categoria,
 * título, data(s) e hora em texto literal (ex.: "12 Setembro, 2026",
 * "19h30").
 */

const cheerio = require('cheerio');

const NOME = 'coimbraconvento.pt';
const PAGINA_URL = 'https://coimbraconvento.pt/pt/agenda/';
const CONCELHO = 'Coimbra';
const LOCAL_BASE = 'Convento São Francisco';

const MESES = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

function limparTexto(texto) {
  return texto.replace(/\s+/g, ' ').trim();
}

function extrairDataHoraInicio(textoData, textoHora, agora) {
  const matchData = textoData.match(
    /(\d{1,2})\s+(Janeiro|Fevereiro|Março|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s*,?\s*(\d{4})?/i
  );
  if (!matchData) return null;

  const dia = Number(matchData[1]);
  const mesIndex = MESES[matchData[2].toLowerCase()];
  const ano = matchData[3] ? Number(matchData[3]) : agora.getFullYear();

  const matchHora = textoHora.match(/(\d{1,2})h(\d{2})/i);
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

  $('li.bloco-agenda').each((_, elemento) => {
    const $cartao = $(elemento);

    const titulo = limparTexto($cartao.find('h4 a').first().text());
    if (!titulo) return;

    const categoria = limparTexto($cartao.find('h6').first().text()) || 'Sem categoria';
    const sala = limparTexto($cartao.find('h5').first().text());

    const textoData = $cartao.find('.date').first().text();
    const textoHora = $cartao.find('.time').first().text();
    const dataHoraInicio = extrairDataHoraInicio(textoData, textoHora, agora);
    if (!dataHoraInicio) return;

    const href = $cartao.find('h4 a').first().attr('href');

    eventos.push({
      titulo,
      categoria,
      concelho: CONCELHO,
      local: sala ? `${LOCAL_BASE} — ${sala}` : LOCAL_BASE,
      dataHora: dataHoraInicio.toISOString(),
      fonte: NOME,
      url: href ? new URL(href, PAGINA_URL).toString() : PAGINA_URL,
    });
  });

  return eventos;
}

module.exports = { nome: NOME, url: PAGINA_URL, obterEventos };
