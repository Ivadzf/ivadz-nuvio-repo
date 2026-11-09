// WatchPlay — provider do Nuvio.
//
// Site: https://v2.watchplay.shop/ (MyPlayer), PT-BR, filmes e séries.
// A página do título usa o ID do TMDB direto no caminho — filme:
//   /movie/<tmdb>/ ; série: /tvshow/<tmdb>/<s>/<e>/
// — e traz o player ArtPlayer + hls.js. O script da página define:
//   window.MyPlayerAudio="Dublado";
//   window.MyPlayerPlayers=["Dublado"];
//   createMyPlayer({container:'#tv-player', id:"tvchannel-...",
//     url:"https:\/\/vid7102402.hclod.qzz.io\/st\/_s3_\/...\/playlist.m3u8?md5=...&expires=...",
//     type:'m3u8', ...})
// O .m3u8 é HLS (media playlist, 1 rendition) no host hclod.qzz.io,
// com token md5+expires gerado por page load — por isso o provider
// busca a página na hora do play e extrai a URL fresca. O token
// expira (expires = unix ts), então a URL devolvida é sempre fresca.
// O .m3u8 precisa do Referer da página (o KingVOD, que usa essa
// mesma fonte, envia Referer: v2.watchplay.shop/tvshow/...).
// Não precisa da chave do TMDB (o id vai direto na URL) e não há
// busca: o título é resolvido pelo próprio site via TMDB id.
//
// Qualidade: a playlist não traz RESOLUTION (media playlist de 1
// rendition) e a página não informa qualidade — o provider devolve
// '720p' como padrão (não medido).
//
// Validado 2026-11-09 (VM, ao vivo):
// - Breaking Bad 1x1 (tv 1396): página /tvshow/1396/1/1/ -> .m3u8
//   hclod.qzz.io (HTTP 200, playlist HLS válida), áudio Dublado.
// - Clube da Luta (movie 550): página /movie/550/ -> .m3u8
//   hclod.qzz.io (HTTP 200, 44KB), áudio Dublado.

const MAIN_URL = 'https://v2.watchplay.shop';
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

async function fetchText(url, options) {
  const res = await fetch(url, options || {});
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return res.text();
}

// Extrai a URL do .m3u8 do createMyPlayer da página.
// A URL vem com as barras escapadas (https:\/\/host\/...).
function extractStreamUrl(html) {
  const h = String(html || '');
  const m = h.match(/createMyPlayer\(\{[^}]*?url:\s*"((?:[^"\\]|\\.)*?playlist\.m3u8[^"]*)"/);
  if (!m) return null;
  let url = m[1].replace(/\\\//g, '/');
  if (!/^https:\/\//i.test(url)) return null;
  return url;
}

// Áudio declarado pela página (window.MyPlayerAudio="Dublado").
function extractAudio(html) {
  const m = String(html || '').match(/window\.MyPlayerAudio\s*=\s*"([^"]*)"/);
  return m ? m[1].trim() : '';
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const isTv = mediaType === 'tv';
    const s = Number(season) || 1;
    const e = Number(episode) || 1;
    const id = String(tmdbId || '').trim();
    if (!/^\d+$/.test(id)) return [];

    const pageUrl = isTv
      ? MAIN_URL + '/tvshow/' + id + '/' + s + '/' + e + '/'
      : MAIN_URL + '/movie/' + id + '/';

    let html = '';
    try {
      html = await fetchText(pageUrl, {
        headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
      });
    } catch (_) {
      return [];
    }
    const streamUrl = extractStreamUrl(html);
    if (!streamUrl) return [];
    const audio = extractAudio(html) || 'Dublado';

    return [{
      name: 'WatchPlay',
      title: audio,
      url: streamUrl,
      quality: '720p',
      headers: { Referer: pageUrl, 'User-Agent': UA },
    }];
  } catch (error) {
    console.error('[WatchPlay] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { extractStreamUrl, extractAudio };
