// AniTube — provider do Nuvio portado do CloudStream (lawlietbr/lietrepo).
//
// O AniTube é um site de anime em PT-BR. O port reescreve em JS só a parte
// que o Nuvio precisa: TMDB id -> título -> busca no site -> página do
// anime -> episódio -> links de vídeo. A extensão original em Kotlin
// também fazia catálogo e busca por texto, mas o Nuvio já faz isso via
// TMDB, então essas partes não foram portadas.
//
// Domínio: o código Kotlin aponta para anitube.news, mas o site mudou
// para anitube.zip (o .news redireciona com 301 para o .zip). O provider
// usa o .zip direto. (O anitube.js do Kamirama aponta para o antigo
// anitube.vip e não implementa este fluxo, por isso não foi reaproveitado.)
//
// Fluxo do vídeo (igual ao AnitubeExtractor.kt): a página do episódio
// tem abas (div.pagEpiAbasItem) com iframes:
//   - videohls.php?d=<m3u8> ou .m3u8 direto -> HLS (qualidade pelo nome da aba)
//   - proxy anitube.zip/<token>/... -> abre a página e acha o iframe do Blogger
//   - blogger.com/video.g?token=... -> POST batchexecute (f_sid/bl fixos)
//     -> URLs googlevideo videoplayback + CPN (SHA-256).
// A chave do TMDB vem do app (globalThis.TMDB_API_KEY), como no Goyabu.

const cheerio = require('cheerio-without-node-native');
const CryptoJS = require('crypto-js');

const MAIN_URL = 'https://www.anitube.zip';
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36';
const TMDB_API_URL = 'https://api.themoviedb.org/3';

const ITAG_QUALITY = { 18: 360, 22: 720, 37: 1080, 59: 480 };
const QUALITY_ORDER = [37, 22, 18, 59];
// f_sid/bl fixos usados pelo extractor original (sem GET no video.g).
const BLOGGER_F_SID = '-7535563745894756252';
const BLOGGER_BL = 'boq_bloggeruiserver_20260223.02_p0';

