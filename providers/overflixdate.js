// OverflixDate — provider do Nuvio.
//
// Site: https://www.overflix.date/ (PT-BR, Invision Community + app "videobox").
// NÃO confundir com o provider `overflix` do repo, que usa overflix.me
// (FSHD) — o overflix.date é um site diferente, com catálogo e players
// próprios.
//
// Front-end (igual ao pobreflixtv.golf, mesmo CMS):
//   Busca: GET /index.php?app=videobox&module=video&controller=index&do=buscarContent&q=<título>
//     com header X-Requested-With -> {html: "..."} com os resultados
//     (link, <h3> título, <p> ano). O id do conteúdo está no fim da URL
//     (/filmes/online/<slug>-<id>/ ou /series/online/<slug>-<id>/).
//   Série: GET ...&do=episodesList&id=<seriesId>&season=<s>&audio=Dublado
//     -> {episodes: [{number, title, url}]}; a página do episódio traz
//     <div id="view" data-video-id="<id>">.
//   Player: GET /index.php?app=videobox&module=video&controller=view&do=playerData&id=<id>
//     com X-Requested-With -> {players, servers_dub, servers_leg} —
//     servers_* são query strings "byse=...&doodstream=...&mixdrop=...&streamtape=...".
//
// Servidores: só o Byse é resolvido. MixDrop dá 403 no .mp4 direto,
// Streamtape não conecta da VM, DoodStream tem Turnstile no embed.
//
// Byse (https://bysebuho.com) — cadeia completa com fetch puro:
//   1. POST /api/videos/<code>/embed/captcha {} -> {pow_nonce, pow_difficulty, pow_token}
//   2. PoW: achar solution (string numérica) tal que o hash ARX próprio
//      do site de "<pow_nonce>:<solution>" tenha >= dificuldade bits
//      zero à esquerda. ATENÇÃO: apesar do nome no JSON
//      ("sha256-leading-zero-bits"), o hash NÃO é SHA-256 — é a função
//      ARX do bundle pow-DEJGtdh2.js do site, portada abaixo em JS puro
//      (dificuldade 16 ≈ 65 mil tentativas, ~1,3 s no Node).
//   3. POST /api/videos/<code>/embed/captcha/verify {pow_token, solution} -> {token}
//   4. POST /api/videos/<code>/embed/playback {fingerprint: {token: "x", viewer_id: "",
//      device_id: "", confidence: 0}} com header X-Captcha-Token -> {playback:
//      {algorithm: "AES-256-GCM", iv, payload, key_parts[30], version, expires_at}}
//      Sem token dá 428; sem fingerprint dá 405. O fingerprint falso é
//      aceito (testado) — a attestation real é impossível no sandbox.
//   5. AES-256-GCM em JS puro (o sandbox NÃO tem crypto.subtle e o
//      crypto-js NÃO inclui o modo GCM): chave =
//      base64url(key_parts[n-1]) + base64url(key_parts[31-n-1]), com
//      n = parseInt(version). Dos 30 key_parts, 28 são iscas de 24 bytes
//      e só 2 têm 16 bytes — o par da version é a chave. O JSON
//      descriptografado traz sources[0] = {quality, label, url, height}.
//      Qualidade: o label ("1080p"/"720p") quando existe; senão o
//      código ("x"/"h"/"n"/"l"); "Original" ("o") não tem resolução
//      declarada — o provider mede o master.m3u8.
//   A URL expira em 15 min — tudo é resolvido dentro do getStreams,
//   nunca cacheado.
//
// Limitações conhecidas:
//   - O stream HLS tem uma única faixa de áudio muxada, sem tag de
//     idioma: o áudio PT não é provado pelo arquivo — só o teste no
//     celular confirma (o título está em servers_dub e o Clube da Luta
//     é DUAL, então PT é o esperado).
//   - O PoW é pesado para o sandbox (mesma carga do navegador); se o
//     aparelho for lento, o captcha pode estourar o limite de 20 s e o
//     áudio volta vazio.
//   - Precisa da chave do TMDB (só para buscar o título em PT-BR).

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://www.overflix.date';
const BYSE_HOST = 'https://bysebuho.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const XRW = { 'X-Requested-With': 'XMLHttpRequest' };
const POW_TIMEOUT_MS = 20000;

