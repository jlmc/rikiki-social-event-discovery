'use strict';

/**
 * Fonte: viralagenda.com — agregador nacional de agenda cultural. As
 * páginas por concelho (/pt/<distrito>/<concelho>) são renderizadas no
 * servidor e cada evento (<li class="viral-event">) já traz metadados
 * estruturados em atributos data-* (data-date-start em ISO 8601), o que
 * torna o scraping bastante mais robusto do que depender de texto livre.
 */

const cheerio = require('cheerio');

const BASE_URL = 'https://www.viralagenda.com';

// Confirmados manualmente durante a investigação (URLs que devolvem
// listagens reais, não 404): concelhos pedidos que não constam aqui não
// tinham um slug válido conhecido nesta fonte.
const LOCAIS = [
  { distrito: 'coimbra', concelho: 'coimbra', nomeConcelho: 'Coimbra' },
  { distrito: 'coimbra', concelho: 'figueira-da-foz', nomeConcelho: 'Figueira da Foz' },
  { distrito: 'coimbra', concelho: 'soure', nomeConcelho: 'Soure' },
  { distrito: 'leiria', concelho: 'pombal', nomeConcelho: 'Pombal' },
  { distrito: 'aveiro', concelho: 'aveiro', nomeConcelho: 'Aveiro' },
];

async function obterEventosDeConcelho({ distrito, concelho, nomeConcelho }) {
  const url = `${BASE_URL}/pt/${distrito}/${concelho}`;
  const resposta = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao aceder a ${url}`);
  }

  const html = await resposta.text();
  const $ = cheerio.load(html);
  const eventos = [];

  $('li.viral-event').each((_, elemento) => {
    const $cartao = $(elemento);

    const titulo = $cartao.find('.viral-event-title').first().text().trim();
    const dataInicio = $cartao.attr('data-date-start');
    if (!titulo || !dataInicio) return;

    const data = new Date(dataInicio);
    if (Number.isNaN(data.getTime())) return;

    const local = $cartao.find('a.viral-event-place span').first().text().trim();

    const categoria =
      $cartao
        .find('.viral-event-box-cat a')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean)
        .join(' / ') || 'Sem categoria';

    const caminho = $cartao.attr('data-url');

    eventos.push({
      titulo,
      categoria,
      concelho: nomeConcelho,
      local: local || nomeConcelho,
      dataHora: data.toISOString(),
      fonte: `viralagenda.com (${nomeConcelho})`,
      url: caminho ? new URL(caminho, BASE_URL).toString() : `${BASE_URL}/pt/${distrito}/${concelho}`,
    });
  });

  return eventos;
}

// Cada concelho é tratado como uma "fonte" independente: se o pedido a um
// concelho falhar, os restantes continuam a ser processados normalmente.
async function obterFontes() {
  return LOCAIS.map((localAlvo) => ({
    nome: `viralagenda.com (${localAlvo.nomeConcelho})`,
    url: `${BASE_URL}/pt/${localAlvo.distrito}/${localAlvo.concelho}`,
    obterEventos: () => obterEventosDeConcelho(localAlvo),
  }));
}

module.exports = { obterFontes };
