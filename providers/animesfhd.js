// AnimesFHD — provider do Nuvio (REESCRITA ENXUTA).
//
// Site: https://animesfhd.net/ (PT-BR, animes, dublado e legendado).
// Sem login para navegar, sem captcha. Fluxo adaptado do provider
// animesfhd.js do Kamirama (Kamirama-Plugin) — que nunca foi registrado
// no manifest dele — reescrito do zero porque o bundle original
// (~2.800 linhas minificadas) não era viável no Nuvio:
//   1. TMDB (chave do app) -> título PT-BR + original + alternativos.
//   2. Busca: primeiro os carrosséis do GET /api/home (1 fetch);
//      se não casar, varre /animes?page=N com LIMITE de 12 páginas
//      (em lotes paralelos de 4, para no primeiro match >= 85).
//      A busca por API NÃO funciona: /api/animes/pesquisar dá 401
//      ("Você precisa estar conectado.") — nunca usar.
//   3. Episódios: GET /serie/<series_id> -> primeiro card
//      /episod/<id> -> GET /api/episodes/<id> -> versions[] traz
//      TODAS as versões (temporada, áudio, episode_count e
//      first_episode_id). O id do episódio é
//      first_episode_id + (nº - 1) (sequencial, confirmado ao vivo).
//      Uma entrada no catálogo destrava todas as temporadas/áudios.
//   4. Stream: GET /api/episodes/<id> -> sources[] com URL relativa
//      /api/v/sX?source=<id> (backends s2/s3/s4/s5/s6/s11). Cada fonte
//      é provada com fetch + Range (só entra o que responde mídia).
//      Dublado e legendado são devolvidos juntos.
//
// Limitações conhecidas (2026-11-10):
// - O backend s5 está fora do ar (502): títulos que só têm fonte s5
//   (ex.: Naruto) devolvem [] até ele voltar — o provider prova e
//   descarta, não é bug de busca. Demon Slayer e One Piece usam s6
//   e funcionam (HLS 200).
// - Só séries (supportedTypes ["tv"]): filmes não casam com o
//   catálogo e não são implementados.
// - O site divide temporadas longas (ex.: Naruto em 4 temporadas de
//   52/52/54/61 eps). O provider casa a temporada do TMDB com a do
//   site e, se não casar, tenta o nº global do episódio (soma das
//   temporadas anteriores no TMDB).
//
// Validado 2026-11-10 (VM, ao vivo, arquivo executado de verdade):
// - Demon Slayer s1e1: 2 streams (Dublado + Legendado 720p, HLS 200),
//   em 7,2 s.
// - One Piece s1e1: 2 streams (Dublado + Legendado 720p, HLS 200),
//   em 10,0 s.
// - Naruto s1e1 e s1e2: [] (fontes s5 dão 502 — backend fora do ar;
//   a busca encontra o título e as fontes; o probe descarta). 7,6 s
//   e 5,9 s. Se o s5 voltar, Naruto resolve sem mudar código.
// - Inexistente: [], em 1,4 s.
// Nenhuma chamada passou de ~10 s (limite prático ~20 s).
// Teste no Nuvio (celular do Davi) ainda pendente.

const MAIN_URL = 'https://animesfhd.net';
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const MAX_CATALOG_PAGES = 12;
const CATALOG_BATCH = 4;
const MAX_STREAMS = 3;
const PROBE_TIMEOUT_MS = 8000;

function headers(referer) {
  const h = { 'User-Agent': UA };
  if (referer) h.Referer = referer;
  return h;
}

async function fetchText(url, options) {
  const res = await fetch(url, options || {});
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return res.text();
}

async function fetchJson(url, options) {
  const res = await fetch(url, options || {});
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return res.json();
}

