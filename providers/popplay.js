// PopPlay — provider do Nuvio.
//
// Fonte: o addon Stremio PopPlay (https://popplay2.vercel.app/),
// "Filmes e Séries dublados PT-BR via PopPlay". O addon expõe o
// protocolo Stremio: GET /stream/{type}/{imdbId}.json (série:
// /stream/series/{imdbId}:{s}:{e}.json) -> {streams: [{name, title,
// url}]}. O provider resolve o IMDb id via TMDB (external_ids, com
// a chave do app) e repassa a URL do addon.
//
// O stream é um .mp4 direto num CDN (ex.: awnagk.gviudclrb.com,
// fcoidok.cisantkdh.com), sem token, no formato
//   https://<cdn>/vod/<HASH>_media.mp4
// O hash varia por título/episódio e só o addon conhece o mapa
// TMDB/IMDb -> hash — por isso o provider consulta o addon na hora
// do play (a URL devolvida é sempre fresca e direta). Nem todo
// título está no catálogo do PopPlay — nesses casos devolve [].
// O addon não informa qualidade; o provider devolve '720p' como
// padrão (não medido).
//
// Validado 2026-11-09 (VM, ao vivo, via addon):
// - Breaking Bad 1x1: 1 stream (.mp4, HTTP 200, video/mp4).
// - Breaking Bad 5x16: 1 stream (.mp4).
// - Clube da Luta (filme): 1 stream (.mp4).
// - A Origem e The Office 1x1: [] (não estão no catálogo).

const ADDON_URL = 'https://popplay2.vercel.app';
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
        name: 'PopPlay',
        title: 'Dublado',
        url,
        quality: '720p',
        headers: {},
      });
    }
    return out;
  } catch (error) {
    console.error('[PopPlay] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };
