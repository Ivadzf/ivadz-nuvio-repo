// MegaFlix — provider do Nuvio para o site megaflixonline.sbs.
//
// O MegaFlix é o site parceiro do SuperFlixAPI: filmes e séries com
// áudio em PT-BR (dublado/legendado). O port reescreve em JS só a parte
// que o Nuvio precisa: TMDB id -> título -> busca no site -> página do
// filme/episódio -> fontes de vídeo. O site não tem extensão no
// CloudStream; o fluxo foi mapeado direto do site (página + JS do player).
//
// Fluxo do vídeo (mapeado do site em 2026-11-08):
//   1. Busca: GET /pesquisar?s=<título>&type=1|2 -> cards <article> com
//      link, título, ano e tipo (Filme/Série). type=1 é filme, type=2 série.
//   2. Filme: a página é /filme/<slug>. Série: /serie/<slug>/<temp>/<ep>.
//      A página traz <div data-playbackhandle="ph_..."> e o player faz
//      POST /__siteplay/start com {"handle": ...}.
//   3. Antes do POST, o player busca o token CSRF em GET /csrf-token
//      (JSON {"token": "..."}) e envia X-CSRF-TOKEN + os cookies da sessão.
//   4. O POST devolve JSON {sources: [{label, url}]}. As fontes são
//      frames do WarezCDN (https://warezcdn.sbs/__siteplay/frame/pg_...)
//      ou URLs diretas. O frame é resolvido buscando o .m3u8/.mp4 no HTML.
//   5. O player do site é HLS adaptativo, com faixas de áudio English e
//      Portuguese — por isso a qualidade vem do master .m3u8 quando dá.
//
// Limitações conhecidas (validadas em 2026-11-08):
//   - O playbackHandle parece ser amarrado ao IP/cliente: da VM (IP de
//     saída rotativo) o POST /__siteplay/start sempre devolve 419
//     "Sessão de reprodução expirada", mas no navegador real o fluxo
//     completo funciona e o episódio toca (Breaking Bad 1x1 confirmado).
//     No celular (IP residencial estável, como o do Nuvio) o fluxo deve
//     funcionar como no navegador. O teste final é no Nuvio.
//   - O token do frame (pg_...) é de uso único e curta duração: não dá
//     para reaproveitar entre sessões.
//   - O site exibe anúncios agressivos no navegador (aba de cassino ao
//     clicar em "Servidor Principal"), mas o provider só extrai as URLs
//     de vídeo — nenhum anúncio chega ao Nuvio.
//
// A chave do TMDB vem do app (globalThis.TMDB_API_KEY), como no Goyabu,
// AniTube e DattebayoBR. Este arquivo SUBSTITUI o megaflix.js antigo,
// que apontava para o megaflix.lat (site morto — não responde mais).

const cheerio = require('cheerio-without-node-native');

const BASE_URL = 'https://megaflixonline.sbs';
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36';
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const FETCH_TIMEOUT_MS = 15000;
const FRAME_TIMEOUT_MS = 10000;

function normalize(text) {
  let t = String(text || '');
  try {
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) { /* sem normalize, segue com o texto original */ }
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreTitle(candidate, target) {
  const a = normalize(candidate);
  const b = normalize(target);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const aWords = a.split(' ');
  const bWords = b.split(' ');
  const common = aWords.filter((w) => bWords.includes(w)).length;
  const ratio = common / Math.max(aWords.length, bWords.length);
  return Math.round(ratio * 70);
}

function withTimeout(promise, ms) {
  if (typeof setTimeout !== 'function') return promise;
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).then((v) => {
    if (timer) clearTimeout(timer);
    return v;
  });
}

function extractCookieHeader(res) {
  try {
    if (res.headers && typeof res.headers.getSetCookie === 'function') {
      const parts = res.headers.getSetCookie().map((c) => c.split(';')[0].trim()).filter(Boolean);
      if (parts.length) return parts.join('; ');
    }
    if (res.headers && typeof res.headers.get === 'function') {
      const raw = res.headers.get('set-cookie') || '';
      const parts = raw.split(/,(?=\s*[A-Za-z0-9_.-]+=)/).map((c) => c.split(';')[0].trim()).filter((c) => c.includes('='));
      if (parts.length) return parts.join('; ');
    }
  } catch (e) { /* sem cookies, segue sem eles */ }
  return '';
}

function mergeCookieJar(jar, extra) {
  const map = new Map();
  const add = (s) => {
    String(s || '').split(';').forEach((pair) => {
      const p = pair.trim();
      if (!p || !p.includes('=')) return;
      const eq = p.indexOf('=');
      map.set(p.slice(0, eq).trim(), p.slice(eq + 1).trim());
    });
  };
  add(jar);
  add(extra);
  return [...map.entries()].map(([k, v]) => k + '=' + v).join('; ');
}

