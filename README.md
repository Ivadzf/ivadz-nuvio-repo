# Ivadz Nuvio Repo

Repositório brasileiro para o Nuvio — fork combinado de vários repos, com 47 providers (46 em português + 1 em inglês, o frameXTV).

## Providers incluídos (47)

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

### PobreFlix — pobreflixtv.golf (1)
pobreflix — filmes e séries, dublado e legendado (MP4 via Streamtape). **Reescrito do zero em 2026-11-08**: o domínio antigo pobreflixtv.club hoje redireciona para o .golf e o template antigo (busca `/pesquisar/?p=`, player `/e/getplay.php`) não existe mais — o provider antigo ficou sem resultados. O arquivo antigo está guardado fora do repo (`pobreflix-old-template-backup.js`). Busca o título via TMDB (precisa da chave do TMDB fornecida pelo app); busca `POST /index.php?app=videobox&module=video&controller=index&do=buscarContent` com header `X-Requested-With: XMLHttpRequest` e form `q=<título>` (só esse header é necessário — sem ele dá 301; não precisa de cookie nem csrfKey) e casa por título + tipo + ano (os resultados trazem título, ano e tags HD/CAM/DUAL). A página traz `<div id="view" data-video-id="<id>">` (a página da série traz o id em `<section class="vbEpisodes" data-video-id>`); o player vem de `GET ...&do=playerData&id=<id>` (também com X-Requested-With): `{players: [{label, url}], servers_dub, servers_leg}` — os servidores são Byse, DoodStream, MixDrop e Streamtape, e o embed é `players[i].url + id`. Séries: `GET ...&do=episodesList&id=<seriesId>&season=<s>&audio=Dublado` devolve os episódios com URL; a página do episódio tem seu próprio data-video-id. Só o Streamtape resolve sem interação: `GET https://streamtape.com/e/<id>` traz o .mp4 direto escondido em `#robotlink` (`/streamtape.com/get_video?id=...&expires=...&ip=...&token=...`). Byse tem verificação humana, DoodStream tem captcha e MixDrop está atrás de Cloudflare — ignorados. O token do get_video é amarrado ao IP (da VM dá 000, igual ao MegaFlix), então o teste final é no Nuvio. Qualidade 720p é o rótulo HD do site, não medido.

### PobreFlixTVFree — pobreflixtvfree.click (1)
pobreflixtvfree — filmes e séries, dublado e legendado (HLS, 480p nos títulos testados). Outro domínio do Pobreflix (o provider `pobreflix` do repo, reescrito em 2026-11-08, aponta para pobreflixtv.golf). Busca o título via TMDB (precisa da chave do TMDB fornecida pelo app); busca `/buscar?q=` e casa por título + tipo (os cards não trazem ano). Página do filme/episódio traz os embeds em botões `data-url`: plenoflu.com (dublado) e vidsrc-embed.ru (legendado). Plenoflu: filme = `data-id dyn:movie:<id>:<servidor>` + POST `/api getPlayer` (URL do embed em base64); série = `DIRECT_EPISODE_ID` + POST `/api getOptions` (options com url e type 1=dublado/2=legendado). Dublado resolve pelo vaiquecol.com: a página do embed tem um único hex de 32 chars (ID do FirePlayer) e o POST `/player/index.php?data=<ID>&do=getVideo` devolve o `.m3u8` direto (`securedLink`, com md5+expires). Legendado resolve pelo vidsrc.sh (mesma cadeia do VidSrc removido: vs_src.php -> stellar -> CONFIG -> metaApi -> stream_urls -> generate.php por origem). SuperFlix e StreamBetter (outras opções do Plenoflu) são ignorados: Turnstile. O `securedLink` do vaiquecol e o `apiToken` do VidSrc são amarrados ao IP — na VM o master.m3u8 dá 403 e o stream_urls dá 403, então o teste final é no Nuvio, no aparelho (IP estável).

### Kairou — kairou.space (1)
kairou — filmes e séries, dublado e legendado (1080p, HLS/MP4). O site é um front TMDB com proxy próprio e o player resolve os vídeos por uma API pública sem login: `GET /api/extract?tmdbId=<id>&type=movie|series&season=<s>&episode=<e>&title=<título>` devolve `{streams: [...], subtitles: [...]}`; cada stream já vem com URL pronta no formato `/api/proxy?url=<upstream codificado>&referer=<...>` (o proxy repassa o vídeo e reescreve os segmentos .m3u8). O provider só repassa essas URLs (dublado primeiro quando `alive`/`status 200`). Fontes: zunderflix (dublado e legendado), kingvod/watchplay (dublado), bscine (dublado, MP4 direto). O campo `status` é só a sonda de saúde do Kairou (200 ok, 429 rate-limit, 504 timeout da sonda) — streams com 504 foram verificados tocando (master 1080p). As legendas PT-BR do extract (VTT via `/api/proxy?format=vtt`) não entram no formato de stream do Nuvio e são ignoradas.

