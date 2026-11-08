// DattebayoBR — provider do Nuvio portado do CloudStream (lawlietbr/lietrepo).
//
// O Dattebayo BR é um site de anime (também tem tokusatsu, dorama e
// donghua) em PT-BR. O port reescreve em JS só a parte que o Nuvio
// precisa: TMDB id -> título -> busca no site -> página do anime ->
// episódio -> links de vídeo. A extensão original em Kotlin também
// fazia catálogo, mas o Nuvio já faz isso via TMDB.
//
// Fluxo do vídeo (igual ao DattebayoBR.kt): a página do episódio
// (https://www.dattebayo-br.com/videos/<id>) tem scripts com
//   var vid = 'https://<host>.r2.cloudflarestorage.com/<caminho>.mp4'
// (MP4 direto no Cloudflare R2). A qualidade vem do id do container
// pai (jwContainer_2 = FULLHD, jwContainer_1 = HD, jwContainer_0 = SD)
// ou do caminho da URL (/fful/ = FULLHD, /f222/ e /f333/ = HD,
// /fiphoneb/ e /fiphonec/ = SD).
// A URL crua precisa de parâmetros de autenticação, obtidos assim:
//   1. GET https://widgets.outbrain.com/outbrain.js
//   2. POST https://ads.animeyabu.net/ (form: category=client,
//      type=premium, ad=<conteúdo do outbrain.js>) -> JSON array,
//      [0].publicidade = token
//   3. GET https://ads.animeyabu.net/?token=<token>&url=<baseUrl>
//      -> JSON array, [0].publicidade = parâmetros de autenticação
//   4. URL final = baseUrl + authParams
// A chave do TMDB vem do app (globalThis.TMDB_API_KEY), como no
// Goyabu e no AniTube.
//
// Detalhe verificado no navegador: o href da busca (/animes/<slug>)
// NÃO é a URL real da página do anime — o site resolve para
// /anime-dublado/<hash> (e ir direto no /animes/<slug> volta pra
// home). O provider segue os redirecionamentos do fetch, que é o
// mesmo comportamento do clique no site.

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://www.dattebayo-br.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const OUTBRAIN_URL = 'https://widgets.outbrain.com/outbrain.js';
const ADS_API_URL = 'https://ads.animeyabu.net/';

const QUALITY_PRIORITY = { FULLHD: 4, HD: 3, SD: 2, Unknown: 1 };
const QUALITY_VALUE = { FULLHD: 1080, HD: 720, SD: 480, Unknown: 720 };

function isDub(title, url) {
  return /dublado/i.test(String(title || '')) ||
    /dublado/i.test(String(url || '')) ||
    /anime-dublado/i.test(String(url || ''));
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*ep\s*\d+/gi, '')
    .replace(/\s*-\s*final/gi, '')
    .replace(/- dublado/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('TMDB_API_KEY indisponível: o app não forneceu a chave do TMDB ao plugin');
  }
  return key.trim();
}

// TMDB -> títulos candidatos para buscar no Dattebayo.
async function getTmdbTitles(tmdbId, mediaType) {
  const key = readApiKey();
  const kind = mediaType === 'movie' ? 'movie' : 'tv';
  const url =
    TMDB_API_URL + '/' + kind + '/' + tmdbId +
    '?api_key=' + encodeURIComponent(key) +
    '&language=pt-BR&append_to_response=alternative_titles';
  const data = await fetchJson(url);
  const mainTitle = data && (data.title || data.name);
  if (!mainTitle) throw new Error('TMDB não retornou título para ' + kind + ' ' + tmdbId);
  const titles = [];
  const push = (t) => {
    const v = String(t || '').trim();
    if (v && !titles.includes(v)) titles.push(v);
  };
  push(mainTitle);
  push(data.original_title || data.original_name);
  const alts = (data.alternative_titles && data.alternative_titles.results) || [];
  for (const alt of alts) {
    if (alt && /^(pt|BR)/i.test(String(alt.iso_3166_1 || ''))) push(alt.title);
  }
  for (const alt of alts) push(alt.title);
  const date = data.release_date || data.first_air_date;
  return {
    titles: titles.slice(0, 5),
    year: date ? Number(String(date).slice(0, 4)) : null,
  };
}

