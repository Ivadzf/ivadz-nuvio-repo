// FenixFlix — provider do Nuvio.
//
// Fonte: o addon Stremio FenixFlix (https://fenixflix.fenixhub.online/),
// que serve filmes, séries e anime dublados e legendados em PT-BR.
// O addon expõe o protocolo Stremio: GET /stream/{type}/{imdbId}.json
// (série: /stream/series/{imdbId}:{s}:{e}.json) -> {streams: [{name,
// title, url}]}. O provider resolve o IMDb id via TMDB (external_ids,
// com a chave do app) e repassa as URLs do addon.
//
// A URL do stream é um redirect do próprio addon:
//   https://fenixflix.fenixhub.online/r/<token>/video.mp4
// que redireciona (302) para um Cloudflare Worker que serve o vídeo
// (video/mp4, HTTP 200). O token é gerado por requisição — por isso
// o provider consulta o addon na hora do play (a URL devolvida é
// sempre fresca). O Nuvio segue o redirect até o vídeo.
// O nome traz a qualidade ("FenixFlix 1080p") e o título traz o
// áudio ("🇧🇷 Dublado" / "🇺🇸 Legendado").
//
// Validado 2026-11-09 (VM, ao vivo, via addon):
// - Breaking Bad 1x1: 3 streams 1080p (2 Dublado + 1 Legendado).
// - Breaking Bad 5x16: 4 streams 1080p.
// - Clube da Luta (filme): 4 streams 1080p.
// - A Origem (filme): 4 streams 1080p.
// - The Office 1x1: 2 streams 1080p.
// - O redirect /r/ -> Worker foi seguido e devolveu HTTP 200
//   video/mp4.

const ADDON_URL = 'https://fenixflix.fenixhub.online';
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

// Qualidade no nome ("FenixFlix 1080p").
function qualityFromName(name) {
  const m = String(name || '').match(/(\d{3,4})p/i);
  return m ? m[1] + 'p' : '720p';
}

// Áudio no título ("🇧🇷 Dublado" / "🇺🇸 Legendado").
function audioFromTitle(title) {
  const t = String(title || '');
  if (/Legendado/i.test(t)) return 'Legendado';
  return 'Dublado';
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
        name: 'FenixFlix',
        title: audioFromTitle(st.title),
        url,
        quality: qualityFromName(st.name),
        headers: {},
      });
    }
    return out;
  } catch (error) {
    console.error('[FenixFlix] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { qualityFromName, audioFromTitle };