### frameXTV — framextv.cc (1)
framextv — filmes e séries, áudio original em inglês, 1080p (HLS). **Exceção à regra de só-português, incluído a pedido do Davi (2026-11-08).** A API do site resolve o vídeo direto pelo TMDB id, sem busca nem chave do TMDB: `GET https://api.framextv.tech/api/stream?type=movie|tv&id=<tmdb>&season=<s>&episode=<e>` devolve `{success, provider, sources: [{url, quality, type, server, audio, audioTracks}], subtitles: [...], alternates: [...], errors: [...]}`. A URL é um .m3u8 direto e assinado (Expires + Signature). A API devolve legendas em vários idiomas, incluindo PT-BR (por/pt/pt-br) — mas o formato de stream do Nuvio não tem campo de legenda, então no app o áudio toca em inglês sem legenda. Se o backend padrão não trouxer fontes, o provider tenta os `alternates` da resposta via `&provider=<nome>` e o mirror `api.framextv.cc`.

### PrimeFlix — primeflix.sh (1)
primeflix — filmes e séries, dublado e legendado (HLS, até 1080p). O player é o Playerjs 21.0.5, inicializado na própria página do título com um `file` que é a URL do stream: filme = `file: "/vvv?id=<v_id>&mobile=1&get=video"`; série = `file: [{comment: "Temporada N", playlist: [{comment: "Serie M", file: "/vvv?id=<v_id>&season=<s>&episode=<e>&mobile=1&get=video"}]}]`. O `/vvv` redireciona (302) para a playlist .m3u8 real; o nome do arquivo carrega a qualidade (1080p...) e o áudio (`_dub_` dublado, `_leg_` legendado, `dual` áudio duplo). Os segmentos .ts têm md5 + expires (~2h) e `ref=<página do título>`, por isso o provider devolve a URL `/vvv` (sempre fresca) e só usa o fetch do `/vvv` para descobrir qualidade/áudio. Busca o título via TMDB (precisa da chave do TMDB fornecida pelo app); busca `GET /live-search?q=<título>` (JSON com title/description/link) e casa por título. Vídeo removido do site (ex.: O Bom Bandido, `/vvv` dá 404 até no navegador real) devolve `[]` sem derrubar nada.

### VenoPlay — w2.venoplay.site (1)
venoplay — filmes e séries, dublado (HLS, 480p nos títulos testados). O site resolve o player por uma API pública (`GET /api/get_players?id=<id interno>&season_number=<s>&episode_number=<e>&site_id=4` → `{players: [{name: "Dublado", url: mgeb.lat...}, {name: "Legendado", url: nhdapi.com...}]}`), mas o provider vai direto ao player Dublado (mgeb.lat/MegaTube), que usa o ID do TMDB no caminho — filme `/embed/<tmdb>`, série `/embed/<tmdb>/<s>/<e>` — sem busca e sem chave do TMDB. O embed traz um array `sources` com várias opções; o provider só usa as .m3u8 diretas (mgeb.space, uqload) e descarta as URLs de Cloudflare Worker (assinadas, de uso único — uma testada deu 403 "Assinatura inválida") e os MP4s do fontedecanais (trazem `username=`/`token=` na URL — credencial embutida, proibida no repo). O Legendado (nhdapi.com) não entra: o host é inacessível (HTTPS falha da VM, erro de certificado no navegador). **Atenção ao Referer:** o uqload serve um "promo" de 30s quando a requisição traz Referer (302 para `/taunt/promo/`); sem Referer ele devolve o vídeo real — por isso o provider NÃO envia Referer em nenhuma requisição. Nem todo título tem fonte direta (ex.: A Origem só tem MP4 com credencial) — nesses casos o provider devolve `[]`.

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

