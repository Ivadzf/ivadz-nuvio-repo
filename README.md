# Ivadz Nuvio Repo

Repositório brasileiro para o Nuvio — fork combinado de vários repos, com 43 providers, todos em português.

## Providers incluídos (43)

### Base — saimuelbr/saimuel-nuvio-repo (4)
| id | Nome | Tipo |
|---|---|---|
| fshd | FSHD | filme, série |
| megaembed | MegaEmbed | filme, série |
| peachify | Peachify | filme, série |
| redeflix | RedeFlix | filme, série |

### Base — lawlietbr/liet-nuvio (4)
| id | Nome | Tipo |
|---|---|---|
| pomfy | Pomfy | filme, série |
| mywallpaper | My Wallpaper | série (anime) |
| doramogo | Doramogo | filme, série |
| myembed | MyEmbed | filme, série |

### Kamirama — kaminarizz/Kamirama-Plugin (21)
amyflix, anibunker, animefire, animesdrive, animeshd, animesonlineblue, animesonlinecloud, animy, anistream, anizero, anizone, berryanimes, donghuanosekai, embedmovies, homura, megaembedapi, otakulogia, superanimes, tomato, topanimes, yumefree — maioria anime, alguns filmes/séries e doramas.

### PT-BR — Droydr13/plugin-pt-fr, só os em português (9)
animezey, netcine, pobreflix, topfilmes (só filmes), overflix, ultracine, animescloud, animesdigital, doramasonline.

### PT-BR — nathanael540/nuvio-fontes-ptbr-plugin (1)
cineagora — filmes e séries em HLS, dublado ou legendado. Precisa da chave do TMDB fornecida pelo app (configure em Settings > Integrations > TMDB Enrichment).

### Portado do CloudStream — lawlietbr/lietrepo (3)
goyabu — anime legendado/dublado, até 1080p (Blogger/Google Video). Reescrito em JS a partir da extensão Kotlin do Goyabu: busca o título via TMDB (precisa da chave do TMDB fornecida pelo app, como o cineagora), resolve o episódio no goyabu.io e extrai os links via API do Blogger. Só séries/anime (`tv`); temporadas além da 1ª são buscadas como "Título Nª temporada".
anitube — anime legendado/dublado, até 1080p (HLS) + Blogger/Google Video. Reescrito em JS a partir da extensão Kotlin do AniTube. Atenção: o código original aponta para anitube.news, mas o site mudou para **anitube.zip** (o .news redireciona com 301) — o provider usa o .zip direto. (O anitube.js do Kamirama aponta para o antigo anitube.vip e não implementa este fluxo, por isso não foi reaproveitado.) Busca o título via TMDB (precisa da chave do TMDB fornecida pelo app); em caso de empate entre animes com o mesmo título (ex.: Naruto vs Naruto Shippuden), desempata pelo ano do TMDB e prefere dublado. Só séries/anime (`tv`).
dattebayobr — anime legendado/dublado (também tokusatsu, dorama e donghua), até 1080p (MP4 direto). Reescrito em JS a partir da extensão Kotlin do DattebayoBR. A página do episódio traz os MP4s em scripts `var vid = 'https://<host>.r2.cloudflarestorage.com/...mp4'` (qualidade pelo container jwContainer_0/1/2 ou pelo caminho /fful/, /f222/, /f333/, /fiphoneb/, /fiphonec/); a URL crua precisa de parâmetros de autenticação obtidos via outbrain.js + ads.animeyabu.net (POST com o JS, depois GET com o token). Busca o título via TMDB (precisa da chave do TMDB fornecida pelo app); desempata por ano e prefere dublado, como o AniTube. Séries/anime e filmes (`tv` e `movie`). Atenção: o href da busca (/animes/<slug>) não é a URL real da página do anime — o site resolve para /anime-dublado/<hash>; o provider segue os redirecionamentos.

### PobreFlixTVFree — pobreflixtvfree.click (1)
pobreflixtvfree — filmes e séries, dublado e legendado (HLS, 480p nos títulos testados). Outro domínio do Pobreflix (o provider `pobreflix` do repo aponta para pobreflixtv.club, que hoje redireciona para pobreflixtv.golf). Busca o título via TMDB (precisa da chave do TMDB fornecida pelo app); busca `/buscar?q=` e casa por título + tipo (os cards não trazem ano). Página do filme/episódio traz os embeds em botões `data-url`: plenoflu.com (dublado) e vidsrc-embed.ru (legendado). Plenoflu: filme = `data-id dyn:movie:<id>:<servidor>` + POST `/api getPlayer` (URL do embed em base64); série = `DIRECT_EPISODE_ID` + POST `/api getOptions` (options com url e type 1=dublado/2=legendado). Dublado resolve pelo vaiquecol.com: a página do embed tem um único hex de 32 chars (ID do FirePlayer) e o POST `/player/index.php?data=<ID>&do=getVideo` devolve o `.m3u8` direto (`securedLink`, com md5+expires). Legendado resolve pelo vidsrc.sh (mesma cadeia do VidSrc removido: vs_src.php -> stellar -> CONFIG -> metaApi -> stream_urls -> generate.php por origem). SuperFlix e StreamBetter (outras opções do Plenoflu) são ignorados: Turnstile. O `securedLink` do vaiquecol e o `apiToken` do VidSrc são amarrados ao IP — na VM o master.m3u8 dá 403 e o stream_urls dá 403, então o teste final é no Nuvio, no aparelho (IP estável).