function cleanTitle(dirty) {
  let clean = String(dirty || '')
    .replace(/\s*–\s*todos os epis[oó]dios/gi, '')
    .replace(/\s*\(dublado\)/gi, '')
    .replace(/\s*\(legendado\)/gi, '')
    .replace(/\s*dublado\s*$/gi, '')
    .replace(/\s*legendado\s*$/gi, '')
    .replace(/\s*-\s*epis[oó]dio\s*\d+/gi, '')
    .replace(/\s*–\s*epis[oó]dio\s*\d+/gi, '')
    .replace(/\s*epis[oó]dio\s*\d+/gi, '')
    .replace(/\s*Ep\.\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || String(dirty || '').trim();
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

function delay(ms) {
  if (typeof setTimeout === 'function') return new Promise((r) => setTimeout(r, ms));
  return Promise.resolve();
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

// TMDB -> títulos candidatos para buscar no AniTube.
async function getTmdbTitles(tmdbId) {
  const key = readApiKey();
  const url =
    TMDB_API_URL + '/tv/' + tmdbId +
    '?api_key=' + encodeURIComponent(key) +
    '&language=pt-BR&append_to_response=alternative_titles';
  const data = await fetchJson(url);
  if (!data || !data.name) throw new Error('TMDB não retornou título para tv ' + tmdbId);
  const titles = [];
  const push = (t) => {
    const v = String(t || '').trim();
    if (v && !titles.includes(v)) titles.push(v);
  };
  push(data.name);
  push(data.original_name);
  const alts = (data.alternative_titles && data.alternative_titles.results) || [];
  for (const alt of alts) {
    if (alt && /^(pt|BR)/i.test(String(alt.iso_3166_1 || ''))) push(alt.title);
  }
  for (const alt of alts) push(alt.title);
  return {
    titles: titles.slice(0, 5),
    year: data.first_air_date ? Number(String(data.first_air_date).slice(0, 4)) : null,
  };
}

// Ano do anime na página ("Ano: 2002" nas linhas de metadados).
function parseAnimeYear(html) {
  const $ = cheerio.load(html);
  let year = null;
  $('.boxAnimeSobre .boxAnimeSobreLinha').each((_, el) => {
    const text = $(el).text();
    if (/Ano:/i.test(text)) {
      const m = /Ano:\s*(\d{4})/i.exec(text);
      if (m) year = parseInt(m[1], 10);
    }
  });
  return year;
}

function extractEpisodeNumber(title) {
  const patterns = [
    /Epis[oó]dio\s*(\d+)/i,
    /Ep\.?\s*(\d+)/i,
    /\bE(\d+)/i,
    /\b(\d{3,})\b/,
    /\b(\d{1,2})\b/,
  ];
  for (const p of patterns) {
    const m = p.exec(String(title || ''));
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function extractAnimeTitleFromEpisode(episodeTitle) {
  let clean = String(episodeTitle || '')
    .replace(/Epis[oó]dio\s*\d+/gi, '')
    .replace(/Ep\.?\s*\d+/gi, '')
    .replace(/E\d+/gi, '')
    .replace(/–/g, '')
    .replace(/-/g, '')
    .replace(/\s*\(dublado\)/gi, '')
    .replace(/\s*\(legendado\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  clean = clean.replace(/\s*\d+\s*$/, '').trim();
  return clean || 'Anime';
}

// Busca no AniTube. Devolve animes (.aniItem) e episódios (.epiItem).
async function searchAnitube(query) {
  const url = MAIN_URL + '/?s=' + encodeURIComponent(query.trim().replace(/\s+/g, '+'));
  const html = await fetchText(url, {
    headers: { 'User-Agent': UA, Referer: MAIN_URL + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  const $ = cheerio.load(html);
  const results = [];
  $('.aniItem, .epiItem').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a').first().attr('href') || '';
    if (!href) return;
    const isEpisode = $el.find('.epiItemNome').length > 0;
    const rawTitle = $el.find('.aniItemNome, .epiItemNome').first().text().trim();
    if (!rawTitle) return;
    // O cleanTitle remove "(Dublado)", então guarda o áudio antes de limpar.
    const dubbed =
      /dublado/i.test(rawTitle) ||
      /dublado/i.test($el.find('.aniCC, .epiCC').first().text());
    const fullUrl = href.startsWith('http') ? href : MAIN_URL + (href.startsWith('/') ? href : '/' + href);
    if (isEpisode) {
      const epNumber = extractEpisodeNumber(rawTitle);
      const animeTitle = cleanTitle(extractAnimeTitleFromEpisode(rawTitle));
      if (!results.some((r) => r.url === fullUrl)) {
        results.push({ title: animeTitle, url: fullUrl, episode: epNumber, isEpisode: true, dubbed });
      }
    } else {
      const title = cleanTitle(rawTitle);
      if (!title) return;
      if (!results.some((r) => r.url === fullUrl)) {
        results.push({ title, url: fullUrl, episode: null, isEpisode: false, dubbed });
      }
    }
  });
  return results;
}

function parseEpisodes(html, episodeNumber) {
  const $ = cheerio.load(html);
  let found = null;
  $('.pagAniListaContainer > a').each((_, el) => {
    if (found) return;
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (!href) return;
    const epNum = extractEpisodeNumber(text);
    if (epNum === episodeNumber) {
      found = href.startsWith('http') ? href : MAIN_URL + (href.startsWith('/') ? href : '/' + href);
    }
  });
  return found;
}

function decodeUnicodeEscapes(text) {
  return String(text).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch (e) { return '?'; }
  });
}

function decodeUrl(url) {
  let decoded = decodeUnicodeEscapes(url);
  decoded = decoded.replace(/\\\//g, '/').replace(/\\\\/g, '\\').replace(/\\=/g, '=').replace(/\\&/g, '&');
  if (decoded.endsWith('\\')) decoded = decoded.slice(0, -1);
  return decoded.replace(/^"|"$/g, '').trim();
}

function extractItagFromUrl(url) {
  const patterns = [/itag[=?&](\d+)/, /itag%3D(\d+)/, /itag\\u003d(\d+)/];
  for (const p of patterns) {
    const m = p.exec(url);
    if (m) return parseInt(m[1], 10) || 18;
  }
  if (/itag=22|itag%3D22/.test(url)) return 22;
  if (/itag=18|itag%3D18/.test(url)) return 18;
  if (/itag=37|itag%3D37/.test(url)) return 37;
  if (/itag=59|itag%3D59/.test(url)) return 59;
  return 18;
}

function extractGoogleJson(response) {
  try {
    const data = String(response).replace(/^\)\]\}'\s*\n?/, '');
    const m = /\[\s*\[\s*"wrb\.fr"\s*,\s*"[^"]*"\s*,\s*"(.+?)"\s*\]/s.exec(data);
    if (m) {
      let jsonStr = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return decodeUnicodeEscapes(jsonStr);
    }
  } catch (e) { /* usa a resposta crua */ }
  return response;
}

function extractVideoUrlsFromResponse(response) {
  const videos = [];
  const jsonData = extractGoogleJson(response);
  // Padrão principal do extractor original: "URL",[itag]
  const pairPattern = /"((?:https?:\/\/)?[^"]+?googlevideo[^"]+?)",\[(\d+)\]/g;
  for (const match of jsonData.matchAll(pairPattern)) {
    const url = decodeUrl(match[1].startsWith('http') ? match[1] : 'https://' + match[1]);
    const itag = parseInt(match[2], 10) || 18;
    if (!videos.some((v) => v.url === url)) videos.push({ url, itag });
  }
  if (videos.length === 0) {
    const patterns = [
      /https?:\\?\/\\?\/[^"'\s]+?\.googlevideo\.com\\?\/[^"'\s]+?videoplayback[^"'\s]*/g,
      /https?:\/\/[^"'\s]+?\.googlevideo\.com\/[^"'\s]+?videoplayback[^"'\s]*/g,
      /googlevideo\.com\/[^"'\s]+?videoplayback[^"'\s]*/g,
    ];
    for (const pattern of patterns) {
      for (const match of jsonData.matchAll(pattern)) {
        let url = match[0];
        if (!url.startsWith('http')) url = 'https://' + url;
        url = decodeUrl(url);
        if (!videos.some((v) => v.url === url)) videos.push({ url, itag: extractItagFromUrl(url) });
      }
    }
  }
  const byItag = new Map();
  for (const v of videos) if (!byItag.has(v.itag)) byItag.set(v.itag, v);
  return [...byItag.values()].sort((a, b) => QUALITY_ORDER.indexOf(a.itag) - QUALITY_ORDER.indexOf(b.itag));
}

function extractTokenFromUrl(url) {
  const m = /token=([a-zA-Z0-9_-]+)/.exec(String(url || ''));
  return m ? m[1] : null;
}

function extractVideoId(url) {
  const m = /id=([a-f0-9]+)/.exec(String(url || ''));
  return m ? m[1] : 'picasacid';
}

function generateCpn(token, videoId, timestamp) {
  try {
    const seed = BLOGGER_BL + videoId + timestamp + token;
    const hash = CryptoJS.SHA256(seed);
    const b64 = CryptoJS.enc.Base64.stringify(hash);
    return b64.substring(0, 16).replace(/\+/g, '').replace(/\//g, '').replace(/=/g, '');
  } catch (e) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
}

function extractBloggerParams(html) {
  let fSid = BLOGGER_F_SID;
  let bl = BLOGGER_BL;
  const wiz = /window\.WIZ_global_data\s*=\s*\{([^}]+)\}/.exec(html);
  if (wiz) {
    const sid = /"FdrFJe":"([^"]+)"/.exec(wiz[1]);
    if (sid) fSid = sid[1];
    const blMatch = /"cfb2h":"([^"]+)"/.exec(wiz[1]);
    if (blMatch) bl = blMatch[1];
  }
  return { fSid, bl };
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

async function callBloggerBatchApi(token, fSid, bl, cookie) {
  const apiUrl = 'https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute';
  const reqid = 10000 + Math.floor(Math.random() * 90000);
  const urlWithParams =
    apiUrl + '?rpcids=WcwnYd&source-path=%2Fvideo.g&f.sid=' + encodeURIComponent(fSid) +
    '&bl=' + encodeURIComponent(bl) + '&hl=pt-BR&_reqid=' + reqid + '&rt=c';
  const body =
    'f.req=%5B%5B%5B%22WcwnYd%22%2C%22%5B%5C%22' + token +
    '%5C%22%2C%5C%22%5C%22%2C0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D';
  const headers = {
    authority: 'www.blogger.com',
    accept: '*/*',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    origin: 'https://www.blogger.com',
    referer: 'https://www.blogger.com/',
    'user-agent': UA,
    'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'x-client-data': 'COjuygE=',
    'x-same-domain': '1',
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(urlWithParams, { method: 'POST', headers, body });
  if (!res.ok) throw new Error('Blogger batchexecute respondeu HTTP ' + res.status);
  return extractVideoUrlsFromResponse(await res.text());
}

async function extractBloggerLinks(bloggerUrl, referer) {
  const token = extractTokenFromUrl(bloggerUrl);
  if (!token) return [];
  let videos = [];
  try {
    videos = await callBloggerBatchApi(token, BLOGGER_F_SID, BLOGGER_BL, '');
  } catch (e) {
    videos = [];
  }
  if (!videos.length) {
    // Fallback: busca f_sid/bl frescos no video.g (mesmo método do Goyabu).
    try {
      const res = await fetch('https://www.blogger.com/video.g?token=' + token, {
        headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
      });
      if (res.ok) {
        const cookie = extractCookieHeader(res);
        const { fSid, bl } = extractBloggerParams(await res.text());
        await delay(500);
        videos = await callBloggerBatchApi(token, fSid, bl, cookie);
      }
    } catch (e) {
      videos = [];
    }
  }
  if (!videos.length) return [];
  const timestamp = Date.now();
  return videos.map((v) => {
    const quality = ITAG_QUALITY[v.itag] || 480;
    const label = quality === 1080 ? 'FHD' : quality === 720 ? 'HD' : 'SD';
    const videoId = extractVideoId(v.url);
    const cpn = generateCpn(token, videoId, timestamp);
    let finalUrl = decodeUrl(v.url).replace(/\\&/g, '&');
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'cpn=' + cpn + '&c=WEB_EMBEDDED_PLAYER&cver=1.20260224.08.00';
    return {
      name: 'AniTube',
      title: 'AniTube (' + label + ')',
      url: finalUrl,
      quality: quality + 'p',
      headers: {
        Referer: 'https://youtube.googleapis.com/',
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'pt-BR',
        Range: 'bytes=0-',
      },
    };
  });
}

function qualityFromTab(tabName) {
  if (/FHD/i.test(tabName)) return 1080;
  if (/HD/i.test(tabName)) return 720;
  if (/SD/i.test(tabName)) return 480;
  return 720;
}

async function extractEpisodeLinks(episodeUrl) {
  const html = await fetchText(episodeUrl, {
    headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
  });
  const $ = cheerio.load(html);
  const streams = [];
  const push = (s) => {
    if (s && s.url && !streams.some((x) => x.url === s.url)) streams.push(s);
  };

  const tabs = $('div.pagEpiAbasItem');
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs.eq(i);
    const tabName = tab.text().trim();
    const target = tab.attr('aba-target');
    if (!target) continue;
    const iframe = $('#' + target + ' iframe.metaframe').first();
    if (!iframe.length) continue;
    const iframeSrc = iframe.attr('src') || '';
    if (!iframeSrc) continue;

    try {
      if (iframeSrc.includes('videohls.php') || iframeSrc.includes('.m3u8')) {
        let hlsUrl = iframeSrc;
        const m = /[?&]d=([^&]+)/.exec(iframeSrc);
        if (m) {
          try { hlsUrl = decodeURIComponent(m[1]); } catch (e) { hlsUrl = iframeSrc; }
        }
        const quality = qualityFromTab(tabName);
        const label = quality === 1080 ? 'FHD' : quality === 720 ? 'HD' : 'SD';
        push({
          name: 'AniTube',
          title: 'AniTube (' + label + ')',
          url: hlsUrl,
          quality: quality + 'p',
          headers: { Referer: episodeUrl, 'User-Agent': UA, Accept: '*/*' },
        });
      } else if (iframeSrc.includes('anitube.zip/') || iframeSrc.includes('anitube.news/')) {
        const fullProxyUrl = iframeSrc.startsWith('http') ? iframeSrc : MAIN_URL + iframeSrc;
        const proxyHtml = await fetchText(fullProxyUrl, {
          headers: {
            'User-Agent': UA, Referer: episodeUrl,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR',
          },
        });
        const $p = cheerio.load(proxyHtml);
        const bloggerSrc = $p('iframe[src*="blogger.com/video.g"]').first().attr('src');
        if (bloggerSrc) {
          for (const s of await extractBloggerLinks(bloggerSrc, episodeUrl)) push(s);
        }
      } else if (iframeSrc.includes('blogger.com')) {
        for (const s of await extractBloggerLinks(iframeSrc, episodeUrl)) push(s);
      }
    } catch (e) {
      console.log('[AniTube] Aba "' + tabName + '" falhou: ' + (e && e.message ? e.message : e));
    }
  }

  // Sem abas (página antiga): procura um iframe do Blogger direto.
  if (!streams.length) {
    const bloggerSrc = $('iframe[src*="blogger.com/video.g"]').first().attr('src');
    if (bloggerSrc) {
      for (const s of await extractBloggerLinks(bloggerSrc, episodeUrl)) push(s);
    }
  }
  return streams;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== 'tv') return [];
    const ep = Number(episode) || 1;
    const sn = Number(season) || 1;

    const { titles, year: tmdbYear } = await getTmdbTitles(tmdbId);
    if (!titles.length) return [];

    const queries = [];
    const pushQuery = (q) => {
      const v = String(q || '').trim();
      if (v && !queries.includes(v)) queries.push(v);
    };
    if (sn > 1) pushQuery(titles[0] + ' ' + sn + 'ª temporada');
    for (const t of titles) pushQuery(t);
    const target = titles[0];

    const animeCandidates = [];
    let bestEpisode = null;
    let bestEpisodeScore = 0;
    for (const query of queries.slice(0, 4)) {
      const results = await searchAnitube(query);
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

    // Desempate por ano: vários animes contêm o título (ex.: "Naruto" vs
    // "Naruto Shippuden"). Se há empate no melhor score, abre as páginas
    // dos empatados e prefere o que tem o ano do TMDB.
    let bestAnime = animeCandidates.length ? animeCandidates[0] : null;
    let bestAnimeHtml = null;
    const topScore = bestAnimeScore;
    const tied = animeCandidates.filter((c) => c.score === topScore).slice(0, 6);
    if (tied.length > 1 && tmdbYear) {
      const yearMatches = [];
      for (const cand of tied) {
        try {
          const pageHtml = await fetchText(cand.url, {
            headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
          });
          if (parseAnimeYear(pageHtml) === tmdbYear) {
            yearMatches.push({ cand, pageHtml });
          }
        } catch (e) { /* tenta o próximo empatado */ }
      }
      if (yearMatches.length) {
        // Entre os do ano certo, prefere dublado.
        const dubbed = yearMatches.find((x) => x.cand.dubbed);
        const pick = dubbed || yearMatches[0];
        bestAnime = pick.cand;
        bestAnimeHtml = pick.pageHtml;
      }
    }

    let episodeUrl = null;
    if (bestAnime && bestAnimeScore >= 60) {
      const animeHtml = bestAnimeHtml || await fetchText(bestAnime.url, {
        headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
      });
      episodeUrl = parseEpisodes(animeHtml, ep);
      if (!episodeUrl && bestAnime.url.includes('/video/') && ep === 1) {
        // Página de vídeo único sem lista de episódios.
        episodeUrl = bestAnime.url;
      }
    }
    if (!episodeUrl && bestEpisode && bestEpisodeScore >= 60) {
      episodeUrl = bestEpisode.url;
    }
    if (!episodeUrl) {
      console.log('[AniTube] Episódio ' + ep + ' não encontrado para "' + target + '"');
      return [];
    }
    return await extractEpisodeLinks(episodeUrl);
  } catch (error) {
    console.error('[AniTube] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = {
  cleanTitle, normalize, scoreTitle, extractEpisodeNumber, extractAnimeTitleFromEpisode,
  parseEpisodes, extractVideoUrlsFromResponse, extractItagFromUrl, extractTokenFromUrl,
  generateCpn, decodeUrl, parseAnimeYear,
};
