'use strict';

/**
 * Fonte: bol.pt (Bilheteira Online). A homepage vem pré-carregada com
 * dezenas de blocos <script type="application/ld+json"> no formato
 * schema.org/Event (o mesmo que a Google usa para SEO de eventos) — dados
 * estruturados por definição, sem precisar de parsing de HTML solto.
 *
 * A pesquisa avançada do próprio BOL (filtro por distrito/sala) é uma app
 * carregada via JavaScript, por isso não é fiável para scraping simples.
 * Em vez disso, usamos sempre a homepage (que já traz uma boa amostra de
 * eventos reais nacionais) e filtramos localmente pelos distritos que nos
 * interessam.
 *
 * Limitações conhecidas (documentadas no README):
 * - "addressLocality" no JSON-LD do BOL é o DISTRITO, não o concelho exato
 *   (ex.: eventos em Águeda ou Santa Maria da Feira aparecem como "Aveiro").
 * - O JSON-LD não inclui categoria/género do evento.
 */

const NOME = 'bol.pt';
const PAGINA_URL = 'https://www.bol.pt/';

// Distritos que cobrem os concelhos pedidos: Coimbra (Coimbra, Figueira da
// Foz, Soure, Condeixa-a-Nova), Leiria (Pombal) e Aveiro (Aveiro).
const DISTRITOS_ALVO = new Set(['Coimbra', 'Aveiro', 'Leiria']);

function extrairBlocosJsonLd(html) {
  const blocos = [];
  const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      blocos.push(JSON.parse(match[1].trim()));
    } catch {
      // Bloco malformado ou não-JSON — ignora-se, não interrompe a recolha.
    }
  }
  return blocos;
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
  const blocos = extrairBlocosJsonLd(html);
  const eventos = [];

  for (const bloco of blocos) {
    if (bloco['@type'] !== 'Event') continue;

    const distrito = bloco.location?.address?.addressLocality;
    if (!distrito || !DISTRITOS_ALVO.has(distrito)) continue;

    const titulo = (bloco.name || '').trim();
    const dataHora = bloco.startDate;
    if (!titulo || !dataHora) continue;

    const data = new Date(dataHora);
    if (Number.isNaN(data.getTime())) continue;

    eventos.push({
      titulo,
      categoria: 'Sem categoria',
      concelho: distrito,
      local: bloco.location?.name || distrito,
      dataHora: data.toISOString(),
      fonte: NOME,
      url: bloco.offers?.url || bloco.url || PAGINA_URL,
    });
  }

  return eventos;
}

module.exports = { nome: NOME, url: PAGINA_URL, obterEventos };
