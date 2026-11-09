// Veyra — provider do Nuvio.
//
// Fonte: o addon Stremio Veyra (https://veyra.shardweb.app/,
// community.veyra.addon v2.1.3). O addon devolve streams cuja URL é
//   https://veyra.shardweb.app/{series|movie}/<base64>
// onde o base64 decodifica para o vídeo direto em nixplay.lat:
//   filme: https://nixplay.lat/movie/nyxor-vods/h7scUfdpc/<tmdb>.mp4
//   série: https://nixplay.lat/series/nyxor-vods/h7scUfdpc/<tmdb><s:03d><e:03d>.mp4
// (ex.: BB 1x1 = 1396 + 001 + 001 = 1396001001; BB 5x16 = 1396005016).
// O provider vai DIRETO ao nixplay.lat (sem passar pelo addon e
// sem precisar da chave do TMDB — o id é o TMDB id, usado na URL).
// O nixplay responde 302 para uma URL assinada no Cloudflare R2
// (f9ec...r2.cloudflarestorage.com/videos-veo/..., X-Amz-Expires
// 18000 = 5h); o Nuvio segue o redirect na hora do play, então o
// provider devolve a URL do nixplay. O nome do arquivo no R2
// confirma o áudio dublado ("breaking-bad-dublado_S01E01.mp4",
// "Clube da Luta _1999_ ...", "A Origem _2010_ ...").
//
// O provider confere a existência com um HEAD (redirect: 'manual'):
// 302 = vídeo existe; 200 = "ERRO: Vídeo não encontrado no banco
// de dados." (text/plain) -> [].
//
// Validado 2026-11-09 (VM, ao vivo):
// - Breaking Bad 1x1: 302 -> R2 breaking-bad-dublado_S01E01.mp4
//   (video/mp4, HTTP 200 ao seguir o redirect).
// - Breaking Bad 5x16: 302 -> R2.
// - Clube da Luta (filme 550): 302 -> R2 "Clube da Luta _1999_".
// - A Origem (filme 27205): 302 -> R2 "A Origem _2010_".
// - The Office 1x1 (2316 -> 2316001001): 302 -> R2.
// - Título inexistente (999999999) e episódio inexistente
//   (BB s99e99): 200 "ERRO: Vídeo não encontrado" -> [].
// O addon Veyra em si também retorna outras fontes (dbonline,
// brserver) — o provider usa só o nixplay, que é direto e
// construtível.

const NIXPLAY = 'https://nixplay.lat';
const NYXOR = 'nyxor-vods/h7scUfdpc';
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

function pad3(n) {
  return String(n).padStart(3, '0');
}

// HEAD sem seguir redirect: 302 = existe; 200 = erro "não encontrado".
async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA } });
    return res.status === 302;
  } catch (e) {
    return false;
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const id = String(tmdbId || '').trim();
    if (!/^\d+$/.test(id)) return [];
    const isTv = mediaType === 'tv';
    const s = Number(season) || 1;
    const e = Number(episode) || 1;
    const url = isTv
      ? NIXPLAY + '/series/' + NYXOR + '/' + id + pad3(s) + pad3(e) + '.mp4'
      : NIXPLAY + '/movie/' + NYXOR + '/' + id + '.mp4';
    if (!(await exists(url))) return [];
    return [{
      name: 'Veyra',
      title: 'Dublado',
      url: url,
      quality: '720p',
      headers: { 'User-Agent': UA },
    }];
  } catch (error) {
    console.error('[Veyra] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { pad3, exists };
