import { filterEvents } from './lib/filter-events.js';

const EVENTS_URL = './events.json';

let data = { generatedAt: null, sources: [], events: [] };

const form = document.getElementById('filter-form');
const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const locationSelect = document.getElementById('location');
const typeSelect = document.getElementById('type');
const resultsEl = document.getElementById('results');
const resultCountEl = document.getElementById('result-count');
const emptyStateEl = document.getElementById('empty-state');
const generatedAtEl = document.getElementById('generated-at');
const warningEl = document.getElementById('warning-banner');
const modal = document.getElementById('details-modal');
const modalContent = document.getElementById('modal-content');
const modalClose = document.getElementById('modal-close');

const dateFormatter = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fullDateFormatter = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function summarize(description, maxLength = 160) {
  const paragraphs = (description || '').split('\n').filter(Boolean);
  const first = paragraphs.find((p) => p.length > 20) || paragraphs[0] || '';
  return first.length <= maxLength ? first : `${first.slice(0, maxLength).trim()}…`;
}

function populateFilterOptions() {
  const locations = [...new Set(data.events.map((e) => e.location).filter(Boolean))].sort();
  const types = [...new Set(data.events.map((e) => e.category).filter(Boolean))].sort();

  for (const loc of locations) {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    locationSelect.appendChild(opt);
  }
  for (const type of types) {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    typeSelect.appendChild(opt);
  }
}

function renderWarning() {
  const failed = data.sources.filter((s) => !s.ok);
  if (failed.length === 0) {
    warningEl.hidden = true;
    return;
  }
  warningEl.hidden = false;
  warningEl.innerHTML =
    `<strong>⚠ ${failed.length} fonte(s) falharam na última recolha:</strong>` +
    failed.map((s) => `${s.name}: ${escapeHtml(s.error)}`).join('<br>') +
    '<br><em>Os resultados abaixo podem estar incompletos.</em>';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function renderCard(event) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <span class="date">${dateFormatter.format(new Date(event.dateTime))}</span>
    <span class="badge">${escapeHtml(event.category)}</span>
    <span class="title">${escapeHtml(event.title)}</span>
    <span class="location">${escapeHtml(event.location)} — ${escapeHtml(event.venue)}</span>
    ${event.description ? `<span class="description">${escapeHtml(summarize(event.description))}</span>` : ''}
    <div class="actions">
      <button type="button" class="primary" data-action="details">Ver detalhes</button>
      ${event.url ? `<a class="secondary" href="${event.url}" target="_blank" rel="noopener">Página oficial</a>` : ''}
    </div>
  `;
  card.querySelector('[data-action="details"]').addEventListener('click', () => openDetails(event));
  return card;
}

function openDetails(event) {
  modalContent.innerHTML = `
    <span class="date">${fullDateFormatter.format(new Date(event.dateTime))}</span>
    <h2>${escapeHtml(event.title)}</h2>
    <p class="location">${escapeHtml(event.category)} · ${escapeHtml(event.location)} — ${escapeHtml(event.venue)}</p>
    ${event.description
      ? `<p style="white-space: pre-line">${escapeHtml(event.description)}</p>`
      : '<p><em>Sem descrição disponível para este evento.</em></p>'}
    ${event.participants && event.participants.length > 0
      ? `<div><strong>Participantes</strong>${event.participants.map((p) => `<div class="participant">• ${escapeHtml(p)}</div>`).join('')}</div>`
      : ''}
    <p class="source">Fonte: ${escapeHtml(event.source)}</p>
    ${event.url ? `<a class="official-link" href="${event.url}" target="_blank" rel="noopener">Página oficial</a>` : ''}
  `;
  modal.hidden = false;
}

modalClose.addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

function runSearch(event) {
  event.preventDefault();

  const end = endInput.value;
  if (!end) return;

  const startDateTime = startInput.value ? new Date(`${startInput.value}T00:00:00`) : new Date();
  const endDateTime = new Date(`${end}T23:59:59`);

  const results = filterEvents(data.events, {
    startDateTime,
    endDateTime,
    location: locationSelect.value,
    type: typeSelect.value,
  });

  resultsEl.innerHTML = '';
  results.forEach((e) => resultsEl.appendChild(renderCard(e)));

  resultCountEl.hidden = false;
  resultCountEl.textContent = `${results.length} evento(s) encontrado(s)`;
  emptyStateEl.hidden = results.length !== 0;
}

form.addEventListener('submit', runSearch);

// Also re-run the search on any filter change, not just a click on
// "Pesquisar" — a native date-picker's calendar popup swallows the first
// click that lands outside it (used just to close the popup), so a click
// on the button right after picking a date can silently do nothing. This
// makes the button an explicit re-trigger rather than the only way in.
for (const el of [startInput, endInput, locationSelect, typeSelect]) {
  el.addEventListener('change', runSearch);
}

async function init() {
  // Default the date inputs: end = 90 days from now, start = today — the
  // page always opens with a sensible non-empty window, no query needed.
  const today = new Date();
  const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  startInput.value = today.toISOString().slice(0, 10);
  endInput.value = in90Days.toISOString().slice(0, 10);

  try {
    const response = await fetch(EVENTS_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    generatedAtEl.textContent = `Erro a carregar dados: ${err.message}`;
    return;
  }

  generatedAtEl.textContent = `Dados de ${new Date(data.generatedAt).toLocaleString('pt-PT')} · atualizados automaticamente a cada 6 horas`;
  populateFilterOptions();
  renderWarning();
  runSearch(new Event('submit'));
}

init();
