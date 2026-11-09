// RedeCanais — provider do Nuvio.
//
// Site: https://redecanais.by/ (filmes e séries PT-BR, dublado).
// O site publica dois mapas estáticos com todo o catálogo:
//   final_mapa.txt (séries) e final_mapafilmes.txt (filmes).
// Cada linha é: Título - <a href="/caminho">. Séries apontam para
// uma página de navegação que lista os episódios; filmes apontam
// direto para a página do filme. A página do episódio/filme traz a
// URL do player: player3/server.php?categoria=vod&server=<S>&
// subfolder=ondemand&vid=<VID>&gid=<GID>.
//
// O serverforms.api devolve um envelope JSON:
//   {"rcEnvelope":1,"key":<1-255>,"data":"<base64>"}
// O decode do envelope (extraído por desofuscação da VM do player):
//   cipher = atob(data) (base64 padrão);
//   plain = bytes do cipher em ORDEM REVERSA, cada um XOR com key;
//   JSON.parse(decodeURIComponent(escape(plain))).
// O envelope contém o rctoken e rc43.downloads (3 tokens, um por
// qualidade). Cada token vira um stream:
//   https://redecanais.by/player3/download.api?download=<token>
// O download.api devolve o MP4 direto (o mesmo arquivo do botão
// "Download" do site).
//
// Limitações conhecidas: o serverforms.api e o download.api podem
// exigir os cookies de sessão do site (RCSESS/RCIP) e o grant
// IP-bound do envelope (5 min). O provider gera a URL na hora do
// play, então o grant ainda deve estar válido. O site bloqueia IPs
// de datacenter (VM dá 521); no celular o fluxo funciona — mesmo
// padrão do Goyabu / DattebayoBR. O teste final é no Nuvio.

const MAIN_URL = 'https://redecanais.by';
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
const TMDB_API_URL = 'https://api.themoviedb.org/3';

// Qualidades assumidas para os 3 tokens de rc43.downloads, na ordem
// do envelope (initialQuality do envelope é "fhd" = 1080p).
const DOWNLOAD_QUALITIES = ['1080p', '720p', '480p'];

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

// Decodificador base64 puro (o runtime do Nuvio pode não ter atob/Buffer).
function base64Decode(input) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i] || '=');
    const b = chars.indexOf(clean[i + 1] || '=');
    const c = chars.indexOf(clean[i + 2] || '=');
    const d = chars.indexOf(clean[i + 3] || '=');
    if (a < 0 || b < 0) break;
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}

function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('TMDB_API_KEY indisponível: o app não forneceu a chave do TMDB ao plugin');
  }
  return key.trim();
}

// TMDB -> título em PT-BR e título original.
async function getTmdbInfo(tmdbId, mediaType) {
  const key = readApiKey();
  const kind = mediaType === 'tv' ? 'tv' : 'movie';
  const url =
    TMDB_API_URL + '/' + kind + '/' + tmdbId +
    '?api_key=' + encodeURIComponent(key) + '&language=pt-BR';
  const data = await fetchJson(url);
  if (!data) throw new Error('TMDB não retornou dados para ' + kind + ' ' + tmdbId);
  const title = mediaType === 'tv' ? data.name : data.title;
  const originalTitle = mediaType === 'tv' ? data.original_name : data.original_title;
  if (!title) throw new Error('TMDB não retornou título para ' + kind + ' ' + tmdbId);
  return {
    title: String(title).trim(),
    originalTitle: originalTitle ? String(originalTitle).trim() : '',
  };
}

function normalizeTitle(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Similaridade por tokens (Dice): 100 = títulos iguais.
function titleScore(a, b) {
  const ta = normalizeTitle(a).split(' ').filter(Boolean);
  const tb = normalizeTitle(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const common = ta.filter((t) => setB.has(t)).length;
  return Math.round((2 * common) / (ta.length + tb.length) * 100);
}

// Decode do envelope do serverforms.api.
// envelope = {rcEnvelope:1, key:<1-255>, data:"<base64>"}.
// O player decodifica assim: atob(data), depois percorre os bytes
// de trás pra frente fazendo XOR com key, e faz JSON.parse.
// Verificado contra o envelope real (chave 177): 5046/5046 bytes.
function decodeEnvelope(envelope) {
  if (!envelope || envelope.rcEnvelope !== 1) {
    throw new Error('Envelope inválido (sem rcEnvelope=1)');
  }
  const key = envelope.key;
  if (typeof key !== 'number' || key < 1 || key > 255 || (key % 1) !== 0) {
    throw new Error('Envelope inválido (key fora de 1-255)');
  }
  if (typeof envelope.data !== 'string' || !envelope.data) {
    throw new Error('Envelope inválido (sem data)');
  }
  const cipher = base64Decode(envelope.data);
  let plain = '';
  for (let i = cipher.length - 1; i >= 0; i--) {
    plain += String.fromCharCode(cipher.charCodeAt(i) ^ key);
  }
  let jsonText = plain;
  try {
    // Converte Latin-1 -> UTF-8 (o player faz escape/decodeURIComponent).
    if (typeof escape === 'function' && typeof decodeURIComponent === 'function') {
      jsonText = decodeURIComponent(escape(plain));
    }
  } catch (_) {
    jsonText = plain;
  }
  return JSON.parse(jsonText);
}

// Busca no mapa do site (final_mapa.txt p/ séries, final_mapafilmes.txt
// p/ filmes). Cada linha: Título (Dublado / Legendado) - <a href="/caminho">.
// Devolve os matches ordenados por similaridade (>= 60).
async function searchMap(query, isTv) {
  const mapUrl = MAIN_URL + (isTv ? '/final_mapa.txt' : '/final_mapafilmes.txt');
  const text = await fetchText(mapUrl, {
    headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
  });
  const results = [];
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    const m = line.match(/^(.*?)<a href="([^"]+)"/i);
    if (!m) continue;
    let title = m[1];
    // Limpa o título: remove tags HTML e "(Dublado / Legendado)".
    title = title.replace(/<[^>]*>/g, ' ');
    title = title.replace(/\([^)]*\)/g, ' ');
    title = title.replace(/-\s*$/, '').replace(/\s+/g, ' ').trim();
    const href = m[2];
    if (!title || !href) continue;
    results.push({ title, url: MAIN_URL + href });
  }
  return results;
}