function extractEpisodeNumber(title) {
  const t = String(title || '');
  let m = /ep(?:is[oó]dio)?\s*(\d+)/i.exec(t);
  if (m) return parseInt(m[1], 10);
  m = /-\s*(\d+)/.exec(t);
  if (m) return parseInt(m[1], 10);
  m = /\b(\d+)\s*$/.exec(t);
  if (m) return parseInt(m[1], 10);
  return null;
}

// Busca no Dattebayo. Devolve animes e episódios.
async function searchDattebayo(query) {
  const formatted = query.trim().replace(/\s+/g, '+');
  const url = MAIN_URL + '/busca?busca=' + encodeURIComponent(formatted);
  const html = await fetchText(url, { headers: { 'User-Agent': UA, Referer: MAIN_URL } });
  const $ = cheerio.load(html);
  const results = [];
  $('.ultimosAnimesHomeItem, .ultimosEpisodiosHomeItem').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a').first();
    const href = link.attr('href') || '';
    if (!href) return;
    const title = $el.find('.ultimosAnimesHomeItemInfosNome, .ultimosEpisodiosHomeItemInfosNome').first().text().trim();
    if (!title) return;
    const fullUrl = href.startsWith('http') ? href : MAIN_URL + (href.startsWith('/') ? href : '/' + href);
    const hasEpNum = $el.find('.ultimosEpisodiosHomeItemInfosNum').length > 0;
    const dub = isDub(title, fullUrl);
    if (hasEpNum) {
      const epNumber = extractEpisodeNumber(title);
      const animeTitle = cleanTitle(title);
      if (!results.some((r) => r.url === fullUrl)) {
        results.push({ title: animeTitle, url: fullUrl, episode: epNumber, isEpisode: true, dubbed: dub });
      }
    } else {
      const clean = cleanTitle(title);
      if (!clean) return;
      if (!results.some((r) => r.url === fullUrl)) {
        results.push({ title: clean, url: fullUrl, episode: null, isEpisode: false, dubbed: dub });
      }
    }
  });
  return results;
}

// Ano do anime na página ("Ano 2002" nas linhas de metadados).
function parseAnimeYear(html) {
  const $ = cheerio.load(html);
  let year = null;
  $('.aniInfosSingleNumsItem').each((_, el) => {
    const text = $(el).text();
    if (/Ano/i.test(text)) {
      const m = /Ano\s*(\d{4})/i.exec(text);
      if (m) year = parseInt(m[1], 10);
    }
  });
  return year;
}

// Última página de episódios, descoberta nos links da página.
function parseLastPage(html) {
  const $ = cheerio.load(html);
  let last = 1;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = /(?:\/page\/|[?&]page=)(\d+)/.exec(href);
    if (m) last = Math.max(last, parseInt(m[1], 10));
  });
  return last;
}

function parseEpisodesFromDoc(html, episodeNumber) {
  const $ = cheerio.load(html);
  let found = null;
  $('.aniContainer .ultimosEpisodiosHomeItem').each((_, el) => {
    if (found) return;
    const $el = $(el);
    const link = $el.find('a').first();
    const href = link.attr('href') || '';
    if (!href) return;
    const episodeTitle =
      (link.attr('title') || '').trim() ||
      $el.find('.ultimosAnimesHomeItemInfosNome').first().text().trim();
    if (!episodeTitle) return;
    const epNum = extractEpisodeNumber(episodeTitle);
    if (epNum === episodeNumber || (epNum === null && episodeNumber === 1)) {
      found = href.startsWith('http') ? href : MAIN_URL + (href.startsWith('/') ? href : '/' + href);
    }
  });
  return found;
}

function qualityFromContainer(containerId, url) {
  if (containerId === 'jwContainer_2' || (url && url.includes('/fful/'))) return 'FULLHD';
  if (containerId === 'jwContainer_1' || (url && (url.includes('/f222/') || url.includes('/f333/')))) return 'HD';
  if (containerId === 'jwContainer_0' || (url && (url.includes('/fiphoneb/') || url.includes('/fiphonec/')))) return 'SD';
  return 'Unknown';
}

