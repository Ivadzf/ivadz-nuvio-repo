// VidSrc (vidsrc.ir) — filmes e séries por TMDB id.
//
// Fonte encontrada através do GoFlix: o GoFlix é só um agregador e o
// servidor "English" dele embute o VidSrc. O provider vai direto ao
// VidSrc pelo TMDB id, sem passar pelo GoFlix.
//
// Cadeia (mapeada 2026-11-08 a partir do player.js do próprio VidSrc):
//   1. GET https://vidsrc.ir/embed/movie/<tmdb>
//      (ou /embed/tv/<tmdb>/<s>/<e>) -> atributo data-api do iframe
//   2. GET https://vidsrc.ir/vs_src.php?... -> JSON {src}
//      (embed do stellarconductornexus.com com token ?vs=)
//   3. GET <src> -> window.CFG.playerUrl
//   4. GET https://stellarconductornexus.com<playerUrl>
//      -> CONFIG com "api" (filme, já com &stream_urls) ou "streamBase"
//      (série), "metaApi" e "apiToken" (token de uso único, amarrado à
//      faixa de IP de quem pediu a página)
//   5. GET metaApi (sem token) -> data.stream_urls_api_host (host do
//      pool de streams, varia por título) e data.title
//   6. GET <streamApi com host trocado>&api_token=<token>
//      -> {data:{stream_urls:[<playlist .m3u8>, ...]}}
//   7. Para cada origem: GET <origem>/generate.php?api_token=<token>
//      -> token do segmento; carimbado na URL (?token= ou __TOKEN__).
//
// Limitação conhecida: o apiToken é amarrado à faixa de IP. Na VM de
// teste o IP de saída gira a cada requisição, então o passo 6 devolve
// 403 "invalid api token" por lá — no celular (IP estável) o token é
// emitido para o IP do aparelho e as requisições seguintes saem do
// mesmo IP, então o fluxo deve funcionar. É o mesmo padrão do Goyabu:
// validado até o passo 5 na VM, teste final no Nuvio.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function headers(referer) {
  const h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (referer) h.Referer = referer;
  return h;
}

