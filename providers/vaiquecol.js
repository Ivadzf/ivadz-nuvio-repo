// VaiQueCol — provider do Nuvio.
//
// Fonte: o player VaiQueCol (vaiquecol.com, "Pobre Play" / FirePlayer),
// revelado pelo agregador PlenoFlu (plenoflu.com), que é o player
// Dublado do SeriesFlixPop (seriesflixpop.com). O PlenoFlu só devolve
// a URL do embed; o vídeo direto vem do VaiQueCol:
//
//   filme: https://vaiquecol.com/embed2/<imdb>
//   série: https://vaiquecol.com/embed2/<tmdb>-<s>-<e>
//          (ex.: BB 1x1 = 1396-1-1)
//
// A página do embed traz um JS empacotado (Dean Edwards) com a config
// do FirePlayer. O id do vídeo é um token hexadecimal de 32 chars
// dentro da página; quando há legenda, o hash do arquivo (mesmo
// formato) aparece na URL /cdn/down/disk2/<hash>/Subtitle/ — o id é
// o token que NÃO está nessa URL (o disco varia: disk2, disk3...). Com o id:
//
//   POST https://vaiquecol.com/player/index.php?data=<id>&do=getVideo
//   body: hash=<id>&r=<url do PlenoFlu>
//   -> { "hls": true, "videoSource": "https://vaiquecol.com/cdn/hls/<hash>/master.txt", ... }
//
// O videoSource é um master HLS direto e estável (sem token), com
// faixas de áudio em inglês e português (LANGUAGE="por") — o provider
// confere o master.txt e só devolve o stream se houver áudio "por"
// (dublado). Qualidade 480p nos títulos testados.
//
// Validado 2026-11-09 (VM, ao vivo):
// - A Astronauta (filme, tt13964560): master.txt 200, áudio eng+por,
//   480p. Segmento https://vaiquecol.com/m3/... HTTP 200.
// - Breaking Bad 1x1 (1396-1-1): master.txt 200, áudio eng+por, 480p.
// - Clube da Luta (filme, tt0137523): master.txt 200, áudio eng+por,
//   480p.
// - O getVideo devolve ainda um securedLink .m3u8 com md5+expires,
//   mas ele deu 403 na VM (provável vínculo com IP/Referer) — o
//   provider usa o videoSource (master.txt), que funciona sem token.
// - StreamBetter e SuperFlix (outros servidores do PlenoFlu) NÃO
//   são portáveis: ambos exigem Cloudflare Turnstile.
// - BoraFlix (boraflix.mom) usa myembed.biz -> playerflix.ink, que
//   já é o fluxo do provider `myembed` do repo — nada novo a portar.
// - CineVision (cinevision.lat) usa painel-aso.sbs (Byse, AbyssPlayer
//   e VidSrc): o VidSrc já é coberto pelo `pobreflixtvfree`; Byse e
//   AbyssPlayer não foram destrinchados (ficam para depois).

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('TMDB_API_KEY indisponível: o app não forneceu a chave do TMDB ao plugin');
  }
  return key.trim();
}

async function fetchText(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) return null;
  return await res.text();
}

async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// TMDB id -> IMDb id (tt...), via /external_ids. Só usado para filmes
// (o embed de série usa o TMDB id direto).
async function getImdbId(tmdbId) {
  const key = readApiKey();
  const data = await fetchJson(
    TMDB_API_URL + '/movie/' + tmdbId + '/external_ids?api_key=' + encodeURIComponent(key),
    { headers: { 'User-Agent': UA, Accept: 'application/json' } }
  );
  const imdb = data && typeof data.imdb_id === 'string' ? data.imdb_id.trim() : '';
  if (!/^tt\d+$/.test(imdb)) throw new Error('TMDB não retornou IMDb id para o filme ' + tmdbId);
  return imdb;
}

// Extrai o id do FirePlayer da página do embed: tokens hex de 32 chars;
// o hash da legenda (na URL /cdn/down/disk2/<hash>/Subtitle/) é
// descartado — o id é o token restante.
function extractVideoId(html) {
  if (typeof html !== 'string' || !html) return null;
  const sub = html.match(/\/cdn\/down\/disk\d+\/([a-f0-9]{32})\//);
  const subHash = sub ? sub[1] : null;
  const tokens = html.match(/[a-f0-9]{32}/g) || [];
  for (const t of tokens) {
    if (t !== subHash) return t;
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const id = String(tmdbId || '').trim();
    if (!/^\d+$/.test(id)) return [];
    const isTv = mediaType === 'tv';
    const s = Number(season) || 1;
    const e = Number(episode) || 1;

    let embedUrl;
    let referer;
    if (isTv) {
      embedUrl = 'https://vaiquecol.com/embed2/' + id + '-' + s + '-' + e;
      referer = 'https://plenoflu.com/tvshow/' + id + '/' + s + '/' + e;
    } else {
      const imdb = await getImdbId(id);
      embedUrl = 'https://vaiquecol.com/embed2/' + imdb;
      referer = 'https://plenoflu.com/movie/' + imdb;
    }

    const html = await fetchText(embedUrl, {
      headers: { 'User-Agent': UA, Referer: referer },
    });
    if (!html) return [];
    const videoId = extractVideoId(html);
    if (!videoId) return [];

    const data = await fetchJson(
      'https://vaiquecol.com/player/index.php?data=' + videoId + '&do=getVideo',
      {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Referer: referer,
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body:
          'hash=' + encodeURIComponent(videoId) + '&r=' + encodeURIComponent(referer),
      }
    );
    const master =
      data && typeof data.videoSource === 'string' ? data.videoSource.trim() : '';
    if (!master || master.indexOf('/cdn/hls/') === -1) return [];

    // Confere o master HLS: só vale se houver faixa de áudio "por"
    // (dublado). A qualidade vem da maior RESOLUTION do master.
    let quality = '480p';
    try {
      const playlist = await fetchText(master, { headers: { 'User-Agent': UA } });
      if (playlist) {
        if (playlist.indexOf('LANGUAGE="por"') === -1) return [];
        let maxH = 0;
        const resRe = /RESOLUTION=\d+x(\d+)/g;
        let m;
        while ((m = resRe.exec(playlist)) !== null) {
          const h = parseInt(m[1], 10);
          if (!isNaN(h) && h > maxH) maxH = h;
        }
        if (maxH >= 1080) quality = '1080p';
        else if (maxH >= 720) quality = '720p';
        else if (maxH >= 480) quality = '480p';
      }
    } catch (e) {
      // Sem conferência do master: devolve mesmo assim (URL provada).
    }

    return [
      {
        name: 'VaiQueCol',
        title: 'Dublado',
        url: master,
        quality: quality,
        headers: {},
      },
    ];
  } catch (error) {
    console.error('[VaiQueCol] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { extractVideoId };