// GET/POST com jar de cookies. Devolve {res, text, jar} sem lançar erro
// em status HTTP de erro — quem chama decide o que fazer.
async function doFetch(url, options, jar, timeoutMs) {
  const headers = Object.assign({}, (options && options.headers) || {});
  if (jar) headers.Cookie = jar;
  const init = Object.assign({}, options || {}, { headers });
  const res = await withTimeout(fetch(url, init), timeoutMs || FETCH_TIMEOUT_MS);
  if (!res) return { res: null, text: '', jar: jar || '', status: 0 };
  const newJar = mergeCookieJar(jar || '', extractCookieHeader(res));
  let text = '';
  try {
    text = await withTimeout(res.text(), 8000);
    if (text === null || text === undefined) text = '';
  } catch (e) {
    text = '';
  }
  return { res, text, jar: newJar, status: res.status };
}

function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('TMDB_API_KEY indisponível: o app não forneceu a chave do TMDB ao plugin');
  }
  return key.trim();
}

// TMDB -> títulos candidatos + ano. Funciona para filme e série.
async function getTmdbInfo(tmdbId, mediaType) {
  const key = readApiKey();
  const kind = mediaType === 'movie' ? 'movie' : 'tv';
  const url =
    TMDB_API_URL + '/' + kind + '/' + tmdbId +
    '?api_key=' + encodeURIComponent(key) +
    '&language=pt-BR&append_to_response=alternative_titles';
  const { res, text } = await doFetch(url, { headers: { Accept: 'application/json' } }, '');
  if (!res || !res.ok) throw new Error('TMDB respondeu HTTP ' + (res ? res.status : 0));
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('TMDB devolveu JSON inválido');
  }
  const titles = [];
  const push = (t) => {
    const v = String(t || '').trim();
    if (v && !titles.includes(v)) titles.push(v);
  };
  if (kind === 'movie') {
    push(data.title);
    push(data.original_title);
    const date = data.release_date || '';
    var year = date ? Number(String(date).slice(0, 4)) : null;
  } else {
    push(data.name);
    push(data.original_name);
    const date = data.first_air_date || '';
    var year = date ? Number(String(date).slice(0, 4)) : null;
  }
  const alts = (data.alternative_titles && (data.alternative_titles.results || data.alternative_titles.titles)) || [];
  for (const alt of alts) {
    if (alt && /^(pt|BR)/i.test(String(alt.iso_3166_1 || ''))) push(alt.title);
  }
  for (const alt of alts) push(alt.title);
  if (!titles.length) throw new Error('TMDB não retornou título para ' + kind + ' ' + tmdbId);
  return { titles: titles.slice(0, 5), year: year || null };
}

// Busca no MegaFlix. Devolve cards {title, url, year, type}.
async function searchMegaflix(query, mediaType, jar) {
  const typeParam = mediaType === 'movie' ? '&type=1' : mediaType === 'tv' ? '&type=2' : '';
  const url = BASE_URL + '/pesquisar?s=' + encodeURIComponent(query.trim()) + typeParam;
  const { res, text, jar: newJar } = await doFetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: BASE_URL + '/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  }, jar || '');
  if (!res || !res.ok) return { results: [], jar: newJar };
  return { results: parseSearchCards(text), jar: newJar };
}

function parseSearchCards(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('article').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a[href*="/filme/"], a[href*="/serie/"]').first();
    const href = $a.attr('href') || '';
    if (!href) return;
    const fullUrl = href.startsWith('http') ? href : BASE_URL + (href.startsWith('/') ? href : '/' + href);
    const imgAlt = $el.find('img[alt]').first().attr('alt') || '';
    let title = imgAlt.replace(/\s+poster\s*$/i, '').trim();
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const yearMatch = /\b((?:19|20)\d{2})\b/.exec(text);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    if (!title) {
      const m = /Assistir\s+(.+?)\s+(?:19|20)\d{2}\b/i.exec(text);
      title = m ? m[1].trim() : '';
    }
    if (!title) return;
    const type = /\/serie\//.test(fullUrl) ? 'tv' : 'movie';
    if (!results.some((r) => r.url === fullUrl)) {
      results.push({ title, url: fullUrl, year, type });
    }
  });
  return results;
}

function extractPlaybackHandle(html) {
  const $ = cheerio.load(html || '');
  const fromDom = $('[data-playbackhandle]').first().attr('data-playbackhandle') || '';
  if (fromDom) return fromDom.trim();
  const m = /data-playbackhandle\s*=\s*"([^"]+)"/.exec(String(html || ''));
  return m ? m[1].trim() : '';
}

