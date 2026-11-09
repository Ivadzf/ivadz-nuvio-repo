# Ivadz Nuvio Repo

Repositório de providers em português para o [Nuvio](https://nuvio.app) — filmes, séries, animes, doramas e tokusatsu, com áudio dublado e legendado.

São **47 providers**: 46 em português e 1 em inglês (o frameXTV, áudio original).

## Instalação

1. Copie a URL do manifest:

```
https://raw.githubusercontent.com/Ivadzf/ivadz-nuvio-repo/main/manifest.json
```

2. No Nuvio, vá em **Settings > Plugins > Add Repository**, cole a URL e salve.
3. Atualize a lista e ative os providers que quiser usar.

### Requisitos

- **Só a versão sideloaded do Nuvio aceita plugins.** A versão da Play Store não aceita.
- **Chave do TMDB:** vários providers precisam dela para buscar o título. Configure em **Settings > Integrations > TMDB Enrichment**. Sem ela, esses providers não retornam nada.

Os providers que precisam da chave do TMDB são: `cineagora`, `goyabu`, `anitube`, `dattebayobr`, `pobreflix`, `pobreflixtvfree`, `kairou` e `primeflix`. Os demais resolvem direto pelo TMDB id ou pelo próprio site e não precisam dela.

## Providers (47)

### Filmes e séries

- **FSHD** (`fshd`) — filmes e séries, 1080p.
- **MegaEmbed** (`megaembed`) — filmes e séries, 1080p/720p.
- **Peachify** (`peachify`) — filmes e séries, 1080p.
- **RedeFlix** (`redeflix`) — filmes e séries, 1080p.
- **Pomfy** (`pomfy`) — filmes e séries, 1080p.
- **MyEmbed** (`myembed`) — filmes e séries.
- **CineAgora** (`cineagora`) — filmes e séries em HLS, dublado ou legendado. Precisa da chave do TMDB.
- **NetCine** (`netcine`) — filmes, séries e anime em português.
- **TopFilmes** (`topfilmes`) — só filmes, dublados.
- **OverFlix** (`overflix`) — filmes e séries dublados.
- **UltraCine** (`ultracine`) — filmes e séries dublados.
- **PobreFlix** (`pobreflix`) — filmes e séries, dublado e legendado (via Streamtape). Precisa da chave do TMDB.
- **PobreFlixTVFree** (`pobreflixtvfree`) — filmes e séries, dublado e legendado (HLS, 480p). Precisa da chave do TMDB.
- **Kairou** (`kairou`) — filmes e séries, dublado e legendado, 1080p. Precisa da chave do TMDB.
- **PrimeFlix** (`primeflix`) — filmes e séries, dublado e legendado (HLS, até 1080p). Precisa da chave do TMDB.
- **VenoPlay** (`venoplay`) — filmes e séries, só dublado (HLS, 480p). Não precisa da chave do TMDB. Nem todo título tem fonte direta — nesses casos ele não retorna nada.
- **EmbedMovies** (`embedmovies`) — filmes e séries, incluindo anime.
- **MegaEmbedAPI** (`megaembedapi`) — só filmes, dublado, 360p/720p.
- **frameXTV** (`framextv`) — filmes e séries, **áudio original em inglês**, 1080p. Não precisa da chave do TMDB. É o único provider em inglês do repo; a API devolve legendas em PT-BR, mas o formato do Nuvio não anexa legendas, então no app toca em inglês sem legenda.

### Anime

- **My Wallpaper** (`mywallpaper`) — anime (séries).
- **Berry Animes** (`berryanimes`) — anime (séries), até 1080p.
- **AniStream** (`anistream`) — anime (séries e filmes), até 1080p.
- **AniZone** (`anizone`) — anime (séries e filmes), até 1080p.
- **AniZero** (`anizero`) — anime (séries e filmes), até 720p.
- **TopAnimes** (`topanimes`) — anime (séries).
- **Super Animes** (`superanimes`) — anime (séries e filmes).
- **AnimeFire** (`animefire`) — anime (séries e filmes).
- **Animes Online Cloud** (`animesonlinecloud`) — anime (séries e filmes).
- **Animes Online Blue** (`animesonlineblue`) — anime (séries), até 720p.
- **YumeFree** (`yumefree`) — anime (séries e filmes).
- **Otakulogia** (`otakulogia`) — anime (séries e filmes).
- **AniBunker** (`anibunker`) — anime (séries e filmes).
- **Animes HD** (`animeshd`) — anime (séries e filmes).
- **Animes Drive** (`animesdrive`) — anime (séries e filmes).
- **Animy** (`animy`) — anime (séries e filmes).
- **Donghua no Sekai** (`donghuanosekai`) — donghua e anime (séries e filmes).
- **Homura** (`homura`) — anime (séries e filmes), até 720p.
- **Tomato** (`tomato`) — anime (séries), 480p/720p/1080p.
- **AnimeZeY** (`animezey`) — filmes, séries e anime em português.
- **AnimesCloud** (`animescloud`) — anime em português (dublado e legendado).
- **AnimesDigital** (`animesdigital`) — anime e desenhos em português (dublado e legendado).
- **Goyabu** (`goyabu`) — anime legendado/dublado, até 1080p. Precisa da chave do TMDB.
- **AniTube** (`anitube`) — anime legendado/dublado, até 1080p (HLS). Precisa da chave do TMDB.
- **DattebayoBR** (`dattebayobr`) — anime, tokusatsu, dorama e donghua, legendado/dublado, até 1080p (MP4). Precisa da chave do TMDB.

### Doramas e conteúdo asiático

- **Doramogo** (`doramogo`) — filmes e séries, 1080p.
- **Doramas Online** (`doramasonline`) — doramas com legendas em português.
- **AmyFlix** (`amyflix`) — séries e filmes asiáticos, incluindo GL.

## O que ficou de fora — e por quê

- **Francês:** 37 providers só em francês e 10 que misturam francês e português não entraram — o repo é só em português (exceto o frameXTV, em inglês).
- **Duplicados:** alguns providers apareciam em mais de um repo base; ficou uma versão de cada.
- **meuvod:** excluído de propósito — o arquivo original traz embutidas as credenciais de servidores Xtream da autora. Incluir o arquivo publicaria as contas dela.
- **animesfhd e anitube (Kamirama):** existem como arquivos, mas o autor não os registrou no `manifest.json` dele, então não foram incluídos.

## Status

Os providers são testados sempre que possível antes de entrar no repo, mas os sites mudam de domínio, trocam o player ou removem vídeos — um provider pode parar de devolver resultados para um título (ou para todos) sem aviso. Se um provider não retornar nada para um título, tente outro; se parou para tudo, abra uma issue.

## Como adicionar um novo provider

1. Copie `src/_template/index.js` para `providers/<novo-id>.js` e adapte a busca da sua fonte.
2. Adicione uma entrada no `manifest.json`, no array `scrapers`:

```json
{
  "id": "novo-id",
  "name": "Novo Provider",
  "description": "Descrição curta | 1080p",
  "version": "1.0.0",
  "author": "seu-nome",
  "supportedTypes": ["movie", "tv"],
  "filename": "providers/novo-id.js",
  "enabled": true,
  "formats": ["m3u8"],
  "contentLanguage": ["pt-br"],
  "limited": false,
  "disabledPlatforms": [],
  "supportsExternalPlayer": true,
  "tags": ["filmes", "séries"]
}
```

3. Teste localmente antes de publicar:

```bash
npm install --no-save crypto-js cheerio-without-node-native
node -e "const {getStreams}=require('./providers/novo-id.js'); getStreams('872585','movie').then(s=>console.log(s.length, s.slice(0,2)))"
# 872585 = Oppenheimer no TMDB, só um exemplo
```

Regras do provider:

- Exportar `getStreams(tmdbId, mediaType, season, episode)`.
- Retornar um array de `{ name, title, url, quality, size?, headers? }`.
- Preferir Promise chains (`.then()`) a `async/await` no arquivo final, por limitação do motor JS do app. Se usar `async/await`, transpilar antes.
- Nunca retornar erro: em caso de falha, retornar `[]`.
- **Nunca embutir credenciais** (chaves de API, usuários/senhas de painéis, cookies de sessão) no código do provider. Use só a chave do TMDB fornecida pelo app.
- Só conteúdo em português (dublado ou legendado), salvo exceção aprovada.

## Créditos e licença

- Base: saimuelbr (MIT) e lawlietbr (GPL-3.0).
- Kamirama: kaminarizz (sem LICENSE no repo original).
- plugin-pt-fr: Droydr13 (sem LICENSE no repo original).
- cineagora: nathanael540 (GPL-3.0).
- Este repo combinado é distribuído sob **GPL-3.0** (ver `LICENSE`). Mantenha os créditos dos autores originais.

## Aviso legal

Este projeto não hospeda, transmite ou distribui mídia. Os providers apenas buscam links públicos de terceiros. O uso é de responsabilidade do usuário, conforme as leis locais.