function rankResults(results, title, originalTitle) {
  const scored = [];
  for (const r of results) {
    const score = Math.max(
      titleScore(r.title, title),
      originalTitle ? titleScore(r.title, originalTitle) : 0
    );
    if (score >= 60) scored.push({ result: r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.result);
}

// Página de navegação da série -> URL do episódio pedido.
// Links: /<slug>-<S>a-temporada-episodio-<NN>-<titulo>-video_<hash>.html
function findEpisodeUrl(html, season, episode) {
  const h = String(html || '');
  const s = Number(season) || 1;
  const e = Number(episode) || 1;
  const ep2 = String(e).padStart(2, '0');
  const re = new RegExp(
    'href="([^"]*' + s + 'a-temporada-episodio-' + ep2 + '-[^"]*?-video_[a-f0-9]+\\.html)"',
    'i'
  );
  const m = h.match(re);
  if (m) return MAIN_URL + m[1];
  // Fallback: qualquer link de episódio com o número certo.
  const re2 = new RegExp(
    'href="([^"]*episodio-0*' + e + '-[^"]*?-video_[a-f0-9]+\\.html)"',
    'i'
  );
  const m2 = h.match(re2);
  return m2 ? MAIN_URL + m2[1] : null;
}

// Página do episódio/filme -> URL do server.php (vid/server/gid).
function extractServerPhp(html) {
  const h = String(html || '');
  const m = h.match(/player3\/server\.php\?categoria=vod&(?:amp;)?server=([A-Za-z0-9]+)&(?:amp;)?subfolder=ondemand&(?:amp;)?vid=([A-Za-z0-9]+)(?:&(?:amp;)?gid=([A-Za-z0-9]+))?/);
  if (!m) return null;
  let url = MAIN_URL + '/player3/server.php?categoria=vod&server=' + m[1] +
    '&subfolder=ondemand&vid=' + m[2];
  if (m[3]) url += '&gid=' + m[3];
  return url;
}

// Busca o envelope no serverforms.api (com Referer = server.php).
// Antes, busca a própria página server.php para estabelecer a sessão
// do player (o serverforms.api pode exigir os cookies de sessão).
async function fetchEnvelope(serverPhpUrl, pageUrl) {
  const url = MAIN_URL + '/player3/serverforms.api';
  const headers = {
    'User-Agent': UA,
    Referer: serverPhpUrl,
    'X-Requested-With': 'RC-Site-Requests',
  };
  // Estabelece a sessão do player antes de pedir o envelope.
  try {
    await fetch(serverPhpUrl, { headers: { 'User-Agent': UA, Referer: pageUrl } });
  } catch (_) {
    // Ignora: a sessão é best-effort, o envelope pode funcionar sem ela.
  }
  const data = await fetchJson(url, { headers });
  return data;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const isTv = mediaType === 'tv';
    const s = Number(season) || 1;
    const e = Number(episode) || 1;

    const info = await getTmdbInfo(tmdbId, mediaType);

    let results = await searchMap(info.title, isTv);
    let ranked = rankResults(results, info.title, info.originalTitle);
    if (!ranked.length && info.originalTitle && info.originalTitle !== info.title) {
      results = await searchMap(info.originalTitle, isTv);
      ranked = rankResults(results, info.title, info.originalTitle);
    }
    if (!ranked.length) return [];

    for (const match of ranked) {
      let pageUrl = match.url;
      let html = '';
      try {
        html = await fetchText(pageUrl, {
          headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
        });
      } catch (_) {
        continue;
      }
      if (isTv) {
        // A página do mapa é a navegação da série: acha o episódio.
        const epUrl = findEpisodeUrl(html, s, e);
        if (!epUrl) continue;
        pageUrl = epUrl;
        try {
          html = await fetchText(pageUrl, {
            headers: { 'User-Agent': UA, Referer: match.url },
          });
        } catch (_) {
          continue;
        }
      }
      const serverPhpUrl = extractServerPhp(html);
      if (!serverPhpUrl) continue;

      let envelope;
      try {
        envelope = await fetchEnvelope(serverPhpUrl, pageUrl);
      } catch (_) {
        continue;
      }
      let decoded;
      try {
        decoded = decodeEnvelope(envelope);
      } catch (_) {
        continue;
      }
      const downloads = decoded && decoded.rc43 && Array.isArray(decoded.rc43.downloads)
        ? decoded.rc43.downloads
        : [];
      if (!downloads.length) continue;

      const streams = [];
      for (let i = 0; i < downloads.length; i++) {
        const token = String(downloads[i] || '').trim();
        if (!token) continue;
        streams.push({
          name: 'RedeCanais',
          title: 'Dublado',
          url: MAIN_URL + '/player3/download.api?download=' + encodeURIComponent(token),
          quality: DOWNLOAD_QUALITIES[i] || '720p',
          headers: { Referer: serverPhpUrl },
        });
      }
      if (streams.length) return streams;
    }
    return [];
  } catch (error) {
    console.error('[RedeCanais] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { decodeEnvelope, base64Decode, titleScore, findEpisodeUrl, extractServerPhp };
