// Zeus — provider do Nuvio.
//
// Fonte: o addon Stremio Zeus BR (https://zeus-br.shardweb.app/
// v1-pnv9b-q3j-a3-mb-c3/), que serve filmes e séries dublados em
// PT-BR. O addon expõe o protocolo Stremio: GET /stream/{type}/
// {imdbId}.json (série: /stream/series/{imdbId}:{s}:{e}.json) ->
// {streams: [{name, title, url}]}. O provider resolve o IMDb id via
// TMDB (external_ids, com a chave do app) e repassa a URL do addon.
//
// O stream é um .mp4 direto, sem token, em um destes hosts:
// - shd1/shd2.oneplayer.site: http://shd<N>.oneplayer.site/<key>/
//   SHD<N>/<tmdb>/<s>x<e>.mp4 (a key é fixa por servidor; o addon
//   escolhe o servidor por título)
// - media.nelsonflix.site: https://media.nelsonflix.site/
//   {movies/<tmdb>|tv/<tmdb>/season-<NN>/episode-<NN>}/source.mp4?player=0
//   (padrão construível a partir do TMDB id, mas o host devolve 403
//   a partir de IP de datacenter — no aparelho pode funcionar; o
//   provider devolve a URL como o addon entrega).
// O addon não informa qualidade; o provider devolve '720p' como
// padrão (não medido).
//
// Validado 2026-11-09 (VM, ao vivo, via addon):
// - Breaking Bad 1x1: 1 stream (oneplayer SHD1 .mp4, HTTP 200).
// - Breaking Bad 5x16: 1 stream (oneplayer SHD1 .mp4).
// - Game of Thrones 1x1: 1 stream (oneplayer SHD2 .mp4).
// - The Office 1x1, A Origem, Um Sonho de Liberdade: 1 stream
//   (nelsonflix .mp4 — 403 da VM, datacenter).
// - Clube da Luta (filme): [] (não está no catálogo).

const ADDON_URL = 'https://zeus-br.shardweb.app/v1-pnv9b-q3j-a3-mb-c3';
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

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

// TMDB id -> IMDb id (tt...), via /external_ids.
async function getImdbId(tmdbId, mediaType) {
  const key = readApiKey();
  const kind = mediaType === 'tv' ? 'tv' : 'movie';
  const data = await fetchJson(
    TMDB_API_URL + '/' + kind + '/' + tmdbId + '/external_ids?api_key=' + encodeURIComponent(key)
  );
  const imdb = data && typeof data.imdb_id === 'string' ? data.imdb_id.trim() : '';
  if (!/^tt\d+$/.test(imdb)) throw new Error('TMDB não retornou IMDb id para ' + kind + ' ' + tmdbId);
  return imdb;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const isTv = mediaType === 'tv';
    const s = Number(season) || 1;
    const e = Number(episode) || 1;
    const id = String(tmdbId || '').trim();
    if (!/^\d+$/.test(id)) return [];

    const imdbId = await getImdbId(id, mediaType);
    const streamId = isTv ? imdbId + ':' + s + ':' + e : imdbId;
    const type = isTv ? 'series' : 'movie';
    const data = await fetchJson(
      ADDON_URL + '/stream/' + type + '/' + streamId + '.json',
      { headers: { 'User-Agent': UA } }
    );
    const streams = (data && Array.isArray(data.streams)) ? data.streams : [];
    const out = [];
    for (const st of streams) {
      const url = st && typeof st.url === 'string' ? st.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({
        name: 'Zeus',
        title: 'Dublado',
        url,
        quality: '720p',
        headers: {},
      });
    }
    return out;
  } catch (error) {
    console.error('[Zeus] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };
