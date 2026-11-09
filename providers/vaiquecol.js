// VaiQueCol — provider do Nuvio. *** VERSÃO DIAGNÓSTICO (temporária) ***
//
// O provider normal (v2.9.0) funciona na VM mas retorna [] no celular
// do Davi (BB 1x1 e Clube da Luta, ambos confirmados na VM). Esta
// versão devolve UM stream "falso" com um código no título/qualidade
// indicando ONDE a cadeia quebrou, para descobrir o ponto de falha
// no sandbox do Nuvio. A URL do stream diagnóstico é o master.txt do
// BB 1x1 (válido e conhecido) — serve só para a entrada aparecer na
// lista; NÃO é o vídeo do título buscado.
//
// Códigos (título / qualidade):
//   TMDBFAIL  — external_ids do TMDB falhou (só filmes)
//   EMBED404  — a página do embed voltou HTTP 404 (qualidade = status)
//               -> provável: o Nuvio não repassa o header Referer,
//               e o vaiquecol.com dá 404 sem Referer do plenoflu.com
//               ou do próprio vaiquecol.com.
//   EMBEDNET  — o fetch do embed lançou exceção (rede/DNS)
//   NOID      — embed ok, mas nenhum id FirePlayer encontrado
//   VIDEONET  — o POST getVideo lançou exceção
//   VIDEO404  — getVideo voltou HTTP != 200 (qualidade = status)
//   NOVIDEO   — getVideo ok, mas sem videoSource
//   NOPOR     — master.txt sem faixa de áudio "por"
//   TOPFAIL   — exceção fora dos passos (qualidade = mensagem curta)
//   Dublado   — SUCESSO (cadeia completa; stream real)
//
// Fluxo normal: embed vaiquecol.com/embed2/<imdb|tmdb-s-e> (precisa
// de Referer plenoflu.com) -> id FirePlayer (hex 32) -> POST
// /player/index.php?data=<id>&do=getVideo -> videoSource master.txt
// HLS com áudio eng+por. Ver providers/vaiquecol.js do v2.9.0 para
// a versão sem diagnóstico.

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// Master.txt do BB 1x1 — válido e conhecido; só faz a entrada
// diagnóstica aparecer na lista do Nuvio.
const DIAG_URL =
  'https://vaiquecol.com/cdn/hls/e97fd00d5153c28bf253a89c827a181b/master.txt';

function diag(code, detail) {
  return [
    {
      name: 'VaiQueCol',
      title: code,
      url: DIAG_URL,
      quality: detail || 'DIAG',
      headers: {},
    },
  ];
}

function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('TMDB_API_KEY indisponível');
  }
  return key.trim();
}

async function getImdbId(tmdbId) {
  const key = readApiKey();
  const res = await fetch(
    TMDB_API_URL + '/movie/' + tmdbId + '/external_ids?api_key=' + encodeURIComponent(key),
    { headers: { 'User-Agent': UA, Accept: 'application/json' } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const imdb = data && typeof data.imdb_id === 'string' ? data.imdb_id.trim() : '';
  return /^tt\d+$/.test(imdb) ? imdb : null;
}

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
    if (!/^\d+$/.test(id)) return diag('BADID', 'DIAG');
    const isTv = mediaType === 'tv';
    const s = Number(season) || 1;
    const e = Number(episode) || 1;

    let embedUrl;
    let referer;
    if (isTv) {
      embedUrl = 'https://vaiquecol.com/embed2/' + id + '-' + s + '-' + e;
      referer = 'https://plenoflu.com/tvshow/' + id + '/' + s + '/' + e;
    } else {
      let imdb = null;
      try {
        imdb = await getImdbId(id);
      } catch (err) {
        imdb = null;
      }
      if (!imdb) return diag('TMDBFAIL', 'DIAG');
      embedUrl = 'https://vaiquecol.com/embed2/' + imdb;
      referer = 'https://plenoflu.com/movie/' + imdb;
    }

    let embedRes;
    try {
      embedRes = await fetch(embedUrl, {
        headers: { 'User-Agent': UA, Referer: referer },
      });
    } catch (err) {
      return diag('EMBEDNET', 'DIAG');
    }
    if (!embedRes.ok) return diag('EMBED' + embedRes.status, String(embedRes.status));
    const html = await embedRes.text();
    if (!html) return diag('EMBEDEMPTY', 'DIAG');
    const videoId = extractVideoId(html);
    if (!videoId) return diag('NOID', 'DIAG');

    let videoRes;
    try {
      videoRes = await fetch(
        'https://vaiquecol.com/player/index.php?data=' + videoId + '&do=getVideo',
        {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            Referer: referer,
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: 'hash=' + encodeURIComponent(videoId) + '&r=' + encodeURIComponent(referer),
        }
      );
    } catch (err) {
      return diag('VIDEONET', 'DIAG');
    }
    if (!videoRes.ok) return diag('VIDEO' + videoRes.status, String(videoRes.status));
    let data = null;
    try {
      data = await videoRes.json();
    } catch (err) {
      data = null;
    }
    const master =
      data && typeof data.videoSource === 'string' ? data.videoSource.trim() : '';
    if (!master || master.indexOf('/cdn/hls/') === -1) return diag('NOVIDEO', 'DIAG');

    let quality = '480p';
    try {
      const playlistRes = await fetch(master, { headers: { 'User-Agent': UA } });
      if (playlistRes.ok) {
        const playlist = await playlistRes.text();
        if (playlist.indexOf('LANGUAGE="por"') === -1) return diag('NOPOR', 'DIAG');
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
      } else {
        quality = 'NOCHECK';
      }
    } catch (err) {
      quality = 'NOCHECK';
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
    const msg = (error && error.message ? error.message : String(error))
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 12);
    return diag('TOPFAIL', msg || 'DIAG');
  }
}

module.exports = { getStreams };

module.exports._test = { extractVideoId };