## O que ficou de fora — e por quê

- **Francês (plugin-pt-fr): 37 providers só em francês** — anime-sama, movix, nakios, purstream, anime-ultime, animesama-co, animesultra, animevostfr, animoflix, coflix, french-anime, dulourd, flemmix, french-manga, voiranime-homes, frenchstream, mugiwarastream, sekai, voiranime, voiranime-one, voiranime-be, jetanimes, senanimes, adkami, animesite, voiranime-rip, vostfree, papadustream, wookafr, streamzo, waveanime, neko-sama, franime, fluneo, voirdrama, fullanime, animevost-fr. Todos com `contentLanguage: ["fr"]`.
- **Francês + português misturado (plugin-pt-fr): 10 providers** — anizone, anidb, castle, goated, moviebox, netmirror, peachify, vidlink, videasy, vidlove. Eles filtram para áudio em francês *ou* português, então também devolveriam conteúdo em francês. Não entraram para o repo ficar só em português. O `vidlink`, além disso, nem tem o arquivo `providers/vidlink.js` no repo original.
- **Duplicados:** doramogo, pomfy e redeflix (Kamirama) e fshd, megaembed, redeflix e peachify (plugin-pt-fr) já estavam na base — mantida a versão original. O donghuanosekai apareceu nos dois repos novos; ficou a versão do Kamirama.
- **meuvod (brunacristtina/plugins_nuvio_repo): excluído de propósito.** O arquivo traz embutidas as credenciais de 4 servidores Xtream da autora. Incluir o arquivo como está publicaria as contas dela. Se você tiver sua própria conta Xtream, dá pra incluir uma versão com as suas credenciais — me avise.
- **animesfhd e anitube (Kamirama):** existem como arquivos, mas o autor não os registrou no `manifest.json` dele. Não foram incluídos.

## Instalação no Nuvio

Depois de publicar este repo no GitHub, copie a URL raw do manifest e cole no Nuvio:

```
https://raw.githubusercontent.com/Ivadzf/ivadz-nuvio-repo/main/manifest.json
```

No app: **Settings > Plugins > Add Repository** — cole a URL, salve, atualize e ative os providers que quiser.

> Só a versão sideloaded do Nuvio aceita plugins. A versão da Play Store não aceita.
> Em alguns providers, configure a chave da API do TMDB em **Settings > Integrations > TMDB Enrichment**.

## Validação