// Extrai as URLs mp4 (R2) da página do episódio.
function findAllVideoUrls(html) {
  const $ = cheerio.load(html);
  const videoUrls = [];
  const push = (url, quality) => {
    if (url && !videoUrls.some((v) => v.url === url)) {
      videoUrls.push({ url, quality: quality || 'Unknown' });
    }
  };
  $('script').each((_, script) => {
    const content = $(script).html() || '';
    const regex = /var vid = '(https?:\/\/[a-zA-Z0-9]+\.r2\.cloudflarestorage\.com\/[^']+\.mp4)'/g;
    for (const match of content.matchAll(regex)) {
      const url = match[1];
      const parentId = $(script).parent().attr('id') || '';
      push(url, qualityFromContainer(parentId, url));
    }
  });
  // Fallback: varre o HTML inteiro por URLs R2 .mp4.
  const cloudflareRegex = /https?:\/\/[a-zA-Z0-9]+\.r2\.cloudflarestorage\.com\/[a-zA-Z0-9]+\/[0-9]+\.mp4/g;
  for (const match of String(html).matchAll(cloudflareRegex)) {
    push(match[0], qualityFromContainer('', match[0]));
  }
  return videoUrls.sort((a, b) => (QUALITY_PRIORITY[b.quality] || 0) - (QUALITY_PRIORITY[a.quality] || 0));
}

function extractTokenFromJson(jsonString) {
  try {
    const arr = JSON.parse(String(jsonString || ''));
    if (Array.isArray(arr) && arr[0] && typeof arr[0].publicidade === 'string') {
      return arr[0].publicidade;
    }
  } catch (e) { /* não é JSON válido */ }
  return null;
}