// Token CSRF: GET /csrf-token -> {"token": "..."} (e os cookies da sessão).
async function getCsrfToken(referer, jar) {
  const { res, text, jar: newJar } = await doFetch(BASE_URL + '/csrf-token', {
    headers: {
      'User-Agent': UA,
      Referer: referer || BASE_URL + '/',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  }, jar || '');
  let token = '';
  if (res && res.ok) {
    try {
      const data = JSON.parse(text);
      token = String((data && (data.token || data.csrf_token)) || '').trim();
    } catch (e) {
      token = '';
    }
  }
  return { token, jar: newJar };
}

// POST /__siteplay/start -> {sources: [{label, url}]}.
async function startPlayback(handle, csrfToken, referer, jar) {
  const { res, text, jar: newJar } = await doFetch(BASE_URL + '/__siteplay/start', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken || '',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ handle }),
  }, jar || '');
  if (!res || !res.ok) {
    console.log('[MegaFlix] /__siteplay/start respondeu HTTP ' + (res ? res.status : 0) + ': ' + String(text || '').slice(0, 120));
    return { sources: [], jar: newJar };
  }
  try {
    const data = JSON.parse(text);
    const sources = Array.isArray(data && data.sources) ? data.sources : [];
    return { sources, jar: newJar };
  } catch (e) {
    return { sources: [], jar: newJar };
  }
}

function cleanVideoUrl(raw, base) {
  let u = String(raw || '').trim();
  if (!u) return '';
  u = u.replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/\\&/g, '&').replace(/\\"/g, '"');
  if (/^\/\//.test(u)) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u)) {
    if (!base) return '';
    try {
      u = new URL(u, base).toString();
    } catch (e) {
      return '';
    }
  }
  return u.split('#')[0];
}