// Corrida com timeout (o setTimeout pode não existir no sandbox).
function withTimeout(promise, ms, fallback) {
  if (typeof setTimeout !== 'function') return promise;
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function words(s) {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

// Dice (bigramas de caracteres) entre duas strings normalizadas.
function dice(a, b) {
  const x = normalize(a).replace(/ /g, '');
  const y = normalize(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bg = (s) => {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const bx = bg(x);
  const by = bg(y);
  const setY = {};
  by.forEach((g) => { setY[g] = (setY[g] || 0) + 1; });
  let shared = 0;
  bx.forEach((g) => { if (setY[g]) { shared++; setY[g]--; } });
  return (2 * shared) / (bx.length + by.length);
}

// 0-100. Subconjunto de palavras = 85 - 5 por palavra extra;
// exato = 100; senão Dice.
function scoreTitle(query, candidate) {
  const nq = normalize(query);
  const nc = normalize(candidate);
  if (!nq || !nc) return 0;
  if (nc === nq) return 100;
  const qw = words(nq);
  const cw = words(nc);
  const qset = {};
  qw.forEach((w) => { qset[w] = true; });
  const cset = {};
  cw.forEach((w) => { cset[w] = true; });
  const qInC = qw.every((w) => cset[w]);
  const cInQ = cw.every((w) => qset[w]);
  let score;
  if (qInC || cInQ) {
    let extra = 0;
    qw.forEach((w) => { if (!cset[w]) extra++; });
    cw.forEach((w) => { if (!qset[w]) extra++; });
    score = 85 - 5 * extra;
  } else {
    score = dice(nq, nc) * 100;
  }
  return Math.max(0, Math.min(100, score));
}

function bestScore(queries, title) {
  let best = 0;
  for (const q of queries) best = Math.max(best, scoreTitle(q, title));
  return best;
}

// ---------------------------------------------------------------------------
// TMDB (chave do app). Sem a chave, não há como buscar o título.
// ---------------------------------------------------------------------------

async function tmdbRecord(tmdbId) {
  const key = globalThis.TMDB_API_KEY;
  if (!key) return null;
  const k = encodeURIComponent(key);
  const base = TMDB_API_URL + '/tv/' + tmdbId;
  const [pt, en, alt] = await Promise.all([
    fetchJson(base + '?language=pt-BR&api_key=' + k, { headers: headers() }).catch(() => null),
    fetchJson(base + '?language=en-US&api_key=' + k, { headers: headers() }).catch(() => null),
    fetchJson(base + '/alternative_titles?api_key=' + k, { headers: headers() }).catch(() => null),
  ]);
  if ((!pt || pt.success === false) && (!en || en.success === false)) return null;
  const titles = [];
  const add = (t) => { if (t && titles.indexOf(t) < 0) titles.push(t); };
  const rec = pt || en;
  add(rec.name);
  add(rec.original_name);
  add(en && en.name);
  add(en && en.original_name);
  if (alt && Array.isArray(alt.results)) {
    alt.results.forEach((r) => add(r.title));
  }
  // Parte após ":" ou "-" (ex.: "Demon Slayer: Kimetsu no Yaiba"
  // -> "Kimetsu no Yaiba", que é o título do site).
  const main = rec.name || rec.original_name || '';
  const tail = main.split(/[:\-–—]/).pop().trim();
  if (tail && tail !== main) add(tail);
  return {
    titles: titles,
    seasons: Array.isArray(rec.seasons) ? rec.seasons : [],
  };
}

// ---------------------------------------------------------------------------
// Busca no site.
// ---------------------------------------------------------------------------

// Candidatos dos carrosséis de /api/home (1 fetch; títulos populares
// costumam estar aqui e a varredura do catálogo é evitada).
async function homeCandidates() {
  let data;
  try {
    data = await withTimeout(
      fetchJson(MAIN_URL + '/api/home', { headers: headers() }),
      10000,
      null
    );
  } catch (_) {
    return [];
  }
  if (!data || typeof data !== 'object') return [];
  const out = [];
  const seen = {};
  const push = (item) => {
    if (!item) return;
    const id = String(item.series_id || item.id || '');
    const title = item.series_title || item.title || '';
    if (!id || !title || seen[id]) return;
    seen[id] = true;
    out.push({
      seriesId: id,
      title: title,
      audio: String(item.audio || item.category || '').toLowerCase(),
      season: Number(item.season) || 0,
    });
  };
  const buckets = [];
  if (Array.isArray(data.carousels)) {
    data.carousels.forEach((c) => { if (Array.isArray(c.items)) buckets.push(c.items); });
  }
  ['recent', 'releasing', 'today', 'hero', 'liked'].forEach((k) => {
    if (Array.isArray(data[k])) buckets.push(data[k]);
  });
  if (data.top && typeof data.top === 'object') {
    Object.keys(data.top).forEach((k) => {
      if (Array.isArray(data.top[k])) buckets.push(data.top[k]);
    });
  }
  buckets.forEach((list) => list.forEach(push));
  return out;
}

// Uma página do catálogo: cards /serie/<id> com <h3> de título e
// marcador de áudio no texto do card.
function parseCatalogPage(html) {
  const out = [];
  const re = /<a[^>]*href="\/serie\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = m[2];
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const rawTitle = h3 ? h3[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!rawTitle) continue;
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const audio = /dublado/i.test(text) ? 'dublado' : /legendado/i.test(text) ? 'legendado' : '';
    out.push({ seriesId: m[1], title: rawTitle, audio: audio, season: 0 });
  }
  return out;
}

async function scanCatalogBatch(start, queries) {
  const pages = [];
  for (let p = start; p < start + CATALOG_BATCH && p <= MAX_CATALOG_PAGES; p++) {
    pages.push(p);
  }
  const htmls = await Promise.all(pages.map((p) =>
    withTimeout(
      fetchText(MAIN_URL + '/animes?page=' + p, { headers: headers() }),
      10000,
      ''
    ).catch(() => '')
  ));
  const out = [];
  htmls.forEach((html) => {
    parseCatalogPage(html).forEach((c) => {
      c.score = bestScore(queries, c.title);
      if (c.score >= 60) out.push(c);
    });
  });
  return out;
}

// Busca: a home (1 fetch, títulos em destaque) roda em paralelo com
// o primeiro lote do catálogo; se a home casar (>= 85), a varredura
// para. Senão, os lotes seguintes do catálogo (teto 12 páginas).
async function searchSite(queries) {
  const seen = {};
  const collect = (list) => {
    const out = [];
    list.forEach((c) => {
      if (seen[c.seriesId]) return;
      seen[c.seriesId] = true;
      if (c.score >= 60) out.push(c);
    });
    return out;
  };
  const homeP = homeCandidates().then((list) => {
    list.forEach((c) => { c.score = bestScore(queries, c.title); });
    return collect(list).filter((c) => c.score >= 85);
  });
  const batch1P = scanCatalogBatch(1, queries).then(collect);
  const [homeHits, batch1] = await Promise.all([homeP, batch1P]);
  if (homeHits.length > 0) return homeHits;
  let found = batch1;
  if (found.some((c) => c.score >= 85)) {
    found.sort((a, b) => b.score - a.score);
    return found;
  }
  for (let start = 1 + CATALOG_BATCH; start <= MAX_CATALOG_PAGES; start += CATALOG_BATCH) {
    const batch = await scanCatalogBatch(start, queries).then(collect);
    found = found.concat(batch);
    if (batch.some((c) => c.score >= 85)) break;
  }
  found.sort((a, b) => b.score - a.score);
  return found;
}

// ---------------------------------------------------------------------------
// Episódios.
// ---------------------------------------------------------------------------

// Primeiro card /episod/<id> da página da série (ep 1 da versão).
async function seriesFirstEpisode(seriesId) {
  let html;
  try {
    html = await withTimeout(
      fetchText(MAIN_URL + '/serie/' + seriesId, { headers: headers(MAIN_URL + '/') }),
      10000,
      ''
    );
  } catch (_) {
    return null;
  }
  const m = String(html || '').match(/\/episod\/(\d+)"/);
  return m ? m[1] : null;
}

async function episodeData(episodeId) {
  try {
    return await withTimeout(
      fetchJson(MAIN_URL + '/api/episodes/' + episodeId, { headers: headers() }),
      10000,
      null
    );
  } catch (_) {
    return null;
  }
}

// versions[] -> id do episódio pedido por áudio. Primeiro o casamento
// direto (temporada + nº dentro da temporada); se não existir, o nº
// global do episódio (soma das temporadas anteriores no TMDB).
function resolveEpisodeIds(versions, season, episode, globalEpisode) {
  const byAudio = { dublado: null, legendado: null };
  const list = Array.isArray(versions) ? versions : [];
  const normAudio = (a) => String(a || '').toLowerCase().indexOf('dub') >= 0 ? 'dublado' : 'legendado';
  const pick = (epNum, useGlobal) => {
    const res = { dublado: null, legendado: null };
    list.forEach((v) => {
      const audio = normAudio(v.audio);
      if (res[audio]) return;
      const first = Number(v.first_episode_id) || 0;
      const count = Number(v.episode_count) || 0;
      if (!first || !count) return;
      if (!useGlobal) {
        if (Number(v.season) !== season) return;
        if (episode < 1 || episode > count) return;
        res[audio] = String(first + episode - 1);
      } else {
        // Faixa global desta versão (temporadas ordenadas por nº).
        let start = 1;
        const ordered = list
          .filter((x) => normAudio(x.audio) === audio)
          .sort((a, b) => (Number(a.season) || 0) - (Number(b.season) || 0));
        for (const x of ordered) {
          const c = Number(x.episode_count) || 0;
          if (x === v) break;
          start += c;
        }
        if (epNum >= start && epNum < start + count) {
          res[audio] = String(first + (epNum - start));
        }
      }
    });
    return res;
  };
  const direct = pick(episode, false);
  if (direct.dublado || direct.legendado) return direct;
  if (globalEpisode && globalEpisode !== episode) return pick(globalEpisode, true);
  return byAudio;
}

// ---------------------------------------------------------------------------
// Probe de mídia (mesma ideia do ve() do Kamirama): fetch + Range,
// só aceita o que responde mídia de verdade.
// ---------------------------------------------------------------------------

function bodyKind(text, contentType) {
  const head = String(text || '').replace(/^\uFEFF?\s*/, '').slice(0, 320);
  if (/^#EXTM3U\b/i.test(head)) return 'hls';
  if (/^<\?xml[^>]*>\s*<MPD\b|^<MPD\b/i.test(head)) return 'dash';
  if (/^.{0,32}ftyp/s.test(head)) return 'mp4';
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (/^(video|audio)\//.test(ct)) return 'mp4';
  if (/mpegurl/.test(ct)) return 'hls';
  if (/dash\+xml/.test(ct)) return 'dash';
  return '';
}

function isNotMedia(text, contentType) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (/^(image|font)\//.test(ct)) return true;
  if (/^text\/(html|css|javascript|xml)$/.test(ct)) return true;
  if (/^application\/(json|ld\+json|javascript|xml)$/.test(ct)) return true;
  const head = String(text || '').replace(/^\uFEFF?\s*/, '').slice(0, 320);
  return /^(<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|\{\s*["{]|\[\s*\{|not\s+found\b|access\s+denied\b|forbidden\b|error\b)/i.test(head);
}

function qualityFromMaster(master) {
  let maxH = 0;
  String(master || '').split('\n').forEach((line) => {
    const r = line.match(/RESOLUTION=\d+x(\d+)/);
    if (r) maxH = Math.max(maxH, parseInt(r[1], 10));
  });
  if (maxH >= 2160) return '2160p';
  if (maxH >= 1080) return '1080p';
  if (maxH >= 720) return '720p';
  if (maxH > 0) return '480p';
  return '720p';
}

function qualityFromUrl(url) {
  const m = String(url || '').match(/(?:^|[^0-9])(2160|1440|1080|720|480|360|240)p?(?:[^0-9]|$)/i);
  return m ? m[1] + 'p' : '720p';
}

async function probeSource(url, referer) {
  let res;
  try {
    res = await withTimeout(
      fetch(url, {
        headers: Object.assign(headers(referer), { Range: 'bytes=0-1023' }),
      }),
      PROBE_TIMEOUT_MS,
      null
    );
  } catch (_) {
    return null;
  }
  if (!res || !res.ok) return null;
  const ct = res.headers ? String(res.headers.get('content-type') || '') : '';
  let text = '';
  try {
    text = await withTimeout(res.text(), 5000, '');
  } catch (_) {
    return null;
  }
  if (isNotMedia(text, ct)) return null;
  const kind = bodyKind(text, ct);
  if (!kind) return null;
  let quality = qualityFromUrl(url);
  if (kind === 'hls') {
    // Master completa para medir a resolução máxima.
    try {
      const master = await withTimeout(
        fetchText(url, { headers: headers(referer) }),
        10000,
        ''
      );
      if (master && master.indexOf('#EXTM3U') === 0) quality = qualityFromMaster(master);
    } catch (_) {
      // Fica a qualidade padrão; o stream já provou ser HLS.
    }
  }
  return { kind: kind, quality: quality };
}

function absoluteUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return MAIN_URL + u;
  return MAIN_URL + '/' + u;
}

function audioLabel(audio) {
  return audio === 'dublado' ? 'Dublado' : 'Legendado';
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== 'tv') return [];
    const s = Number(season) || 1;
    const e = Number(episode) || 1;
    const id = String(tmdbId || '').trim();
    if (!/^\d+$/.test(id)) return [];

    const rec = await tmdbRecord(id);
    if (!rec || rec.titles.length === 0) return [];
    const queries = rec.titles;

    // Nº global do episódio (para o fallback de temporadas divididas).
    let globalEp = e;
    if (s > 1 && rec.seasons.length > 0) {
      let sum = 0;
      rec.seasons.forEach((sn) => {
        if (sn.season_number > 0 && sn.season_number < s) {
          sum += Number(sn.episode_count) || 0;
        }
      });
      globalEp = sum + e;
    }

    // 1) Carrosséis da home (em paralelo com o 1º lote do catálogo);
    // 2) varredura do catálogo (teto 12 págs).
    let candidates = await searchSite(queries);
    if (candidates.length === 0) return [];
    candidates.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Tenta os 2 melhores candidatos. O segundo só é tentado se o
    // primeiro não resolveu nenhum id de episódio (título errado):
    // se os ids resolveram mas as fontes estão mortas (ex.: s5 502),
    // outro candidato do mesmo título cairia no mesmo backend.
    const results = [];
    const tried = candidates.slice(0, 2);
    for (const cand of tried) {
      if (results.length >= MAX_STREAMS) break;
      const firstEp = await seriesFirstEpisode(cand.seriesId);
      if (!firstEp) continue;
      const data = await episodeData(firstEp);
      if (!data) continue;
      const ids = resolveEpisodeIds(data.versions, s, e, globalEp);
      const jobs = [];
      if (ids.dublado) jobs.push({ audio: 'dublado', epId: ids.dublado });
      if (ids.legendado) jobs.push({ audio: 'legendado', epId: ids.legendado });
      if (jobs.length === 0) continue;
      const settled = await Promise.all(jobs.map(async (job) => {
        const epData = await episodeData(job.epId);
        const sources = (epData && Array.isArray(epData.sources)) ? epData.sources : [];
        const out = [];
        for (const src of sources) {
          if (!src || !src.url) continue;
          const url = absoluteUrl(src.url);
          if (!/^https:\/\//i.test(url)) continue;
          const referer = MAIN_URL + '/episod/' + job.epId;
          const probed = await probeSource(url, referer);
          if (!probed) continue;
          out.push({
            name: 'AnimesFHD',
            title: audioLabel(job.audio) + ' ' + probed.quality,
            url: url,
            quality: probed.quality,
            headers: { Referer: referer, 'User-Agent': UA },
          });
          if (out.length >= 2) break;
        }
        return out;
      }));
      settled.forEach((list) => list.forEach((st) => {
        if (results.length < MAX_STREAMS && !results.some((r) => r.url === st.url)) {
          results.push(st);
        }
      }));
      // Ids resolvidos: este era o título certo. Não adianta tentar
      // outro candidato do mesmo título (mesmos backends).
      break;
    }
    return results;
  } catch (error) {
    console.error('[AnimesFHD] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { normalize, scoreTitle, parseCatalogPage, resolveEpisodeIds };