async function fetchText(url, options) {
  const res = await fetch(url, options || {});
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return res.text();
}

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

// TMDB -> título em PT-BR, título original e ano.
async function getTmdbInfo(tmdbId, mediaType) {
  const key = readApiKey();
  const kind = mediaType === 'tv' ? 'tv' : 'movie';
  const url =
    TMDB_API_URL + '/' + kind + '/' + tmdbId +
    '?api_key=' + encodeURIComponent(key) + '&language=pt-BR';
  const data = await fetchJson(url);
  if (!data) throw new Error('TMDB não retornou dados para ' + kind + ' ' + tmdbId);
  const title = mediaType === 'tv' ? data.name : data.title;
  const originalTitle = mediaType === 'tv' ? data.original_name : data.original_title;
  const date = mediaType === 'tv' ? data.first_air_date : data.release_date;
  if (!title) throw new Error('TMDB não retornou título para ' + kind + ' ' + tmdbId);
  return {
    title: String(title).trim(),
    originalTitle: originalTitle ? String(originalTitle).trim() : '',
    year: date ? parseInt(String(date).slice(0, 4), 10) || null : null,
  };
}

function normalizeTitle(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Similaridade por tokens (Dice): 100 = títulos iguais.
function titleScore(a, b) {
  const ta = normalizeTitle(a).split(' ').filter(Boolean);
  const tb = normalizeTitle(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const common = ta.filter((t) => setB.has(t)).length;
  return Math.round((2 * common) / (ta.length + tb.length) * 100);
}

// Busca do site: GET buscarContent?q= -> [{url, title, year, type}].
async function searchSite(query) {
  const url =
    MAIN_URL + '/index.php?app=videobox&module=video&controller=index&do=buscarContent' +
    '&q=' + encodeURIComponent(query);
  const data = await fetchJson(url, {
    headers: { 'User-Agent': UA, Referer: MAIN_URL + '/buscar/', ...XRW },
  });
  const $ = cheerio.load((data && data.html) || '');
  const out = [];
  $('a[href*="/online/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const title = $(el).find('h3').first().text().trim();
    const yearText = ($(el).find('.info p').first().text() || '').trim();
    const year = parseInt(yearText, 10) || null;
    const type = href.includes('/filmes/online/')
      ? 'movie'
      : href.includes('/series/online/')
        ? 'tv'
        : null;
    if (title && href) out.push({ url: href, title, year, type });
  });
  return out;
}

function matchResult(results, title, originalTitle, year, mediaType) {
  let best = null;
  let bestScore = 0;
  for (const r of results) {
    if (r.type && r.type !== mediaType) continue;
    const score = Math.max(
      titleScore(r.title, title),
      originalTitle ? titleScore(r.title, originalTitle) : 0
    );
    if (score < 60) continue;
    const s = score + (r.year && year && r.year === year ? 15 : 0);
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

// Página do filme/episódio/série -> data-video-id.
// Filme e episódio trazem <div id="view" data-video-id="...">; a página
// da série não tem #view — o id está em <section class="vbEpisodes"
// data-video-id="..."> (o fallback pega o primeiro [data-video-id]).
async function getVideoId(pageUrl) {
  const html = await fetchText(pageUrl, {
    headers: { 'User-Agent': UA, Referer: MAIN_URL + '/' },
  });
  const $ = cheerio.load(html);
  return (
    $('#view').attr('data-video-id') ||
    $('[data-video-id]').first().attr('data-video-id') ||
    null
  );
}

// Série -> URL da página do episódio (tenta Dublado, depois Legendado).
async function getEpisodeUrl(seriesVideoId, season, episode) {
  for (const audio of ['Dublado', 'Legendado']) {
    const url =
      MAIN_URL + '/index.php?app=videobox&module=video&controller=view&do=episodesList' +
      '&id=' + encodeURIComponent(seriesVideoId) +
      '&season=' + season + '&audio=' + encodeURIComponent(audio);
    const data = await fetchJson(url, {
      headers: { 'User-Agent': UA, Referer: MAIN_URL + '/', ...XRW, Accept: 'application/json' },
    });
    const eps = (data && data.episodes) || [];
    const ep = eps.find((e) => Number(e.number) === Number(episode));
    if (ep && ep.url) return ep.url;
  }
  return null;
}

// playerData -> {players, servers_dub, servers_leg}.
async function getPlayerData(videoId) {
  const url =
    MAIN_URL + '/index.php?app=videobox&module=video&controller=view&do=playerData' +
    '&id=' + encodeURIComponent(videoId);
  return fetchJson(url, {
    headers: { 'User-Agent': UA, Referer: MAIN_URL + '/', ...XRW },
  });
}

// "byse=...&doodstream=...&mixdrop=...&streamtape=..." -> {byse, doodstream, mixdrop, streamtape}.
function parseServers(qs) {
  const out = {};
  if (!qs) return out;
  const clean = String(qs).replace(/&amp;/g, '&');
  for (const pair of clean.split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const k = decodeURIComponent(pair.slice(0, eq));
    const v = decodeURIComponent(pair.slice(eq + 1));
    if (k && v) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Utilidades em JS puro (o sandbox não tem Buffer, atob, TextDecoder nem
// crypto.subtle — nada aqui depende deles).
// ---------------------------------------------------------------------------

const B64_ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64urlDecode(s) {
  let c = String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
  while (c.length % 4) c += '=';
  const out = [];
  for (let i = 0; i < c.length; i += 4) {
    const a = B64_ALPH.indexOf(c[i]);
    const b = B64_ALPH.indexOf(c[i + 1]);
    const cc = c[i + 2] === '=' ? 0 : B64_ALPH.indexOf(c[i + 2]);
    const d = c[i + 3] === '=' ? 0 : B64_ALPH.indexOf(c[i + 3]);
    out.push((a << 2) | (b >> 4));
    if (c[i + 2] !== '=') out.push(((b & 15) << 4) | (cc >> 2));
    if (c[i + 3] !== '=') out.push(((cc & 3) << 6) | d);
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      );
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const c = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
      i += 4;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// AES-256-GCM em JS puro (só é preciso cifrar blocos: o modo CTR do GCM e
// o GHASH usam a cifragem; a tag é verificada antes de devolver o texto).
// Validado contra node:crypto e contra o vetor NIST AES-256-GCM caso 3.
// ---------------------------------------------------------------------------

function gfMul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function gfInv(a) {
  if (a === 0) return 0;
  let r = 1;
  for (let i = 0; i < 254; i++) r = gfMul(r, a);
  return r;
}

// S-box gerada em tempo de execução (inverso em GF(2^8) + transformação afim),
// para não embutir a tabela de 256 bytes no arquivo.
const AES_SBOX = new Uint8Array(256);
for (let x = 0; x < 256; x++) {
  const inv = gfInv(x);
  const rot = (v, n) => ((v << n) | (v >>> (8 - n))) & 0xff;
  AES_SBOX[x] = (inv ^ rot(inv, 1) ^ rot(inv, 2) ^ rot(inv, 3) ^ rot(inv, 4) ^ 0x63) & 0xff;
}
const AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];

function aesExpandKey256(key) {
  const w = new Uint32Array(60);
  for (let i = 0; i < 8; i++) {
    w[i] = (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
  }
  for (let i = 8; i < 60; i++) {
    let t = w[i - 1];
    if (i % 8 === 0) {
      t = (AES_SBOX[(t >>> 16) & 0xff] << 24) | (AES_SBOX[(t >>> 8) & 0xff] << 16) |
        (AES_SBOX[t & 0xff] << 8) | AES_SBOX[(t >>> 24) & 0xff];
      t ^= AES_RCON[i / 8 - 1] << 24;
    } else if (i % 8 === 4) {
      t = (AES_SBOX[(t >>> 24) & 0xff] << 24) | (AES_SBOX[(t >>> 16) & 0xff] << 16) |
        (AES_SBOX[(t >>> 8) & 0xff] << 8) | AES_SBOX[t & 0xff];
    }
    w[i] = (w[i - 8] ^ t) >>> 0;
  }
  return w;
}

function aesEncryptBlock(key, input) {
  const w = aesExpandKey256(key);
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    s[i] = input[i] ^ ((w[i >> 2] >>> (24 - (i & 3) * 8)) & 0xff);
  }
  for (let round = 1; round < 14; round++) {
    for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
    let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
    for (let c = 0; c < 4; c++) {
      const o = c * 4;
      const a0 = s[o], a1 = s[o + 1], a2 = s[o + 2], a3 = s[o + 3];
      s[o] = gfMul(a0, 2) ^ gfMul(a1, 3) ^ a2 ^ a3;
      s[o + 1] = a0 ^ gfMul(a1, 2) ^ gfMul(a2, 3) ^ a3;
      s[o + 2] = a0 ^ a1 ^ gfMul(a2, 2) ^ gfMul(a3, 3);
      s[o + 3] = gfMul(a0, 3) ^ a1 ^ a2 ^ gfMul(a3, 2);
    }
    for (let i = 0; i < 16; i++) {
      s[i] ^= (w[round * 4 + (i >> 2)] >>> (24 - (i & 3) * 8)) & 0xff;
    }
  }
  for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
  let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
  t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
  t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
  for (let i = 0; i < 16; i++) {
    s[i] ^= (w[56 + (i >> 2)] >>> (24 - (i & 3) * 8)) & 0xff;
  }
  return s;
}

// Multiplicação em GF(2^128) na convenção do GCM.
function gf128Mul(X, Y) {
  const Z = new Uint8Array(16);
  const V = Y.slice();
  for (let i = 0; i < 128; i++) {
    if (X[i >> 3] & (0x80 >> (i & 7))) {
      for (let j = 0; j < 16; j++) Z[j] ^= V[j];
    }
    const lsb = V[15] & 1;
    for (let j = 15; j > 0; j--) V[j] = (V[j] >> 1) | ((V[j - 1] & 1) << 7);
    V[0] >>= 1;
    if (lsb) V[0] ^= 0xe1;
  }
  return Z;
}

function ghash(H, data) {
  let Y = new Uint8Array(16);
  for (let off = 0; off < data.length; off += 16) {
    for (let i = 0; i < 16; i++) Y[i] ^= data[off + i];
    Y = gf128Mul(Y, H);
  }
  return Y;
}

// Decifra AES-256-GCM com IV de 12 bytes, sem AAD e tag de 16 bytes no
// fim do payload. Devolve o texto claro (Uint8Array) ou lança erro se
// a tag não conferir.
function aesGcmDecrypt(key, iv, ctWithTag) {
  if (key.length !== 32) throw new Error('chave GCM deve ter 32 bytes');
  if (iv.length !== 12) throw new Error('IV GCM deve ter 12 bytes');
  if (ctWithTag.length < 16) throw new Error('payload GCM curto demais');
  const H = aesEncryptBlock(key, new Uint8Array(16));
  const ct = ctWithTag.subarray(0, ctWithTag.length - 16);
  const tag = ctWithTag.subarray(ctWithTag.length - 16);
  const J0 = new Uint8Array(16);
  J0.set(iv.subarray(0, 12));
  J0[15] = 1;
  const nBlocks = Math.ceil(ct.length / 16);
  const ghashInput = new Uint8Array(nBlocks * 16 + 16);
  ghashInput.set(ct);
  let bits = ct.length * 8;
  for (let i = 15; i >= 8; i--) {
    ghashInput[nBlocks * 16 + i] = bits & 0xff;
    bits = Math.floor(bits / 256);
  }
  const S = ghash(H, ghashInput);
  const EJ0 = aesEncryptBlock(key, J0);
  let bad = 0;
  for (let i = 0; i < 16; i++) bad |= (S[i] ^ EJ0[i]) ^ tag[i];
  if (bad !== 0) throw new Error('tag GCM inválida');
  const out = new Uint8Array(ct.length);
  for (let b = 0; b < nBlocks; b++) {
    const ctr = J0.slice();
    const counter = b + 2;
    ctr[12] = (counter >>> 24) & 0xff;
    ctr[13] = (counter >>> 16) & 0xff;
    ctr[14] = (counter >>> 8) & 0xff;
    ctr[15] = counter & 0xff;
    const ks = aesEncryptBlock(key, ctr);
    const off = b * 16;
    const n = Math.min(16, ct.length - off);
    for (let i = 0; i < n; i++) out[off + i] = ct[off + i] ^ ks[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// PoW do Byse — hash ARX próprio do site (bundle pow-DEJGtdh2.js).
// NÃO é SHA-256, apesar do campo "algorithm" do captcha dizer isso.
// ---------------------------------------------------------------------------

const POW_SIZE = 512;
const POW_MASK = POW_SIZE - 1;
const POW_ROUNDS = 2;
const POW_MUL_A = 2654435761;
const POW_MUL_B = 2246822519;

// Buffers reutilizados entre as tentativas: o PoW precisa de ~65 mil
// hashes e cada hash alocava 3 typed arrays + 1 string + 1 Uint8Array —
// num motor JS lento (o sandbox do Nuvio não é o V8 do Node) o GC
// domina o tempo. Nada aqui é reentrante: o PoW roda sequencial.
const POW_ST = new Uint32Array(4);
const POW_BUF = new Uint32Array(POW_SIZE);
const POW_OUT = new Uint32Array(8);
const POW_INPUT = new Uint8Array(64);
const POW_DIGITS = new Uint8Array(10);

function powRotl(v, n) {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function powMul(v, m) {
  return Math.imul(v, m) >>> 0;
}

function powRound(st) {
  st[0] = (st[0] + st[1]) >>> 0;
  st[3] = powRotl(st[3] ^ st[0], 16);
  st[2] = (st[2] + st[3]) >>> 0;
  st[1] = powRotl(st[1] ^ st[2], 12);
  st[0] = (st[0] + st[1]) >>> 0;
  st[3] = powRotl(st[3] ^ st[0], 8);
  st[2] = (st[2] + st[3]) >>> 0;
  st[1] = powRotl(st[1] ^ st[2], 7);
}

// Hash de `input[0..len]`. Devolve POW_OUT (reutilizado — ler antes da
// próxima chamada).
function powHash(input, len) {
  const st = POW_ST;
  const buf = POW_BUF;
  const out = POW_OUT;
  st[0] = 1779033703;
  st[1] = 3144134277;
  st[2] = 1013904242;
  st[3] = 2773480762;
  for (let i = 0; i < len; i++) {
    st[0] = (st[0] + input[i]) >>> 0;
    st[0] = powRotl(st[0], 7);
    powRound(st);
  }
  for (let i = 0; i < 8; i++) powRound(st);
  for (let i = 0; i < POW_SIZE; i++) {
    powRound(st);
    buf[i] = (st[0] ^ st[2]) >>> 0;
  }
  for (let r = 0; r < POW_ROUNDS; r++) {
    for (let s = 0; s < POW_SIZE; s++) {
      const a = buf[s] & POW_MASK;
      let c = (buf[s] + buf[a]) >>> 0;
      c = powRotl(c, 13);
      c = (c ^ powMul(buf[(s + 1) & POW_MASK], POW_MUL_A)) >>> 0;
      buf[s] = c;
      st[0] = (st[0] ^ c) >>> 0;
      powRound(st);
    }
  }
  const chunk = POW_SIZE / 8;
  for (let i = 0; i < 8; i++) {
    powRound(st);
    let s = st[0];
    const base = i * chunk;
    for (let c = 0; c < chunk; c++) {
      const d = buf[base + c];
      s = (s + d) >>> 0;
      s = powRotl(s, 5);
      s = (s ^ powMul(d, POW_MUL_B)) >>> 0;
    }
    out[i] = (s ^ st[2]) >>> 0;
  }
  return out;
}

function powLeadingZeros(words) {
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 0) {
      n += 32;
      continue;
    }
    return n + Math.clz32(w);
  }
  return n;
}

const HAS_TIMER = typeof setTimeout === 'function';

// Acha a solution (string numérica) ou null se estourar o tempo.
// Cede o controle a cada 1024 tentativas quando há setTimeout; sem ele,
// roda direto até o limite (o sandbox é single-thread mesmo).
async function powSolve(nonce, difficulty, timeoutMs) {
  if (difficulty <= 0) return '0';
  const prefix = nonce + ':';
  const prefixLen = prefix.length;
  for (let i = 0; i < prefixLen; i++) POW_INPUT[i] = prefix.charCodeAt(i) & 255;
  const start = Date.now();
  let s = 0;
  for (;;) {
    for (let c = 0; c < 1024; c++) {
      // Escreve os dígitos decimais de s no fim do buffer, sem alocar.
      let tmp = s;
      let ndig = 0;
      if (tmp === 0) {
        POW_DIGITS[0] = 48;
        ndig = 1;
      } else {
        while (tmp > 0) {
          POW_DIGITS[ndig++] = 48 + (tmp % 10);
          tmp = Math.floor(tmp / 10);
        }
      }
      for (let i = 0; i < ndig; i++) POW_INPUT[prefixLen + i] = POW_DIGITS[ndig - 1 - i];
      if (powLeadingZeros(powHash(POW_INPUT, prefixLen + ndig)) >= difficulty) return String(s);
      s++;
    }
    if (Date.now() - start > timeoutMs) return null;
    if (HAS_TIMER) await new Promise((r) => setTimeout(r, 0));
  }
}

// ---------------------------------------------------------------------------
// Byse: captcha -> PoW -> verify -> playback -> GCM decrypt.
// Devolve {label, url} ou null.
// ---------------------------------------------------------------------------

async function byseJson(method, url, body, extraHeaders) {
  const res = await fetch(url, {
    method,
    headers: Object.assign(
      { 'User-Agent': UA, 'Content-Type': 'application/json' },
      extraHeaders || {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return res.json();
}

async function resolveByse(code) {
  const embedUrl = BYSE_HOST + '/e/' + code;
  const cap = await byseJson(
    'POST',
    BYSE_HOST + '/api/videos/' + code + '/embed/captcha',
    {},
    { Referer: embedUrl }
  );
  if (!cap || !cap.pow_nonce || !cap.pow_token) return null;
  const difficulty = parseInt(cap.pow_difficulty, 10) || 16;
  const solution = await powSolve(cap.pow_nonce, difficulty, POW_TIMEOUT_MS);
  if (solution === null) return null;
  const ver = await byseJson(
    'POST',
    BYSE_HOST + '/api/videos/' + code + '/embed/captcha/verify',
    { pow_token: cap.pow_token, solution },
    { Referer: embedUrl }
  );
  if (!ver || ver.status !== 'ok' || !ver.token) return null;
  const pb = await byseJson(
    'POST',
    BYSE_HOST + '/api/videos/' + code + '/embed/playback',
    { fingerprint: { token: 'x', viewer_id: '', device_id: '', confidence: 0 } },
    { Referer: embedUrl, 'X-Captcha-Token': ver.token }
  );
  const p = pb && pb.playback;
  if (!p || !p.key_parts || !p.payload || !p.iv || p.version === undefined) return null;
  const n = parseInt(p.version, 10);
  if (!n || n < 1 || n > 30) return null;
  const key = new Uint8Array(32);
  const partA = b64urlDecode(p.key_parts[n - 1]);
  const partB = b64urlDecode(p.key_parts[31 - n - 1]);
  if (partA.length !== 16 || partB.length !== 16) return null;
  key.set(partA, 0);
  key.set(partB, 16);
  const plain = utf8Decode(aesGcmDecrypt(key, b64urlDecode(p.iv), b64urlDecode(p.payload)));
  let data = null;
  try {
    data = JSON.parse(plain);
  } catch (_) {
    return null;
  }
  const src = data && data.sources && data.sources[0];
  if (!src || !src.url) return null;
  return { label: src.label || '', quality: src.quality || '', url: src.url, height: src.height || 0 };
}

// Códigos de qualidade do Byse/Filemoon (mesmos do overflix.js):
// "x" = 1080p, "h" = 720p, "n" = 480p, "l" = 360p, "o" = Original
// (resolução cheia do arquivo, sem rótulo — precisa medir).
const BYSE_QUALITY = { x: '1080p', h: '720p', n: '480p', l: '360p' };

function qualityFromHeight(h) {
  if (h >= 2000) return '4K';
  if (h >= 1000) return '1080p';
  if (h >= 700) return '720p';
  if (h >= 470) return '480p';
  if (h >= 350) return '360p';
  return h > 0 ? h + 'p' : '';
}

// Mede a resolução real no master.m3u8 (só usado quando o rótulo não
// diz a resolução, ex. label "Original"). A altura efetiva leva em
// conta a largura, para não rebaixar vídeo 1920x800 (cinemascope) para 720p.
async function probeMasterQuality(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return '';
    const text = await res.text();
    let best = 0;
    const re = /RESOLUTION=(\d+)x(\d+)/gi;
    let m;
    while ((m = re.exec(text))) {
      const w = parseInt(m[1], 10);
      const h = parseInt(m[2], 10);
      best = Math.max(best, h, Math.round((w * 9) / 16));
    }
    return qualityFromHeight(best);
  } catch (_) {
    return '';
  }
}

// Resolve a qualidade do stream: rótulo ("1080p") > código ("x") >
// altura declarada > medição no master > fallback 720p.
async function resolveQuality(src) {
  const m = String(src.label || '').match(/^(\d{3,4})p$/i);
  if (m) return m[1] + 'p';
  if (BYSE_QUALITY[src.quality]) return BYSE_QUALITY[src.quality];
  if (src.height) return qualityFromHeight(src.height);
  return (await probeMasterQuality(src.url)) || '720p';
}

// ---------------------------------------------------------------------------
// getStreams
// ---------------------------------------------------------------------------

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const isTv = mediaType === 'tv';
    const s = Number(season) || 1;
    const e = Number(episode) || 1;

    const info = await getTmdbInfo(tmdbId, mediaType);

    let results = await searchSite(info.title);
    let match = matchResult(results, info.title, info.originalTitle, info.year, mediaType);
    if (!match && info.originalTitle && info.originalTitle !== info.title) {
      results = await searchSite(info.originalTitle);
      match = matchResult(results, info.title, info.originalTitle, info.year, mediaType);
    }
    if (!match) return [];

    let videoId = await getVideoId(match.url);
    if (!videoId) return [];

    if (isTv) {
      const epUrl = await getEpisodeUrl(videoId, s, e);
      if (!epUrl) return [];
      videoId = await getVideoId(epUrl);
      if (!videoId) return [];
    }

    const pd = await getPlayerData(videoId);
    if (!pd) return [];
    const dub = parseServers(pd.servers_dub);
    const leg = parseServers(pd.servers_leg);

    const out = [];
    for (const [label, servers] of [['Dublado', dub], ['Legendado', leg]]) {
      const code = servers.byse;
      if (!code) continue;
      let src = null;
      try {
        src = await resolveByse(code);
      } catch (_) {
        // Um áudio fora do ar (ex.: captcha recusado, vídeo apagado)
        // não pode derrubar o outro áudio.
        src = null;
      }
      if (!src) continue;
      out.push({
        name: 'OverflixDate',
        title: label,
        url: src.url,
        quality: await resolveQuality(src),
        headers: { 'User-Agent': UA },
      });
    }
    return out;
  } catch (error) {
    console.error('[OverflixDate] Erro:', error && error.message ? error.message : error);
    return [];
  }
}

module.exports = { getStreams };

// Exportado só para testes em Node (não usado pelo Nuvio).
module.exports._test = { titleScore, parseServers, b64urlDecode, aesGcmDecrypt, powSolve };
