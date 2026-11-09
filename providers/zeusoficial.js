// Zeus Oficial — wrapper do addon Stremio Zeus (org.zeus.community.beta).
//
// O addon é brasileiro e devolve streams DUBLADOS e LEGENDADOS em PT-BR.
// O provider só repassa as URLs do addon:
//
//   filme: GET https://zeusoficial.dpdns.org/stream/movie/<imdb>.json
//   série: GET https://zeusoficial.dpdns.org/stream/series/<imdb>:<s>:<e>.json
//
// As URLs são do próprio addon e variam por fonte:
// - /play/media/<token> e /play/fs09/<token>: redirect 307 para o
//   .mp4 real (R2, max.blackbr.store, cdn.direitonapratica.com...);
//   o Nuvio segue o redirect até o vídeo, como no FenixFlix.
// - /nuvio-media/<token>/media.m3u8: HLS direto do addon.
// - magnetcloud.duckdns.org/api/v1/proxy?...: proxy que serve o
//   vídeo direto (.mp4 ou HLS).
// O nome traz a qualidade ("Zeus ⚡ • 1080p"; "Auto" vira '720p',
// padrão não medido) e a última linha do título traz o áudio
// ("🔊 Dublado" / "💬 Legendado"). Streams com áudio "🎧 Audio"
// (sem indicar dublado ou legendado — provavelmente áudio original)
// são descartados, pela regra PT do repo.
//
// Histórico: avaliado em 2026-11-09 e deixado de lado porque as URLs
// /play/ e /nuvio-media/ davam 400/502 da VM. Na revisão das fontes
// antigas (2026-11-09), os mesmos endpoints passaram a responder 200
// — era falha transitória/bloqueio, não do addon. Publicado como
// provider em v2.10.0.
//
// Validado 2026-11-09 (VM, ao vivo, via addon; TMDB mockado no teste
// Node, só o external_ids — o addon foi consultado de verdade;
// o arquivo providers/zeusoficial.js foi executado, não só o addon):
// - Breaking Bad 1x1: 11 streams (9 Dublado + 2 Legendado).
// - Breaking Bad 5x16: 9 streams (7 Dublado + 2 Legendado).
// - Clube da Luta (filme): 7 streams (5 Dublado + 2 Legendado,
//   incl. 4K HEVC Dublado).
// - A Origem (filme): 8 streams (6 Dublado + 2 Legendado).
// - Da VM, as URLs tocam de verdade: /play/ redireciona para R2 com
//   200 video/mp4 (687 MB), nuvio-media HLS 200 (playlist VOD real),
//   magnetcloud .mp4 206 e HLS 200.
// Teste no Nuvio (celular do Davi) ainda pendente.

const ADDON_URL = 'https://zeusoficial.dpdns.org';
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

// "Zeus ⚡ • 1080p" -> "1080p"; "Auto" (resolução não identificada) -> "720p" (padrão).
function parseQuality(name) {
  const m = typeof name === 'string' ? name.match(/(\d{3,4})p/) : null;
  return m ? m[1] + 'p' : '720p';
}

// Última linha do título: "🔊 Dublado" / "💬 Legendado" / "🎧 Audio".
// "Audio" não diz se é dublado ou legendado — descarta (regra PT).
function parseAudio(title) {
  if (typeof title !== 'string') return null;
  if (title.includes('Dublado')) return 'Dublado';
  if (title.includes('Legendado')) return 'Legendado';
  return null;
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
      const audio = parseAudio(st.title);
      if (!audio) continue;
      out.push({
        name: 'Zeus Oficial',
        title: audio,
        url,
        quality: parseQuality(st.name),
        headers: {},
      });
    }
    return out;
  } catch (error) {
    console.error('[Zeus Oficial] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };
