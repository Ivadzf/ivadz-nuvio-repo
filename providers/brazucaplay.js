// Brazuca Play — provider do Nuvio.
//
// Fonte: o addon Stremio Brazuca Play (Não Oficial)
// (https://brazuca-play-stremio-y3wf.onrender.com/), port não
// oficial do Brazuca Play (Kodi) para Stremio. Filmes, séries,
// animes, doramas, desenhos e novelas, dublado PT-BR e legendado.
// O addon expõe o protocolo Stremio: GET /stream/{type}/{imdbId}.json
// (série: /stream/series/{imdbId}:{s}:{e}.json) -> {streams:
// [{name, title, url}]}. O provider resolve o IMDb id via TMDB
// (external_ids, com a chave do app) e repassa a URL do addon.
//
// O melhor stream é o "Direto (CDN)": um .m3u8 HLS direto em
//   https://android.watchug.watch/proxy/m3u8v2/<id>.m3u8
// (master playlist com áudio PT-BR default + inglês; gerado com
// shaka-packager). O id varia por título/episódio e só o addon
// conhece o mapa IMDb -> id — por isso o provider consulta o addon
// na hora do play. Os outros streams ("Dublado", "Dual/Leg") são
// o mesmo .m3u8 proxado pelo servidor do addon
// (/proxy/hls/...?url=...); o provider prefere o direto (CDN) e
// devolve só ele.
//
// Validado 2026-11-09 (VM, ao vivo, via addon):
// - Breaking Bad 1x1: 3 streams; o direto (CDN) é .m3u8 válido
//   (HTTP 200, application/x-mpegURL, áudio PT-BR + EN).
// - Breaking Bad 5x16: 3 streams.
// - A Origem (filme): 3 streams.
// - The Office 1x1: 6 streams.
// - Clube da Luta (filme): [] (não está no catálogo).

const ADDON_URL = 'https://brazuca-play-stremio-y3wf.onrender.com';
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

// Prefere o stream "Direto (CDN)" (android.watchug.watch); se não
// houver, usa o primeiro .m3u8/.mp4 direto da lista.
function pickDirect(streams) {
  const list = (streams || []).filter(
    (st) => st && typeof st.url === 'string' && /^https:\/\//i.test(st.url)
  );
  if (!list.length) return null;
  const direct = list.find((st) => /Direto \(CDN\)/i.test(st.name || ''));
  return direct || list[0];
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
    const chosen = pickDirect(data && data.streams);
    if (!chosen) return [];
    return [{
      name: 'Brazuca Play',
      title: 'Dublado',
      url: chosen.url,
      quality: '720p',
      headers: {},
    }];
  } catch (error) {
    console.error('[Brazuca Play] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { pickDirect };