- `manifest.json` válido, 45 scrapers, ids únicos, todos os arquivos presentes, nenhum com `contentLanguage` francês (o `framextv` é `["en"]` — áudio original em inglês, incluído a pedido do Davi).
- Teste de carregamento no Node (com `crypto-js` instalado, que o Nuvio já fornece no runtime): 39 de 40 exportam `getStreams`. Exceção: `redeflix` encerra o processo ao carregar no Node — comportamento que já existe no repo original do Saimuel, não foi a junção que quebrou. No Nuvio ele é um provider publicado; se falhar no app, desative-o no manifest (`"enabled": false`).
- `goyabu` (v1.2.0): port do CloudStream validado com dados reais — o fluxo do Blogger foi testado com um token real de episódio do site: `video.g` respondeu 200 com `f_sid`/`bl` reais e o `batchexecute` devolveu links `googlevideo.com/videoplayback` (o parser do provider extraiu 1 link limpo, itag 18, sem escapes sobrando). A busca e a lista de episódios no goyabu.io foram confirmadas no navegador (resultados `/anime/...`, episódios em `/41414`, `/41415`...); o HTML bruto não pôde ser lido daqui porque o site usa Cloudflare que bloqueia datacenter (HTTP 403), então o teste final do provider é no Nuvio, no aparelho. O passo do Blogger é o mais lento (~20s) — o primeiro carregamento pode demorar.
- `anitube` (v1.3.0): port do CloudStream testado de ponta a ponta com o site ao vivo (anitube.zip): busca, página do anime, episódios, aba HLS (m3u8 real, HTTP 200) e fluxo do Blogger (batchexecute 200 com links googlevideo). Teste fim a fim em Node com TMDB simulado (Naruto, 2002): devolveu 2 links reais do episódio 1 dublado — HLS 1080p + Blogger 360p — em ~7s. O desempate por ano + preferência por dublado foi validado no mesmo teste (antes dele, o provider pegava o Shippuden por engano).
- `dattebayobr` (v1.4.0): port do CloudStream com validação parcial. Confirmado ao vivo: busca (resultados com contagem de episódios), página do anime (h1, Ano 2002, 220/220, lista de episódios com 23 por página) e página do episódio 1 (carrega, player JW com SD/HD). A extração dos MP4s (`var vid` com URLs R2) e a dança do token (outbrain.js + ads.animeyabu.net) NÃO puderam ser testadas daqui: o site bloqueia datacenter (Cloudflare 403 no curl) e o código-fonte da página não pôde ser aberto nem no navegador (Ctrl+U/DevTools bloqueados, inclusive pelo usuário) — os scripts ficam invisíveis para o leitor de texto. O provider é um port fiel do Kotlin, com testes de unidade passando (extração, qualidades, token, episódios), e o teste final é no Nuvio, no aparelho. Detalhe: o link SD/HD visível na página do episódio aponta para `arft.casa2.online`, domínio morto (DNS não resolve nem no navegador) — não faz parte do fluxo do Kotlin e foi ignorado.
- `pobreflix` (v1.9.1): **reescrito do zero** — o provider antigo (template pobreflixtv.club, busca `/pesquisar/?p=`) ficou sem resultados porque o domínio mudou para pobreflixtv.golf e o template mudou (IPS + videobox). Novo fluxo validado ao vivo na VM: busca `POST buscarContent` com `X-Requested-With` (10 resultados para "breaking bad", incluindo a série Breaking Bad 2008 e El Camino 2019), página com `data-video-id` (filme 84504, série 3424), `playerData` (4 servidores: Byse, DoodStream, MixDrop, Streamtape — o embed é `url + id`), `episodesList` (BB 1x1..1x7 com URLs) e Streamtape (`#robotlink` com o `get_video` direto). Byse (verificação humana), DoodStream (captcha) e MixDrop (Cloudflare) não resolvem sem interação — só o Streamtape entra no provider. Teste de ponta a ponta em Node (TMDB simulado): A Queda 2 retornou 1 stream Dublado (Streamtape, .mp4 direto) e Breaking Bad 1x1 retornou 1 stream Dublado; o Legendado do filme deu 404 no Streamtape (vídeo apagado) e foi ignorado sem derrubar o Dublado; o BB 1x1 só tem dublado no site. NÃO validado da VM: o `get_video` do Streamtape dá 000 (token amarrado ao IP; o IP de saída da VM gira) — o teste final é no Nuvio.
- `framextv` (v1.9.0): app em inglês com API pública (`GET /api/stream?type=&id=&season=&episode=`) que devolve .m3u8 direto e assinado, 1080p. Validado ao vivo na VM: Fight Club (1 fonte, 1080p, áudio inglês+hindi, 159 legendas incluindo por/pt/pt-br) e Breaking Bad 1x1 (1 fonte, 1080p, 168 legendas incluindo português). O áudio é inglês e as legendas PT-BR não podem ser anexadas pelo formato do Nuvio — o Davi foi avisado e pediu para adicionar mesmo assim. Teste de ponta a ponta em Node: Fight Club retornou 4 streams (via proxy Cloudflare Worker para rivestream.app, 720p/480p medidos na playlist) e Breaking Bad 1x1 retornou 1 stream (1080p, hscow.com). **Davi confirmou 2026-11-08 que funciona perfeitamente no Nuvio.**
- `primeflix` (v2.0.0): Playerjs com `file` `/vvv?id=...` na página do título; o `/vvv` redireciona para o .m3u8 real. Validado ao vivo na VM: Noite Brutal (filme, `/vvv` 200, .m3u8 1080p dual) e Breaking Bad 1x1 (`/vvv` 200, .m3u8 `_dub_`; no navegador o episódio tocou com dublagem em pt-BR). O Bom Bandido está com o vídeo removido — o `/vvv` dá 404 até no navegador real, e o provider devolve `[]` para ele. Teste de ponta a ponta em Node (TMDB simulado): Noite Brutal retornou 1 stream Dublado 1080p, Breaking Bad 1x1 retornou 1 stream Dublado (720p — o nome do arquivo não traz a qualidade, então é o fallback), e O Bom Bandido retornou `[]`, em ~2–3s cada. O teste final é no Nuvio, no aparelho.
- `venoplay` (v2.1.0): player Dublado via mgeb.lat (embed com o ID do TMDB direto, sem busca). Validado ao vivo na VM: Breaking Bad 1x1 (Opção 1 = mgeb.space .m3u8, master 480p/360p/240p, token válido ~6 dias) e Franklin e Bash 1x1 (Opção 1 = uqload .m3u8, 480p, token 4h); no navegador os dois episódios tocaram no VenoPlay sem login nem captcha. O Legendado (nhdapi.com) nunca carregou (erro de certificado) e não entra no provider. Teste de ponta a ponta em Node: Breaking Bad 1x1 retornou 1 stream Dublado 480p, Franklin e Bash 1x1 retornou 1 stream Dublado 480p, e A Origem retornou `[]` (só tem MP4 com credencial embutida, descartado). O teste final é no Nuvio, no aparelho.
- `kairou` (v1.8.0): port mais simples do repo — o site expõe `GET /api/extract` sem login (TMDB id + título) e devolve streams prontos via `/api/proxy`. Validado ao vivo na VM: Breaking Bad 1x1 (4 streams; kingvod 1080p dublado com playlist real via proxy, zunder dublado com master 1080p via proxy), Inception (4 streams) e Fight Club (2 streams no extract completo — o `fast=1` devolveu 0 para ele, por isso o provider usa o extract completo). O `status` 504 de alguns streams é só a sonda do Kairou demorando — as playlists foram verificadas. Teste de ponta a ponta em Node (TMDB simulado): Inception retornou 4 streams (3 dublados + 1 legendado, 1080p) e Breaking Bad 1x1 retornou 3 (2 dublados + 1 legendado, 1080p), em ~5s cada.
- `pobreflixtvfree` (v1.7.0): outro domínio do Pobreflix (pobreflixtvfree.click), validado ao vivo na VM até o passo anterior ao vídeo: busca `/buscar?q=` (cards com título + tipo, sem ano), página do filme e do episódio (botões `data-url` plenoflu + vidsrc-embed.ru), Plenoflu filme (`data-id dyn:movie:36055:<servidor>` + POST `/api getPlayer` com URL em base64) e série (`DIRECT_EPISODE_ID` 58249 + POST `/api getOptions` com 4 opções e type 1/2), vaiquecol filme e série (FirePlayer ID único de 32 hex na página + POST `getVideo` devolvendo `securedLink` .m3u8 com md5+expires, válido por 2h) e vidsrc.sh (vs_src.php 200 com URL stellar; metaApi 200 com host do pool). Teste de ponta a ponta em Node (TMDB simulado): filme e Breaking Bad 1x1 retornaram 1 stream Dublado cada (vaiquecol, .m3u8 com qualidade 480p medida na playlist master — o site diz HD, mas os dois títulos testados trazem até 480p). NÃO validado da VM: o `stream_urls` do VidSrc dá 403 (apiToken amarrado à faixa de IP). **Davi confirmou 2026-11-08 que funciona perfeitamente no Nuvio** — inclusive o legendado, que só podia ser validado no aparelho. O canal vidsrc-embed.ru do site não responde da VM (timeout); o provider só o usa como fallback se o Plenoflu não render nada.
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