function isDirectVideo(url) {
  return /\.(m3u8|mp4)(\?|#|$)/i.test(String(url || ''));
}

function extractVideoUrls(html, base) {
  const found = [];
  const push = (raw) => {
    const u = cleanVideoUrl(raw, base);
    if (u && isDirectVideo(u) && !found.includes(u)) found.push(u);
  };
  const patterns = [
    /["']?file["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
    /["']?(?:src|source|url)["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
    /sources\s*:\s*\[\s*\{\s*(?:src|file)\s*:\s*["']([^"']+)["']/gi,
    /["'](https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)["']/gi,
    /["'](https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*)["']/gi,
    /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/gi,
    /(https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*)/gi,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(String(html || '')))) push(m[1]);
    if (found.length) break;
  }
  return found;
}

function extractFirstIframeSrc(html, base) {
  const m = /<iframe[^>]+src\s*=\s*["']([^"']+)["']/i.exec(String(html || ''));
  if (!m) return '';
  return cleanVideoUrl(m[1], base);
}

// Resolve uma fonte do start: URL direta ou página de embed (frame do
// WarezCDN ou outro host). Segue no máximo um iframe aninhado.
async function resolveSource(sourceUrl, referer, jar) {
  const clean = cleanVideoUrl(sourceUrl, referer);
  if (!clean) return [];
  if (isDirectVideo(clean)) return [clean];
  const first = await doFetch(clean, {
    headers: {
      'User-Agent': UA,
      Referer: referer || BASE_URL + '/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  }, jar || '', FRAME_TIMEOUT_MS);
  if (!first.res || !first.res.ok || !first.text) return [];
  let videos = extractVideoUrls(first.text, clean);
  if (videos.length) return videos;
  const nested = extractFirstIframeSrc(first.text, clean);
  if (nested && nested !== clean && !isDirectVideo(nested)) {
    const second = await doFetch(nested, {
      headers: {
        'User-Agent': UA,
        Referer: clean,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, first.jar, FRAME_TIMEOUT_MS);
    if (second.res && second.res.ok && second.text) {
      videos = extractVideoUrls(second.text, nested);
      if (videos.length) return videos;
    }
  } else if (nested && isDirectVideo(nested)) {
    return [nested];
  }
  return [];
}

function qualityFromLabel(text) {
  if (/2160|4k|uhd/i.test(String(text || ''))) return '2160p';
  const m = /(1440|1080|720|480|360|240)\s*p?/i.exec(String(text || ''));
  return m ? m[1] + 'p' : '';
}

// Qualidade lendo o master .m3u8 (maior RESOLUTION). Best-effort.
async function qualityFromMaster(m3u8Url, headers) {
  try {
    const { res, text } = await doFetch(m3u8Url, { headers }, '', 8000);
    if (!res || !res.ok || !text || !/#EXTM3U/i.test(text)) return '';
    let best = 0;
    const re = /RESOLUTION=\d+x(\d+)/gi;
    let m;
    while ((m = re.exec(text))) best = Math.max(best, parseInt(m[1], 10) || 0);
    if (!best) return '';
    if (best >= 2000) return '2160p';
    if (best >= 1400) return '1440p';
    if (best >= 1000) return '1080p';
    if (best >= 700) return '720p';
    if (best >= 470) return '480p';
    if (best >= 350) return '360p';
    return best + 'p';
  } catch (e) {
    return '';
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const kind = mediaType === 'movie' ? 'movie' : 'tv';
    const ep = Number(episode) || 1;
    const sn = Number(season) || 1;

    const { titles, year: tmdbYear } = await getTmdbInfo(tmdbId, kind);
    const target = titles[0];
    if (!target) return [];

    // Busca: tenta os títulos em ordem até achar um candidato bom.
    let jar = '';
    const candidates = [];
    const queries = titles.slice(0, 4);
    for (const query of queries) {
      try {
        const { results, jar: newJar } = await searchMegaflix(query, kind, jar);
        jar = newJar || jar;
        for (const r of results) {
          const score = scoreTitle(r.title, target);
          if (score >= 60) {
            const yearBonus = tmdbYear && r.year === tmdbYear ? 20 : 0;
            candidates.push({ title: r.title, url: r.url, year: r.year, type: r.type, score: score + yearBonus });
          }
        }
      } catch (e) {
        console.log('[MegaFlix] Busca por "' + query + '" falhou: ' + (e && e.message ? e.message : e));
      }
      const top = candidates.reduce((m, c) => Math.max(m, c.score), 0);
      if (top >= 100) break;
    }
    // Prefere o tipo certo (filme/série); sem ele, aceita qualquer tipo.
    let pool = candidates.filter((c) => c.type === kind);
    if (!pool.length) pool = candidates;
    pool.sort((a, b) => b.score - a.score);
    const best = pool.length ? pool[0] : null;
    if (!best) {
      console.log('[MegaFlix] Nada encontrado para "' + target + '"');
      return [];
    }

    const contentUrl = kind === 'movie'
      ? best.url
      : best.url.replace(/\/+$/, '') + '/' + sn + '/' + ep;

    const page = await doFetch(contentUrl, {
      headers: {
        'User-Agent': UA,
        Referer: BASE_URL + '/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    }, jar);
    jar = page.jar || jar;
    if (!page.res || !page.res.ok || !page.text) {
      console.log('[MegaFlix] Página do conteúdo respondeu HTTP ' + (page.res ? page.res.status : 0));
      return [];
    }
    const handle = extractPlaybackHandle(page.text);
    if (!handle) {
      console.log('[MegaFlix] playbackHandle não encontrado em ' + contentUrl);
      return [];
    }

    const { token: csrfToken, jar: jar2 } = await getCsrfToken(contentUrl, jar);
    jar = jar2 || jar;
    const { sources } = await startPlayback(handle, csrfToken, contentUrl, jar);
    if (!sources.length) {
      console.log('[MegaFlix] /__siteplay/start não devolveu fontes para "' + target + '"');
      return [];
    }

    const streams = [];
    const seen = new Set();
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i] || {};
      const rawUrl = String(src.url || '').trim();
      if (!rawUrl) continue;
      const label = String(src.label || ('Fonte ' + (i + 1))).trim();
      try {
        const videos = await resolveSource(rawUrl, contentUrl, jar);
        for (const videoUrl of videos) {
          if (seen.has(videoUrl)) continue;
          seen.add(videoUrl);
          const audio = /dublado/i.test(label) ? 'Dublado' : /legendado/i.test(label) ? 'Legendado' : '';
          streams.push({
            name: 'MegaFlix',
            title: 'MegaFlix (' + label + (audio ? ' - ' + audio : '') + ')',
            url: videoUrl,
            quality: qualityFromLabel(label),
            headers: { Referer: cleanVideoUrl(rawUrl, contentUrl) || contentUrl, 'User-Agent': UA },
            _sourceUrl: rawUrl,
          });
        }
      } catch (e) {
        console.log('[MegaFlix] Fonte "' + label + '" falhou: ' + (e && e.message ? e.message : e));
      }
    }

    // Qualidade real via master .m3u8 (quando ainda não conhecida).
    await Promise.all(streams.map(async (s) => {
      if (s.quality) return;
      if (!/\.m3u8(\?|#|$)/i.test(s.url)) return;
      const q = await qualityFromMaster(s.url, s.headers);
      if (q) s.quality = q;
    }));
    for (const s of streams) {
      if (!s.quality) s.quality = 'Auto';
      delete s._sourceUrl;
    }

    const order = (q) => {
      const m = /(\d{3,4})p/.exec(String(q || ''));
      return m ? parseInt(m[1], 10) : 0;
    };
    streams.sort((a, b) => order(b.quality) - order(a.quality));
    return streams;
  } catch (error) {
    console.error('[MegaFlix] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = {
  normalize,
  scoreTitle,
  parseSearchCards,
  extractPlaybackHandle,
  extractVideoUrls,
  cleanVideoUrl,
  mergeCookieJar,
};
