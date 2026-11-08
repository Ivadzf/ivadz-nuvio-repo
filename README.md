# Ivadz Nuvio Repo

Repositório brasileiro para o Nuvio — fork combinado de vários repos, com 41 providers, todos em português.

## Providers incluídos (41)

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

### PT-BR — Droydr13/plugin-pt-fr, só os em português (10)
animezey, netcine, megaflix, pobreflix, topfilmes (só filmes), overflix, ultracine, animescloud, animesdigital, doramasonline.

### PT-BR — nathanael540/nuvio-fontes-ptbr-plugin (1)
cineagora — filmes e séries em HLS, dublado ou legendado. Precisa da chave do TMDB fornecida pelo app (configure em Settings > Integrations > TMDB Enrichment).

### Portado do CloudStream — lawlietbr/lietrepo (1)
goyabu — anime legendado/dublado, até 1080p (Blogger/Google Video). Reescrito em JS a partir da extensão Kotlin do Goyabu: busca o título via TMDB (precisa da chave do TMDB fornecida pelo app, como o cineagora), resolve o episódio no goyabu.io e extrai os links via API do Blogger. Só séries/anime (`tv`); temporadas além da 1ª são buscadas como "Título Nª temporada".

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

- `manifest.json` válido, 41 scrapers, ids únicos, todos os arquivos presentes, nenhum com `contentLanguage` francês.
- Teste de carregamento no Node (com `crypto-js` instalado, que o Nuvio já fornece no runtime): 39 de 40 exportam `getStreams`. Exceção: `redeflix` encerra o processo ao carregar no Node — comportamento que já existe no repo original do Saimuel, não foi a junção que quebrou. No Nuvio ele é um provider publicado; se falhar no app, desative-o no manifest (`"enabled": false`).
- `goyabu` (v1.2.0): port do CloudStream validado com dados reais — o fluxo do Blogger foi testado com um token real de episódio do site: `video.g` respondeu 200 com `f_sid`/`bl` reais e o `batchexecute` devolveu links `googlevideo.com/videoplayback` (o parser do provider extraiu 1 link limpo, itag 18, sem escapes sobrando). A busca e a lista de episódios no goyabu.io foram confirmadas no navegador (resultados `/anime/...`, episódios em `/41414`, `/41415`...); o HTML bruto não pôde ser lido daqui porque o site usa Cloudflare que bloqueia datacenter (HTTP 403), então o teste final do provider é no Nuvio, no aparelho. O passo do Blogger é o mais lento (~20s) — o primeiro carregamento pode demorar.

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
