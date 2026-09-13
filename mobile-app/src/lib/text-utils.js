/**
 * Text-processing helpers used by the on-device providers to enrich events
 * with a description/participants from each event's own detail page —
 * ported from the CLI's providers/_utils.js. All pure string logic, no
 * Node APIs, so it works unchanged in the React Native runtime.
 */

// Wraps fetch() with a manual timeout via AbortController rather than
// AbortSignal.timeout(), which isn't reliably available across React
// Native/Hermes versions — this keeps the same 15s timeout behaviour as
// the CLI's providers in a way that works on-device.
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Runs `task(item)` for every item in `items`, at most `limit` at a time.
// Keeps us from firing a burst of N parallel requests at small
// institutional sites when N is large (100+ detail pages).
export async function mapWithLimit(items, limit, task) {
  const result = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      result[current] = await task(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return result;
}

// Converts loose HTML (<p>, <br>, entities) into readable plain text,
// preserving paragraph breaks. The sources used here tend to return the
// event description this way (inside a <meta content="...">, a <div> or a
// <pre>) instead of already-clean text.
export function cleanHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&eacute;/gi, 'é')
    .replace(/&aacute;/gi, 'á')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&euro;/gi, '€')
    .replace(/&copy;/gi, '©')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// From the point where the "fact sheet" footer starts (age rating,
// duration, box office info, purchase links, etc.), the text stops being
// the event description and becomes practical/commercial information — so
// the description is cut off right before the first of these sections.
// NOTE: these patterns match the actual (Portuguese) text published by the
// sources — they must stay in Portuguese, they are not UI strings.
const SECTION_BOUNDARY_REGEX =
  /^(classificação etária|duração|informações?|compre o seu bilhete|sess(ão|ões)|preços?|bilhetes?|informação adicional)\s*:?$/i;

// ViralAgenda appends a "Fonte: <link>" ("Source: <link>") attribution
// line after the actual content, on the same line as the URL rather than
// as its own heading — so, unlike SECTION_BOUNDARY_REGEX, this one matches
// a prefix rather than the whole line.
const SOURCE_ATTRIBUTION_REGEX = /^fonte\s*:/i;

function isBoundaryLine(line) {
  return SECTION_BOUNDARY_REGEX.test(line) || SOURCE_ATTRIBUTION_REGEX.test(line);
}

// Best-effort heuristic to split description from participants
// (artists/actors) out of the already-cleaned text of a detail page. It
// covers the two patterns observed across the real sources:
//   - "Ficha Artística/Técnica" ("Artistic/Technical credits") followed by
//     "Role: Name" lines (Coimbra municipal events / Convento São Francisco).
//   - A "Com Fulano, Sicrano, ..." ("With so-and-so, ...") line (ViralAgenda
//     film listings).
// When neither pattern is found, participants stays an empty list — we
// never invent a cast the source didn't provide.
export function splitDescriptionAndParticipants(cleanText) {
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

  const creditsIndex = lines.findIndex((l) => /^ficha artística/i.test(l));
  const boundaryIndex = lines.findIndex((l) => isBoundaryLine(l));
  const cutoff = [creditsIndex, boundaryIndex].filter((i) => i !== -1).sort((a, b) => a - b)[0];

  const description = (cutoff === undefined ? lines : lines.slice(0, cutoff)).join('\n').trim();

  const participants = [];
  if (creditsIndex !== -1) {
    for (let i = creditsIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isBoundaryLine(line)) break;

      // Two "Role"/"Name" orderings show up across sources:
      //   "Direção musical: Alberto Roque"  (role first, colon-separated)
      //   "Sofia Marafona (direção artística)"  (name first, role in parens)
      const roleColonName = line.match(/^(.+?):\s*(.+)$/);
      if (roleColonName) {
        participants.push(`${roleColonName[2].trim()} (${roleColonName[1].trim()})`);
        continue;
      }
      const nameParenRole = line.match(/^(.+?)\s*\((.+)\)$/);
      if (nameParenRole) {
        participants.push(`${nameParenRole[1].trim()} (${nameParenRole[2].trim()})`);
      }
    }
  }
  if (participants.length === 0) {
    // "com" ("with") is matched case-insensitively, but the name that
    // follows must start uppercase (avoids matching phrases like "compra o
    // teu bilhete aqui" / "buy your ticket here").
    const withLine = lines.find((l) => {
      const match = l.match(/^com\s+(.+)/i);
      return match && /^[A-ZÀ-Ý]/.test(match[1]);
    });
    if (withLine) {
      participants.push(
        ...withLine
          .replace(/^com\s+/i, '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
      );
    }
  }

  return { description, participants };
}