// Dança do token: outbrain.js -> POST ads -> token -> GET ads?token&url -> authParams.
async function resolveVideoUrl(baseUrl, outbrainJs) {
  const headers = {
    Referer: MAIN_URL,
    'User-Agent': UA,
  };
  const form = new URLSearchParams();
  form.append('category', 'client');
  form.append('type', 'premium');
  form.append('ad', outbrainJs);
  const firstResponse = await fetchText(ADS_API_URL, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const token = extractTokenFromJson(firstResponse);
  if (!token) throw new Error('ads.animeyabu.net não devolveu token');
  const secondUrl = ADS_API_URL + '?token=' + encodeURIComponent(token) + '&url=' + encodeURIComponent(baseUrl);
  const secondResponse = await fetchText(secondUrl, { headers });
  const authParams = extractTokenFromJson(secondResponse);
  if (!authParams) throw new Error('ads.animeyabu.net não devolveu os parâmetros de autenticação');
  return baseUrl + authParams;
}

async function extractEpisodeLinks(episodeUrl) {
  const html = await fetchText(episodeUrl, {
    headers: { 'User-Agent': UA, Referer: MAIN_URL },
  });
  const baseUrls = findAllVideoUrls(html);
  if (!baseUrls.length) return [];
  // O outbrain.js é o mesmo para todas as URLs: busca uma vez só.
  const outbrainJs = await fetchText(OUTBRAIN_URL, {
    headers: { Referer: MAIN_URL, 'User-Agent': UA },
  });
  const streams = [];
  for (const { url, quality } of baseUrls) {
    try {
      const finalUrl = await resolveVideoUrl(url, outbrainJs);
      streams.push({
        name: 'DattebayoBR',
        title: 'DattebayoBR (' + quality + ')',
        url: finalUrl,
        quality: (QUALITY_VALUE[quality] || 720) + 'p',
        headers: { Referer: MAIN_URL, 'User-Agent': UA },
      });
    } catch (e) {
      console.log('[DattebayoBR] Falha ao resolver ' + quality + ': ' + (e && e.message ? e.message : e));
    }
  }
  return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const ep = Number(episode) || 1;
    const sn = Number(season) || 1;
    const isMovie = mediaType === 'movie';

    const { titles, year: tmdbYear } = await getTmdbTitles(tmdbId, mediaType);
    if (!titles.length) return [];

    const queries = [];
    const pushQuery = (q) => {
      const v = String(q || '').trim();
      if (v && !queries.includes(v)) queries.push(v);
    };
    if (sn > 1 && !isMovie) pushQuery(titles[0] + ' ' + sn + 'ª temporada');
    for (const t of titles) pushQuery(t);
    const target = titles[0];

    const animeCandidates = [];
    let bestEpisode = null;
    let bestEpisodeScore = 0;
    for (const query of queries.slice(0, 4)) {
      const results = await searchDattebayo(query);
      for (const r of results) {
        const score = scoreTitle(r.title, target);
        if (!r.isEpisode && score >= 60 && !animeCandidates.some((c) => c.url === r.url)) {
          animeCandidates.push({ title: r.title, url: r.url, score, dubbed: !!r.dubbed });
        }
        if (r.isEpisode && r.episode === ep && score > bestEpisodeScore) { bestEpisodeScore = score; bestEpisode = r; }
      }
      const top = animeCandidates.reduce((m, c) => Math.max(m, c.score), 0);
      if (top >= 100) break;
    }
    animeCandidates.sort((a, b) => b.score - a.score);
    const bestAnimeScore = animeCandidates.length ? animeCandidates[0].score : 0;

    // Desempate por ano (ex.: Naruto vs Naruto Shippuden) e preferência por dublado.
    let bestAnime = animeCandidates.length ? animeCandidates[0] : null;
    let bestAnimeHtml = null;
    const topScore = bestAnimeScore;
    const tied = animeCandidates.filter((c) => c.score === topScore).slice(0, 6);
    if (tied.length > 1 && tmdbYear) {
      const yearMatches = [];
      for (const cand of tied) {
        try {
          const pageHtml = await fetchText(cand.url, {
            headers: { 'User-Agent': UA, Referer: MAIN_URL },
          });
          if (parseAnimeYear(pageHtml) === tmdbYear) {
            yearMatches.push({ cand, pageHtml });
          }
        } catch (e) { /* tenta o próximo empatado */ }
      }
      if (yearMatches.length) {
        const dubbed = yearMatches.find((x) => x.cand.dubbed);
        const pick = dubbed || yearMatches[0];
        bestAnime = pick.cand;
        bestAnimeHtml = pick.pageHtml;
      }
    }

    let episodeUrl = null;
    if (bestAnime && bestAnimeScore >= 60) {
      const animeHtml = bestAnimeHtml || await fetchText(bestAnime.url, {
        headers: { 'User-Agent': UA, Referer: MAIN_URL },
      });
      episodeUrl = parseEpisodesFromDoc(animeHtml, isMovie ? 1 : ep);
      if (!episodeUrl) {
        // Lista de episódios paginada: procura nas próximas páginas.
        const lastPage = parseLastPage(animeHtml);
        const baseUrl = bestAnime.url.replace(/\/$/, '');
        const pageUrls = [];
        for (let p = 2; p <= Math.min(lastPage, 10); p++) pageUrls.push(baseUrl + '/page/' + p);
        const pages = await Promise.all(
          pageUrls.map((u) =>
            fetchText(u, { headers: { 'User-Agent': UA, Referer: MAIN_URL } }).catch(() => null)
          )
        );
        for (const pageHtml of pages) {
          if (!pageHtml) continue;
          episodeUrl = parseEpisodesFromDoc(pageHtml, isMovie ? 1 : ep);
          if (episodeUrl) break;
        }
      }
    }
    if (!episodeUrl && bestEpisode && bestEpisodeScore >= 60) {
      episodeUrl = bestEpisode.url;
    }
    if (!episodeUrl) {
      console.log('[DattebayoBR] Episódio ' + ep + ' não encontrado para "' + target + '"');
      return [];
    }
    return await extractEpisodeLinks(episodeUrl);
  } catch (error) {
    console.error('[DattebayoBR] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = {
  cleanTitle, normalize, scoreTitle, extractEpisodeNumber,
  findAllVideoUrls, extractTokenFromJson, parseAnimeYear, parseLastPage,
  parseEpisodesFromDoc,
};
