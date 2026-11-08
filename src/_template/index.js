// Template de provider para o Nuvio
// Copie para providers/<novo-id>.js e adapte a URL da sua fonte.
// Use Promise chains (.then) em vez de async/await no arquivo final.

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[MeuProvider] Buscando ' + mediaType + ' ' + tmdbId);

  // Exemplo: API que recebe o ID do TMDB e devolve streams.
  // Troque pela sua fonte real. Para serie, use season/episode na URL.
  var url = 'https://api.exemplo.com/streams/' + tmdbId;
  if (mediaType === 'tv') {
    url += '?season=' + season + '&episode=' + episode;
  }

  return fetch(url)
    .then(function (response) { return response.json(); })
    .then(function (data) {
      return (data.streams || []).map(function (s) {
        return {
          name: 'MeuProvider',
          title: s.title || (s.quality || '1080p'),
          url: s.url,
          quality: s.quality || '1080p',
          size: s.size || undefined,
          headers: s.headers || undefined
        };
      });
    })
    .catch(function (error) {
      console.error('[MeuProvider] Erro:', error.message);
      return [];
    });
}

module.exports = { getStreams };