async function fetchText(url, referer) {
  const res = await fetch(url, { headers: headers(referer) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return await res.text();
}

async function fetchJson(url, referer) {
  return JSON.parse(await fetchText(url, referer));
}

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

// Token do /generate.php: string pura ou JSON {token|data|string|result}.
function parseToken(t) {
  if (!t) return '';
  const s = String(t).trim();
  if (!s) return '';
  if (s.charAt(0) === '[' || s.charAt(0) === '{') {
    try {
      const j = JSON.parse(s);
      if (typeof j === 'string') return j;
      if (j && typeof j === 'object')
        return j.token || j.data || j.string || j.result || '';
    } catch (_) {
      return '';
    }
    return '';
  }
  return s;
}

// Carimba o token do segmento na URL da playlist (igual ao player.js).
function applyToken(url, token) {
  if (!token) return url;
  if (url.indexOf('__TOKEN__') > -1) return url.split('__TOKEN__').join(token);
  return url + (url.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(token);
}

// Qualidade pela maior RESOLUTION da playlist master (padrão do repo).
async function probeQuality(url, referer) {
  try {
    const text = await fetchText(url, referer);
    let best = 0;
    const re = /RESOLUTION=\d+x(\d+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const h = parseInt(m[1], 10);
      if (!isNaN(h) && h > best) best = h;
    }
    if (best >= 1080) return '1080p';
    if (best >= 720) return '720p';
    if (best >= 480) return '480p';
    if (best > 0) return '360p';
  } catch (_) {}
  return '720p';
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const isTv = mediaType === 'tv';
    const s = season || 1;
    const e = episode || 1;

    // 1. Página de embed do VidSrc -> data-api do iframe.
    const embedUrl = isTv
      ? 'https://vidsrc.ir/embed/tv/' + tmdbId + '/' + s + '/' + e
      : 'https://vidsrc.ir/embed/movie/' + tmdbId;
    const embedHtml = await fetchText(embedUrl);
    const dataApi = pick(embedHtml, /data-api="([^"]+)"/);
    if (!dataApi) return [];

    // 2. vs_src.php -> URL do embed (stellarconductornexus).
    const vs = await fetchJson(
      'https://vidsrc.ir' + dataApi.replace(/&amp;/g, '&'),
      embedUrl
    );
    if (!vs || !vs.src) return [];

    // 3. Embed stellar -> window.CFG.playerUrl.
    const stellarHtml = await fetchText(vs.src, embedUrl);
    const cfgRaw = pick(stellarHtml, /window\.CFG = (\{.*?\});/);
    if (!cfgRaw) return [];
    let cfg;
    try {
      cfg = JSON.parse(cfgRaw);
    } catch (_) {
      return [];
    }
    if (!cfg.playerUrl) return [];
    const playerUrl = 'https://stellarconductornexus.com' + cfg.playerUrl;

    // 4. Página do player -> CONFIG (api/streamBase, metaApi, apiToken).
    const playerHtml = await fetchText(playerUrl, vs.src);
    const apiToken = pick(playerHtml, /"apiToken":"([^"]+)"/);
    if (!apiToken) return [];
    let streamApi = pick(
      playerHtml,
      /"api":"(https:\/\/data\.vidsrc\.sh[^"]+)"/
    );
    if (streamApi) {
      streamApi = streamApi.replace(/\\u0026/g, '&');
    } else {
      const base = pick(
        playerHtml,
        /"streamBase":"(https:\/\/data\.vidsrc\.sh[^"]+)"/ 
      );
      if (!base) return [];
      streamApi =
        base.replace(/\\u0026/g, '&') +
        '&season=' +
        s +
        '&episode=' +
        e +
        '&stream_urls';
    }
    const metaApiRaw = pick(
      playerHtml,
      /"metaApi":"(https:\/\/data\.vidsrc\.sh[^"]+)"/
    );

    // 5. metaApi (sem token) -> host do pool de streams + título.
    let host = null;
    let title = null;
    if (metaApiRaw) {
      try {
        const meta = await fetchJson(
          metaApiRaw.replace(/\\u0026/g, '&'),
          playerUrl
        );
        if (meta && meta.data) {
          host = meta.data.stream_urls_api_host || null;
          title = meta.data.title || null;
        }
      } catch (_) {}
    }

    // 6. stream_urls (host do pool, se anunciado) + api_token.
    if (host) {
      streamApi = streamApi.replace(
        '://data.vidsrc.sh/',
        '://' + host + '/'
      );
    }
    const sj = await fetchJson(
      streamApi + '&api_token=' + encodeURIComponent(apiToken),
      playerUrl
    );
    const rawUrls =
      (sj && sj.data && sj.data.stream_urls) || [];
    if (!rawUrls.length) return [];

    // 7. Token por origem (/generate.php) + qualidade da playlist.
    const tokens = {};
    const streams = [];
    const pad = (n) => String(n).padStart(2, '0');
    const label =
      title ||
      'VidSrc' + (isTv ? ' S' + pad(s) + 'E' + pad(e) : '');
    for (const raw of rawUrls) {
      if (typeof raw !== 'string' || !raw) continue;
      const om = raw.match(/^(https?:\/\/[^\/]+)/);
      if (!om) continue;
      const origin = om[1];
      if (!(origin in tokens)) {
        let tk = '';
        try {
          const t = await fetchText(
            origin + '/generate.php?api_token=' + encodeURIComponent(apiToken),
            playerUrl
          );
          tk = parseToken(t);
        } catch (_) {}
        tokens[origin] = tk;
      }
      const url = applyToken(raw, tokens[origin]);
      const quality = await probeQuality(url, playerUrl);
      streams.push({
        name: 'VidSrc',
        title: label,
        url,
        quality,
        headers: { Referer: playerUrl },
        provider: 'vidsrc',
      });
    }
    return streams;
  } catch (_) {
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
  module.exports._test = { parseToken, applyToken, probeQuality };
}