- `manifest.json` válido, 43 scrapers, ids únicos, todos os arquivos presentes, nenhum com `contentLanguage` francês.
- Teste de carregamento no Node (com `crypto-js` instalado, que o Nuvio já fornece no runtime): 39 de 40 exportam `getStreams`. Exceção: `redeflix` encerra o processo ao carregar no Node — comportamento que já existe no repo original do Saimuel, não foi a junção que quebrou. No Nuvio ele é um provider publicado; se falhar no app, desative-o no manifest (`"enabled": false`).
- `goyabu` (v1.2.0): port do CloudStream validado com dados reais — o fluxo do Blogger foi testado com um token real de episódio do site: `video.g` respondeu 200 com `f_sid`/`bl` reais e o `batchexecute` devolveu links `googlevideo.com/videoplayback` (o parser do provider extraiu 1 link limpo, itag 18, sem escapes sobrando). A busca e a lista de episódios no goyabu.io foram confirmadas no navegador (resultados `/anime/...`, episódios em `/41414`, `/41415`...); o HTML bruto não pôde ser lido daqui porque o site usa Cloudflare que bloqueia datacenter (HTTP 403), então o teste final do provider é no Nuvio, no aparelho. O passo do Blogger é o mais lento (~20s) — o primeiro carregamento pode demorar.
- `anitube` (v1.3.0): port do CloudStream testado de ponta a ponta com o site ao vivo (anitube.zip): busca, página do anime, episódios, aba HLS (m3u8 real, HTTP 200) e fluxo do Blogger (batchexecute 200 com links googlevideo). Teste fim a fim em Node com TMDB simulado (Naruto, 2002): devolveu 2 links reais do episódio 1 dublado — HLS 1080p + Blogger 360p — em ~7s. O desempate por ano + preferência por dublado foi validado no mesmo teste (antes dele, o provider pegava o Shippuden por engano).
- `dattebayobr` (v1.4.0): port do CloudStream com validação parcial. Confirmado ao vivo: busca (resultados com contagem de episódios), página do anime (h1, Ano 2002, 220/220, lista de episódios com 23 por página) e página do episódio 1 (carrega, player JW com SD/HD). A extração dos MP4s (`var vid` com URLs R2) e a dança do token (outbrain.js + ads.animeyabu.net) NÃO puderam ser testadas daqui: o site bloqueia datacenter (Cloudflare 403 no curl) e o código-fonte da página não pôde ser aberto nem no navegador (Ctrl+U/DevTools bloqueados, inclusive pelo usuário) — os scripts ficam invisíveis para o leitor de texto. O provider é um port fiel do Kotlin, com testes de unidade passando (extração, qualidades, token, episódios), e o teste final é no Nuvio, no aparelho. Detalhe: o link SD/HD visível na página do episódio aponta para `arft.casa2.online`, domínio morto (DNS não resolve nem no navegador) — não faz parte do fluxo do Kotlin e foi ignorado.
- `pobreflixtvfree` (v1.7.0): outro domínio do Pobreflix (pobreflixtvfree.click), validado ao vivo na VM até o passo anterior ao vídeo: busca `/buscar?q=` (cards com título + tipo, sem ano), página do filme e do episódio (botões `data-url` plenoflu + vidsrc-embed.ru), Plenoflu filme (`data-id dyn:movie:36055:<servidor>` + POST `/api getPlayer` com URL em base64) e série (`DIRECT_EPISODE_ID` 58249 + POST `/api getOptions` com 4 opções e type 1/2), vaiquecol filme e série (FirePlayer ID único de 32 hex na página + POST `getVideo` devolvendo `securedLink` .m3u8 com md5+expires, válido por 2h) e vidsrc.sh (vs_src.php 200 com URL stellar; metaApi 200 com host do pool). Teste de ponta a ponta em Node (TMDB simulado): filme e Breaking Bad 1x1 retornaram 1 stream Dublado cada (vaiquecol, .m3u8 com qualidade 480p medida na playlist master — o site diz HD, mas os dois títulos testados trazem até 480p). NÃO validado da VM: o `stream_urls` do VidSrc dá 403 (apiToken amarrado à faixa de IP) — o teste final é no Nuvio, no aparelho. O canal vidsrc-embed.ru do site não responde da VM (timeout); o provider só o usa como fallback se o Plenoflu não render nada.
- `vidsrc` (v1.6.0, removido na v1.6.1): encontrado via GoFlix (o servidor "English" do GoFlix embute o VidSrc). Cadeia validada ao vivo até o passo do `stream_urls` (embed vidsrc.ir -> `vs_src.php` -> embed stellar -> playerUrl -> CONFIG -> metaApi), mas o provider não apareceu no Nuvio e o Davi decidiu manter o repo só em português por enquanto — o VidSrc é áudio original em inglês. O arquivo `providers/vidsrc.js` foi apagado do GitHub; uma cópia local da investigação ficou em `workspace/nuvio-plugin/goflix-vidsrc-notes/` (fora do repo). O GoFlix em si não virou provider: os outros servidores dele são SuperFlix (Turnstile + cadeia MegaFlix, já descartada), EmbedPlay/ABYS (opções carregadas por JS, validação por referer, stream resolvido pelo JS do player) e MyEmbed (já existe no repo como `myembed`). O RedeCanais, investigado antes do GoFlix, também não é portável: busca quebrada, captcha antes do play e APIs com erro 521.

## Como adicionar um novo provider

1. Copie `src/_template/index.js` para `providers/<novo-id>.js` e adapte a busca da sua fonte.
2. Adicione uma entrada no `manifest.json`, no array `scrapers`:
```json
{
  "id": "novo-id",
  "name": "Novo Provider",
  "description": "Descrição curta | 1080p",
  "version": "1.0.0",
  "author": "davi",
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

## Créditos e licença

- Base: saimuelbr (MIT) e lawlietbr (GPL-3.0).
- Kamirama: kaminarizz (sem LICENSE no repo original).
- plugin-pt-fr: Droydr13 (sem LICENSE no repo original).
- cineagora: nathanael540 (GPL-3.0).
- meuvod não incluído (ver acima).
- Este repo combinado é distribuído sob **GPL-3.0** (ver `LICENSE`). Mantenha os créditos dos autores originais.

## Aviso legal

Este projeto não hospeda, transmite ou distribui mídia. Os providers apenas buscam links públicos de terceiros. O uso é de responsabilidade do usuário, conforme as leis locais.
