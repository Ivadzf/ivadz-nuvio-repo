/** cineagora - gerado a partir de src/cineagora/ — não edite manualmente. */
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/_blocks/slugify/index.mjs
var COMBINING_MARKS = /[\u0300-\u036f]/g;
var NON_ALPHANUMERIC = /[^a-z0-9]+/g;
function normalizeText(text) {
  if (typeof text !== "string") {
    throw new Error(`normalizeText espera uma string, recebeu ${typeof text}`);
  }
  return text.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/&/g, " e ").replace(NON_ALPHANUMERIC, " ").trim();
}

// src/_blocks/stream-build/index.mjs
var UHD_HEIGHT = 2160;
var FOUR_K = "4K";
var FULL_HD = "1080p";
var CAM = "CAM";
var CAM_RANK = 0;
var HTTP_PROTOCOLS = ["http:", "https:"];
var QUALITY_TOKEN = /^(\d{3,4})p$/;
var KNOWN_HEIGHTS = ["144", "240", "360", "480", "540", "576", "720", "1080", "1440", "2160", "4320"];
var FULL_HD_SEQUENCE = /\bfull hd\b/g;
var QUALITY_LABEL_RULES = [
  [["4k", "uhd"], FOUR_K],
  [["fhd", "fullhd"], FULL_HD],
  [["cam", "ts", "hdcam", "telesync"], CAM],
  [["hd"], "720p"],
  [["sd"], "480p"]
];
var LANGUAGE_RULES = [
  [["dual", "multi"], "Dual \xC1udio"],
  [["leg", "legendado", "legenda", "sub", "subbed", "subtitled"], "Legendado"],
  [["dub", "dublado", "dubbed"], "Dublado"],
  [["pt", "ptbr", "br", "brasil", "portugues", "portuguese", "brazilian"], "Dublado"]
];
var MAGNET_PREFIX = /^magnet:/i;
var MAGNET_BTIH = /^magnet:\?(?:[^&]*&)*?xt=urn:btih:([^&]*)/i;
var HEX_HASH = /^[0-9a-f]{40}$/i;
var BASE32_HASH = /^[a-z2-7]{32}$/i;
var REQUIRED_FIELDS = ["url", "name", "title", "quality"];
var OPTIONAL_READERS = {
  size: readText,
  language: readLanguage,
  headers: readHeaders,
  subtitles: readSubtitles,
  infoHash: readInfoHash,
  provider: readText,
  type: readText,
  seeders: readCount,
  peers: readCount,
  behaviorHints: readBehaviorHints
};
var SUBTITLE_REQUIRED_FIELDS = ["url", "language"];
var SUBTITLE_OPTIONAL_READERS = { name: readText, headers: readHeaders };
var BEHAVIOR_HINT_READERS = { audioDelayMs: readFiniteNumber, audioDelayLanguage: readText };
function normalizeQuality(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 9999) {
    return heightToQuality(value);
  }
  if (typeof value === "string") {
    const quality = qualityFromWords(words(normalizeText(value).replace(FULL_HD_SEQUENCE, "fullhd")));
    if (quality) return quality;
  }
  throw new Error(`Qualidade n\xE3o reconhecida: ${describe(value)} (esperado 3\u20134 d\xEDgitos, ex.: "1080p", ou 4K, UHD, FHD, HD, SD, CAM)`);
}
function normalizeLanguage(value) {
  if (typeof value !== "string") {
    throw new Error(`Idioma deve ser texto (recebido: ${describe(value)})`);
  }
  return firstRuleMatch(words(normalizeText(value)), LANGUAGE_RULES);
}
function buildStream(fields) {
  if (!isPlainObject(fields)) {
    throw new Error(`stream deve ser objeto com os campos do stream (recebido: ${describe(fields)})`);
  }
  checkKeys(fields, REQUIRED_FIELDS.concat(Object.keys(OPTIONAL_READERS)), "stream");
  if (fields.quality === void 0) throw new Error("stream.quality \xE9 obrigat\xF3rio");
  const url = readText(fields.url, "stream.url");
  const isMagnet = MAGNET_PREFIX.test(url);
  const stream = {
    url: isMagnet ? url : readHttpUrl(url, "stream.url"),
    name: readText(fields.name, "stream.name"),
    title: readText(fields.title, "stream.title"),
    quality: normalizeQuality(fields.quality)
  };
  copyOptional(fields, stream, OPTIONAL_READERS, "stream");
  if (isMagnet) applyMagnet(stream);
  return stream;
}
function sortByQuality(streams) {
  if (!Array.isArray(streams)) {
    throw new Error(`streams deve ser array (recebido: ${describe(streams)})`);
  }
  return streams.map((stream, index) => ({ stream, index, rank: qualityRank(stream, `streams[${index}]`) })).sort((a, b) => b.rank - a.rank || a.index - b.index).map((entry) => entry.stream);
}
function applyMagnet(stream) {
  if (stream.headers !== void 0) {
    throw new Error("stream.headers n\xE3o se aplica a magnet: n\xE3o h\xE1 requisi\xE7\xE3o HTTP para receb\xEA-los");
  }
  const match = stream.url.match(MAGNET_BTIH);
  if (!match) {
    throw new Error(`stream.url magnet sem o par\xE2metro "xt=urn:btih:<hash>" (recebido: "${stream.url}")`);
  }
  const hash = readInfoHash(match[1], "hash do magnet em stream.url");
  if (stream.infoHash !== void 0 && stream.infoHash !== hash) {
    throw new Error(`stream.infoHash "${stream.infoHash}" diverge do hash do magnet "${hash}"`);
  }
  stream.infoHash = hash;
}
function qualityRank(stream, label) {
  if (!isPlainObject(stream)) throw new Error(`${label} deve ser objeto (recebido: ${describe(stream)})`);
  const { quality } = stream;
  if (quality === FOUR_K) return UHD_HEIGHT;
  if (quality === CAM) return CAM_RANK;
  const match = typeof quality === "string" && quality.match(QUALITY_TOKEN);
  if (!match) {
    throw new Error(`${label}.quality fora do formato normalizado (recebido: ${describe(quality)}; esperado "<n>p", "4K" ou "CAM")`);
  }
  return Number(match[1]);
}
function heightToQuality(height) {
  return height === UHD_HEIGHT ? FOUR_K : `${height}p`;
}
function copyOptional(source, target, readers, label) {
  for (const key of Object.keys(readers)) {
    if (source[key] !== void 0) target[key] = readers[key](source[key], `${label}.${key}`);
  }
  return target;
}
function checkKeys(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new Error(`${label}: campo desconhecido "${key}" (aceitos: ${allowed.join(", ")})`);
    }
  }
}
function readText(value, label) {
  if (value === void 0) throw new Error(`${label} \xE9 obrigat\xF3rio`);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} deve ser texto n\xE3o vazio (recebido: ${describe(value)})`);
  }
  return value.trim();
}
function readHttpUrl(value, label) {
  const text = readText(value, label);
  let protocol;
  try {
    protocol = new URL(text).protocol;
  } catch (error) {
    throw new Error(`${label} n\xE3o \xE9 URL v\xE1lida: "${text}" (${error.message})`, { cause: error });
  }
  if (!HTTP_PROTOCOLS.includes(protocol)) {
    throw new Error(`${label} deve ser URL http(s) (recebido: "${text}")`);
  }
  return text;
}
function readLanguage(value, label) {
  const text = readText(value, label);
  return normalizeLanguage(text) || text;
}
function readInfoHash(value, label) {
  const text = readText(value, label);
  if (HEX_HASH.test(text)) return text.toLowerCase();
  if (BASE32_HASH.test(text)) {
    throw new Error(`${label} est\xE1 em base32 ("${text}"): o provedor deve convert\xEA-lo para hexadecimal de 40 caracteres; o app falha ao iniciar o P2P com base32`);
  }
  throw new Error(`${label} deve ser hexadecimal de 40 caracteres (recebido: "${text}")`);
}
function readHeaders(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe(value)})`);
  const headers = {};
  for (const name of Object.keys(value)) headers[name] = readText(value[name], `${label}.${name}`);
  return headers;
}
function readSubtitles(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser array (recebido: ${describe(value)})`);
  return value.map((item, index) => readSubtitle(item, `${label}[${index}]`));
}
function readSubtitle(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe(value)})`);
  checkKeys(value, SUBTITLE_REQUIRED_FIELDS.concat(Object.keys(SUBTITLE_OPTIONAL_READERS)), label);
  const subtitle = {
    url: readHttpUrl(value.url, `${label}.url`),
    language: readText(value.language, `${label}.language`)
  };
  return copyOptional(value, subtitle, SUBTITLE_OPTIONAL_READERS, label);
}
function readBehaviorHints(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe(value)})`);
  checkKeys(value, Object.keys(BEHAVIOR_HINT_READERS), label);
  return copyOptional(value, {}, BEHAVIOR_HINT_READERS, label);
}
function readCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser inteiro maior ou igual a zero (recebido: ${describe(value)})`);
  }
  return value;
}
function readFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser n\xFAmero (recebido: ${describe(value)})`);
  }
  return value;
}
function qualityFromWords(tokens) {
  const withP = tokens.map((token) => token.match(QUALITY_TOKEN)).find(Boolean);
  if (withP) return heightToQuality(Number(withP[1]));
  const height = tokens.find((token) => KNOWN_HEIGHTS.includes(token));
  if (height) return heightToQuality(Number(height));
  return firstRuleMatch(tokens, QUALITY_LABEL_RULES);
}
function firstRuleMatch(tokens, rules) {
  const rule = rules.find(([labels]) => labels.some((label) => tokens.includes(label)));
  return rule ? rule[1] : null;
}
function words(normalized) {
  return normalized === "" ? [] : normalized.split(" ");
}
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function describe(value) {
  return typeof value === "string" ? `"${value}"` : String(value);
}

// src/_blocks/http/index.mjs
var DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var ACCEPT_LANGUAGE = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7";
var BASE_HEADERS = Object.freeze({ "User-Agent": DEFAULT_USER_AGENT, "Accept-Language": ACCEPT_LANGUAGE });
var JSON_CONTENT_TYPE = "application/json";
var FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8";
var METHODS = ["GET", "POST"];
var HEADER_PROFILES = Object.freeze({
  page: Object.freeze(__spreadProps(__spreadValues({}, BASE_HEADERS), { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" })),
  api: Object.freeze(__spreadProps(__spreadValues({}, BASE_HEADERS), { Accept: "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest" })),
  player: Object.freeze(__spreadProps(__spreadValues({}, BASE_HEADERS), { Accept: "*/*" }))
});
function fetchJson(url, options) {
  return __async(this, null, function* () {
    const response = yield request(url, options);
    const text = yield response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Resposta n\xE3o \xE9 JSON v\xE1lido em ${url}: ${error.message}`, { cause: error });
    }
  });
}
function fetchPage(url, options) {
  return __async(this, null, function* () {
    const response = yield request(url, options);
    if (typeof response.url !== "string" || response.url === "") {
      throw new Error(`Resposta sem URL final (response.url) em ${url}`);
    }
    return { url: response.url, text: yield response.text() };
  });
}
function playbackHeaders(pageUrl, options = {}) {
  const userAgent = options.userAgent === void 0 ? DEFAULT_USER_AGENT : options.userAgent;
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    throw new Error(`userAgent inv\xE1lido: "${options.userAgent}" (esperado texto n\xE3o vazio)`);
  }
  return { "User-Agent": userAgent, Referer: pageUrl, Origin: httpOrigin(pageUrl) };
}
function httpOrigin(pageUrl) {
  const invalid = new Error(`pageUrl inv\xE1lida: "${pageUrl}" (esperada URL http ou https)`);
  if (typeof pageUrl !== "string") throw invalid;
  let parsed;
  try {
    parsed = new URL(pageUrl);
  } catch (e) {
    throw invalid;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw invalid;
  return parsed.origin;
}
function request(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const method = options.method === void 0 ? "GET" : options.method;
    const profile = options.profile === void 0 ? "page" : options.profile;
    const hasJson = options.json !== void 0;
    const hasForm = options.form !== void 0;
    if (!METHODS.includes(method)) {
      throw new Error(`method inv\xE1lido: "${method}" (esperado "GET" ou "POST")`);
    }
    if (!Object.prototype.hasOwnProperty.call(HEADER_PROFILES, profile)) {
      throw new Error(`profile inv\xE1lido: "${profile}" (esperado "page", "api" ou "player")`);
    }
    if (hasJson && hasForm) {
      throw new Error("Use json ou form, n\xE3o os dois na mesma requisi\xE7\xE3o");
    }
    if ((hasJson || hasForm) && method === "GET") {
      throw new Error('json e form exigem method "POST"');
    }
    const headers = __spreadValues(__spreadValues({}, HEADER_PROFILES[profile]), options.headers);
    const init = { method, headers };
    if (hasJson) {
      init.body = JSON.stringify(options.json);
      setDefaultContentType(headers, JSON_CONTENT_TYPE);
    }
    if (hasForm) {
      init.body = new URLSearchParams(options.form).toString();
      setDefaultContentType(headers, FORM_CONTENT_TYPE);
    }
    const response = yield fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} em ${url}`);
    }
    return response;
  });
}
function setDefaultContentType(headers, contentType2) {
  const defined = Object.keys(headers).some((name) => name.toLowerCase() === "content-type");
  if (!defined) headers["Content-Type"] = contentType2;
}

// src/_blocks/title-match/index.mjs
var DEFAULT_MIN_SCORE = 0.85;
var DEFAULT_YEAR_TOLERANCE = 1;
var FOUR_DIGIT_YEAR = /^\d{4}$/;
function titleSimilarity(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    throw new Error(`titleSimilarity espera duas strings, recebeu ${typeof a} e ${typeof b}`);
  }
  const plainA = a.trim().toLowerCase();
  if (plainA !== "" && plainA === b.trim().toLowerCase()) return 1;
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  if (normalizedA === "" || normalizedB === "") return 0;
  if (normalizedA === normalizedB) return 1;
  return diceCoefficient(normalizedA.split(" ").join(""), normalizedB.split(" ").join(""));
}
function findBestMatch(candidates, media, options = {}) {
  const { minScore = DEFAULT_MIN_SCORE, yearTolerance = DEFAULT_YEAR_TOLERANCE } = options;
  if (typeof minScore !== "number" || !(minScore >= 0 && minScore <= 1)) {
    throw new Error(`minScore inv\xE1lido: "${minScore}" (esperado n\xFAmero entre 0 e 1)`);
  }
  if (!Number.isInteger(yearTolerance) || yearTolerance < 0) {
    throw new Error(`yearTolerance inv\xE1lido: "${yearTolerance}" (esperado inteiro maior ou igual a 0)`);
  }
  if (!Array.isArray(candidates)) {
    throw new Error(`candidates inv\xE1lido: esperado array, recebeu ${typeof candidates}`);
  }
  const mediaTitles = readMediaTitles(media);
  const mediaYear = readMediaYear(media.year);
  let best = null;
  candidates.forEach((candidate, index) => {
    const candidateYear = readCandidate(candidate, index);
    if (candidateYear !== null && mediaYear !== null && Math.abs(candidateYear - mediaYear) > yearTolerance) return;
    const score = Math.max(...mediaTitles.map((title) => titleSimilarity(candidate.title, title)));
    if (score < minScore) return;
    const exactYear = candidateYear !== null && candidateYear === mediaYear;
    if (best === null || score > best.score || score === best.score && exactYear && !best.exactYear) {
      best = { candidate, score, exactYear };
    }
  });
  return best === null ? null : { candidate: best.candidate, score: best.score };
}
function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = /* @__PURE__ */ new Map();
  for (const bigram of bigrams(a)) counts.set(bigram, (counts.get(bigram) || 0) + 1);
  let common = 0;
  const bigramsB = bigrams(b);
  for (const bigram of bigramsB) {
    const count = counts.get(bigram) || 0;
    if (count > 0) {
      counts.set(bigram, count - 1);
      common += 1;
    }
  }
  return 2 * common / (a.length - 1 + bigramsB.length);
}
function bigrams(text) {
  const result = [];
  for (let i = 0; i < text.length - 1; i += 1) result.push(text.slice(i, i + 2));
  return result;
}
function readMediaTitles(media) {
  if (typeof media !== "object" || media === null || typeof media.title !== "string") {
    throw new Error("media inv\xE1lido: esperado objeto com title string");
  }
  const { title, originalTitle, alternativeTitles } = media;
  if (originalTitle !== void 0 && typeof originalTitle !== "string") {
    throw new Error(`media.originalTitle inv\xE1lido: esperado string, recebeu ${typeof originalTitle}`);
  }
  if (alternativeTitles !== void 0 && !(Array.isArray(alternativeTitles) && alternativeTitles.every((item) => typeof item === "string"))) {
    throw new Error("media.alternativeTitles inv\xE1lido: esperado array de strings");
  }
  return [title].concat(originalTitle === void 0 ? [] : [originalTitle], alternativeTitles || []);
}
function readMediaYear(year) {
  if (year === void 0 || year === null) return null;
  if (!Number.isInteger(year)) throw new Error(`media.year inv\xE1lido: "${year}" (esperado inteiro ou null)`);
  return year;
}
function readCandidate(candidate, index) {
  if (typeof candidate !== "object" || candidate === null || typeof candidate.title !== "string") {
    throw new Error(`candidates[${index}] inv\xE1lido: esperado objeto com title string`);
  }
  const { year } = candidate;
  if (year === void 0 || year === null) return null;
  if (Number.isInteger(year)) return year;
  if (typeof year === "string" && FOUR_DIGIT_YEAR.test(year)) return Number(year);
  throw new Error(`candidates[${index}].year inv\xE1lido: "${year}" (esperado inteiro, string de 4 d\xEDgitos ou null)`);
}

// src/_blocks/tmdb-info/index.mjs
var TMDB_API_URL = "https://api.themoviedb.org/3";
var LANGUAGE = "pt-BR";
var BRAZIL = "BR";
var ANIMATION_GENRE_ID = 16;
var DORAMA_LANGUAGES = ["ko", "zh", "cn", "ja", "th"];
function getMediaInfo(request2) {
  return __async(this, null, function* () {
    const tmdbId = String(request2.tmdbId).trim();
    const { mediaType } = request2;
    if (!/^\d+$/.test(tmdbId)) {
      throw new Error(`tmdbId inv\xE1lido: "${request2.tmdbId}" (esperado ID num\xE9rico do TMDB)`);
    }
    if (mediaType !== "movie" && mediaType !== "tv") {
      throw new Error(`mediaType inv\xE1lido: "${mediaType}" (esperado "movie" ou "tv")`);
    }
    const url = `${TMDB_API_URL}/${mediaType}/${tmdbId}?api_key=${encodeURIComponent(readApiKey())}&language=${LANGUAGE}&append_to_response=external_ids,alternative_titles`;
    const response = yield fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB respondeu HTTP ${response.status} para ${mediaType} ${tmdbId}`);
    }
    return toMediaInfo(yield response.json(), tmdbId, mediaType);
  });
}
function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("TMDB_API_KEY indispon\xEDvel: o app n\xE3o forneceu a chave do TMDB ao plugin");
  }
  return key.trim();
}
function toMediaInfo(data, tmdbId, mediaType) {
  const isMovie = mediaType === "movie";
  const title = isMovie ? data.title : data.name;
  const originalTitle = isMovie ? data.original_title : data.original_name;
  const releaseDate = isMovie ? data.release_date : data.first_air_date;
  const alternatives = data.alternative_titles && (isMovie ? data.alternative_titles.titles : data.alternative_titles.results);
  const context = `${mediaType} ${tmdbId}`;
  if (!title || !originalTitle) throw new Error(`TMDB n\xE3o retornou t\xEDtulo para ${context}`);
  if (!data.external_ids) throw new Error(`TMDB n\xE3o retornou external_ids para ${context}`);
  if (!Array.isArray(alternatives)) throw new Error(`TMDB n\xE3o retornou alternative_titles para ${context}`);
  const genreIds = (data.genres || []).map((genre) => genre.id);
  const originalLanguage = data.original_language;
  return {
    tmdbId,
    mediaType,
    kind: classifyKind(mediaType, originalLanguage, genreIds),
    title,
    originalTitle,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    imdbId: data.external_ids.imdb_id || null,
    alternativeTitles: brazilianAlternativeTitles(alternatives, title),
    originalLanguage,
    originCountries: data.origin_country || [],
    genreIds
  };
}
function brazilianAlternativeTitles(alternatives, title) {
  const titles = alternatives.filter((item) => item.iso_3166_1 === BRAZIL).map((item) => item.title);
  return [...new Set(titles)].filter((item) => item !== title);
}
function classifyKind(mediaType, originalLanguage, genreIds) {
  const isAnimation = genreIds.includes(ANIMATION_GENRE_ID);
  if (isAnimation && originalLanguage === "ja") return "anime";
  if (mediaType === "movie") return "movie";
  if (!isAnimation && DORAMA_LANGUAGES.includes(originalLanguage)) return "dorama";
  return "series";
}

// src/_blocks/script-extract/index.mjs
var IDENTIFIER_START = "(?:^|[^\\w$])";
var QUOTED_STRING = String.raw`(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1`;
var OPENERS = "[{";
var CLOSERS = "]}";
function extractScriptString(html, name) {
  assertHtml(html);
  assertName(name, "name");
  const key = escapeRegExp(name);
  const pattern = new RegExp(`${IDENTIFIER_START}(?:"${key}"|'${key}'|${key})\\s*[:=]\\s*${QUOTED_STRING}`);
  const match = pattern.exec(html);
  return match ? unescapeJs(match[2]) : null;
}
function extractScriptJson(html, name) {
  assertHtml(html);
  assertName(name, "name");
  const pattern = new RegExp(`${IDENTIFIER_START}${escapeRegExp(name)}\\s*=\\s*[[{]`);
  const match = pattern.exec(html);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  const end = findClosingIndex(html, start);
  if (end === -1) throw new Error(`JSON de "${name}" sem fechamento correspondente`);
  const text = html.slice(start, end + 1);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON de "${name}" inv\xE1lido: ${error.message}`, { cause: error });
  }
}
function assertHtml(html) {
  if (typeof html !== "string") {
    throw new Error(`html inv\xE1lido: esperado string, recebido ${typeof html}`);
  }
}
function assertName(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} inv\xE1lido: "${value}" (esperado texto n\xE3o vazio)`);
  }
}
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}
function unescapeJs(value) {
  return value.replace(
    /\\(u[0-9a-fA-F]{4}|[\\/"'])/g,
    (whole, sequence) => sequence.length === 5 ? String.fromCharCode(parseInt(sequence.slice(1), 16)) : sequence
  );
}
function findClosingIndex(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (OPENERS.includes(char)) {
      depth++;
    } else if (CLOSERS.includes(char)) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// src/cineagora/player.js
function readPlayer(url, referer, request2) {
  return __async(this, null, function* () {
    request2.stage = "Player";
    const page = yield fetchPage(url, { profile: "player", headers: { Referer: referer } });
    const video = extractScriptJson(page.text, "video");
    const sourceStart = /\bsources\s*:\s*\[/.exec(page.text);
    const sourceText = (sourceStart ? page.text.slice(sourceStart.index) : page.text).split(/\btracks\s*:/)[0];
    const explicit = extractScriptString(sourceText, "file");
    let playlistUrl;
    if (explicit) {
      playlistUrl = mediaUrl(explicit, page.url);
    } else {
      if (!video || Array.isArray(video)) throw new Error("Configura\xE7\xE3o de v\xEDdeo ausente");
      for (const key of ["uid", "md5", "id", "status"]) {
        if (!["string", "number"].includes(typeof video[key]) || String(video[key]).trim() === "") {
          throw new Error(`Par\xE2metro obrigat\xF3rio do HLS ausente: ${key}`);
        }
      }
      const path = `/m3u8/${encodeURIComponent(video.uid)}/${encodeURIComponent(video.md5)}/master.txt`;
      const query = new URLSearchParams({ s: "1", id: String(video.id), cache: String(video.status) });
      playlistUrl = new URL(`${path}?${query}`, page.url).href;
    }
    request2.stage = "HLS";
    const playlist = yield fetchPage(playlistUrl, { profile: "player", headers: { Referer: page.url } });
    if (!/^#EXTM3U(?:\r?\n|$)/.test(playlist.text.trim())) throw new Error("Resposta n\xE3o \xE9 playlist HLS");
    return { page, video, playlist };
  });
}
function mediaUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) throw new Error("URL de m\xEDdia ausente");
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL de m\xEDdia n\xE3o \xE9 HTTP(S)");
  if (/^\/(?:watch|tv)(?:\/|$)|\.html?$/i.test(url.pathname)) throw new Error("P\xE1gina de player n\xE3o \xE9 m\xEDdia");
  return url.href;
}
function hlsVariants({ playlist, video, page }) {
  var _a;
  const lines = playlist.text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") throw new Error("Cabe\xE7alho HLS inv\xE1lido");
  const groups = lines.filter((line) => line.startsWith("#EXT-X-MEDIA:")).map((line) => attributes(line.slice(line.indexOf(":") + 1)));
  const variants = /* @__PURE__ */ new Map();
  let masterFallback = null;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    const info = attributes(lines[i].slice(lines[i].indexOf(":") + 1));
    const resolution2 = /^(\d+)x([1-9]\d{2,3})$/.exec(info.RESOLUTION || "");
    if (!resolution2 || Number(resolution2[1]) < 1) throw new Error("Variante HLS sem RESOLUTION v\xE1lida");
    if (!lines[i + 1] || lines[i + 1].startsWith("#")) throw new Error("Variante HLS sem URI");
    let externalGroup = false;
    for (const type of ["AUDIO", "SUBTITLES", "CLOSED-CAPTIONS", "VIDEO"]) {
      if (!info[type] || info[type] === "NONE") continue;
      const related = groups.filter((group) => group.TYPE === type && group["GROUP-ID"] === info[type]);
      if (!related.length) throw new Error(`Grupo HLS ${type} ausente`);
      if (related.some((group) => group.URI) || type === "SUBTITLES") {
        externalGroup = true;
        break;
      }
    }
    if (externalGroup) {
      // Grupo externo (ex.: faixa de áudio separada): a variante isolada
      // perderia faixas; devolve a master.txt, que carrega tudo (mesmo
      // comportamento do cinegratis). Guarda a maior qualidade vista.
      const quality = Number(resolution2[2]);
      if (!masterFallback || quality > masterFallback.quality) {
        masterFallback = { url: mediaUrl(playlist.url), quality };
      }
      continue;
    }
    const url = mediaUrl(lines[++i], playlist.url);
    const quality2 = Number(resolution2[2]);
    variants.set(`${url}|${quality2}`, { url, quality: quality2 });
  }
  if (masterFallback) return [masterFallback];
  if (variants.size) return [...variants.values()];
  const segments = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.startsWith("#EXTINF"));
  if (!segments.length || !lines.some((line) => /^#EXT-X-TARGETDURATION:[1-9]\d*$/.test(line)) || !segments.every(({ line, index }) => /^#EXTINF:\d+(?:\.\d+)?,/.test(line) && lines[index + 1] && !lines[index + 1].startsWith("#"))) {
    throw new Error("Playlist de m\xEDdia HLS inv\xE1lida");
  }
  let quality = (_a = video == null ? void 0 : video.quality) != null ? _a : extractScriptString(page.text, "quality");
  if (typeof quality === "string" && quality.trim().startsWith("[")) quality = JSON.parse(quality);
  if (Array.isArray(quality)) quality = quality.length === 1 ? quality[0] : null;
  const resolution = /^(\d{3,4})p?$/.exec(String(quality));
  if (!resolution) throw new Error("Playlist direta sem resolu\xE7\xE3o expl\xEDcita \xFAnica");
  return [{ url: mediaUrl(playlist.url), quality: Number(resolution[1]) }];
}
function attributes(text) {
  const result = {};
  let position = 0;
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]+)(?:,|$)/g;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== position || Object.prototype.hasOwnProperty.call(result, match[1])) throw new Error("Atributos HLS inv\xE1lidos");
    position += match[0].length;
    result[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  if (position !== text.length) throw new Error("Atributos HLS inv\xE1lidos");
  return result;
}
function episodePlayer(option, contentUrl, request2) {
  return __async(this, null, function* () {
    var _a;
    request2.stage = "Temporadas";
    const page = yield fetchPage(option.url, { headers: { Referer: contentUrl } });
    const slug = (_a = /^\/tv\/([^/]+)\/?$/.exec(new URL(page.url).pathname)) == null ? void 0 : _a[1];
    if (!slug) throw new Error("Player de s\xE9rie sem slug");
    const url = new URL("/fetch_series_data.php", page.url);
    url.searchParams.set("seriesSlug", decodeURIComponent(slug));
    const data = yield fetchJson(url.href, { profile: "api", headers: { Referer: page.url } });
    if (!data || !data.seasons || typeof data.seasons !== "object" || Array.isArray(data.seasons)) {
      throw new Error("Listagem de temporadas inv\xE1lida");
    }
    let selected = null;
    const seasons = /* @__PURE__ */ new Set();
    for (const [number, episodes] of Object.entries(data.seasons)) {
      const season = positiveNumber(number);
      if (seasons.has(season) || !Array.isArray(episodes)) throw new Error("Temporada inv\xE1lida ou repetida");
      seasons.add(season);
      const numbers = /* @__PURE__ */ new Set();
      for (const episode of episodes) {
        if (!episode || typeof episode !== "object") throw new Error("Epis\xF3dio inv\xE1lido");
        const number2 = positiveNumber(episode.episode_number);
        if (numbers.has(number2)) throw new Error("N\xFAmero de epis\xF3dio repetido");
        numbers.add(number2);
        if (season === request2.season && number2 === request2.episode) selected = episode;
      }
    }
    if (!selected) return null;
    if (typeof selected.video_slug !== "string" || !/^[\w-]+$/.test(selected.video_slug)) {
      throw new Error("Epis\xF3dio selecionado sem video_slug v\xE1lido");
    }
    return new URL(`/watch/${encodeURIComponent(selected.video_slug)}`, page.url).href;
  });
}
function positiveNumber(value) {
  if (!/^[1-9]\d*$/.test(String(value))) throw new Error("N\xFAmero de temporada/epis\xF3dio inv\xE1lido");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("N\xFAmero de temporada/epis\xF3dio inv\xE1lido");
  return number;
}
function playerSubtitles({ page, video }, headers) {
  const marker = /\btracks\s*:\s*\[/.exec(page.text);
  const tracks = marker ? extractScriptJson(`tracks = ${page.text.slice(marker.index + marker[0].length - 1)}`, "tracks") : extractScriptJson(page.text, "tracks");
  if (tracks === null) {
    const raw = typeof (video == null ? void 0 : video.subtitles) === "string" ? JSON.parse(video.subtitles) : video == null ? void 0 : video.subtitles;
    if (raw != null && (!Array.isArray(raw) || raw.length)) throw new Error("Legendas anunciadas sem faixas finais configuradas");
    return [];
  }
  if (!Array.isArray(tracks)) throw new Error("Configura\xE7\xE3o de faixas inv\xE1lida");
  const subtitles = /* @__PURE__ */ new Map();
  for (const track of tracks) {
    if (!track || typeof track !== "object") throw new Error("Faixa inv\xE1lida");
    if (track.kind !== "captions" && track.kind !== "subtitles") continue;
    const language = track.srclang || track.language || track.label;
    if (typeof language !== "string" || !language.trim()) throw new Error("Legenda sem idioma identificado");
    if (track.headers !== void 0 && (!track.headers || typeof track.headers !== "object" || Array.isArray(track.headers))) throw new Error("Cabe\xE7alhos de legenda inv\xE1lidos");
    const subtitle = __spreadProps(__spreadValues({
      url: mediaUrl(track.file, page.url),
      language
    }, track.label ? { name: track.label } : {}), {
      headers: __spreadValues(__spreadValues({}, headers), track.headers)
    });
    subtitles.set(`${subtitle.url}|${language}`, subtitle);
  }
  return [...subtitles.values()];
}

// src/cineagora/extractor.js
var SOURCE_URL = "https://cineagora.club";
function extractStreams(request2) {
  return __async(this, null, function* () {
    var _a, _b;
    if (!/^\d+$/.test(String(request2.tmdbId).trim())) throw new Error("ID do TMDB inv\xE1lido");
    if (!["movie", "tv"].includes(request2.mediaType)) throw new Error("Tipo de m\xEDdia inv\xE1lido");
    if (request2.mediaType === "tv" && ![request2.season, request2.episode].every((number) => Number.isInteger(number) && number > 0)) {
      throw new Error("Temporada e epis\xF3dio devem ser inteiros positivos");
    }
    request2.stage = "TMDB";
    const media = yield getMediaInfo(request2);
    const content = yield findContent(media, request2);
    if (!content) return [];
    request2.stage = "Op\xE7\xF5es";
    const options = readOptions(content, request2.mediaType);
    const streams = /* @__PURE__ */ new Map();
    for (const option of options) {
      const url = request2.mediaType === "tv" ? yield episodePlayer(option, content.url, request2) : option.url;
      if (!url) continue;
      const player = yield readPlayer(url, content.url, request2);
      const variants = hlsVariants(player);
      const headers = playbackHeaders(player.page.url);
      request2.stage = "Legendas";
      const subtitles = playerSubtitles(player, headers);
      for (const variant of variants) {
        request2.stage = "Stream";
        const stream = buildStream(__spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadProps(__spreadValues({}, variant), {
          name: `CineAgora - BRStream${option.language ? ` - ${option.language}` : ""}`,
          title: `${media.title}${media.year ? ` (${media.year})` : ""}${request2.mediaType === "tv" ? ` - T${request2.season} E${request2.episode}` : ""}`,
          provider: "BRStream",
          type: "hls",
          headers
        }), subtitles.length ? { subtitles } : {}), option.language ? { language: option.language } : {}), ((_a = player.video) == null ? void 0 : _a.size) !== void 0 ? { size: player.video.size } : {}), ((_b = player.video) == null ? void 0 : _b.behaviorHints) !== void 0 ? { behaviorHints: player.video.behaviorHints } : {}));
        streams.set(`${stream.url}|${stream.quality}|${stream.language || ""}`, stream);
      }
    }
    return [...streams.values()];
  });
}
function findContent(media, request2) {
  return __async(this, null, function* () {
    const pages = /* @__PURE__ */ new Map();
    const candidates = /* @__PURE__ */ new Map();
    const queries = [media.imdbId, media.title, media.originalTitle, ...media.alternativeTitles].filter(Boolean);
    const searched = /* @__PURE__ */ new Set();
    for (const query of queries) {
      if (searched.has(normalizeText(query))) continue;
      searched.add(normalizeText(query));
      request2.stage = "Busca";
      const url = `${SOURCE_URL}/?${new URLSearchParams({ do: "search", subaction: "search", story: query })}`;
      const search = yield fetchPage(url);
      const $ = htmlDocument(search.text);
      if (!$("#fullsearch").length || !$(".ic-sayfa .film-list").length) {
        throw new Error("HTML de busca n\xE3o reconhecido ou bloqueado");
      }
      const cards = $(".ic-sayfa .film-list .item-relative");
      if (!cards.length && !/site search yielded no results/i.test($(".berrors").text())) {
        throw new Error("Busca sem cart\xF5es nem mensagem expl\xEDcita de aus\xEAncia");
      }
      for (let i = 0; i < cards.length; i++) {
        request2.stage = "Busca";
        const card = cards.eq(i);
        const href = card.find("a.item").attr("href");
        if (!href) throw new Error("Cart\xE3o de busca sem endere\xE7o");
        const url2 = httpUrl(href, search.url);
        if (contentType(url2) !== media.mediaType) continue;
        const title = card.find(".item-footer .title").text().trim();
        if (!title) throw new Error("Cart\xE3o de busca sem t\xEDtulo");
        const year = readYear(card.find(".item-footer .info").text());
        if (query !== media.imdbId && !findBestMatch([{ title, year }], media, { yearTolerance: 0 })) continue;
        if (!pages.has(url2)) {
          request2.stage = "Conte\xFAdo";
          const page = yield fetchPage(url2, { headers: { Referer: search.url } });
          pages.set(url2, parseContent(page));
        }
        const candidate = pages.get(url2);
        if (contentType(candidate.url) !== media.mediaType) continue;
        if (media.imdbId && candidate.imdbId && candidate.imdbId !== media.imdbId) continue;
        candidates.set(candidate.url, candidate);
      }
      const confirmed = [...candidates.values()].filter((item) => media.imdbId && item.imdbId === media.imdbId);
      if (confirmed.length) return confirmed.length === 1 ? confirmed[0] : null;
    }
    const matches = [...candidates.values()].map((candidate) => findBestMatch([candidate], media, { yearTolerance: 0 })).filter(Boolean);
    matches.sort((a, b) => b.score - a.score || Number(b.candidate.year === media.year) - Number(a.candidate.year === media.year));
    if (!matches.length) return null;
    const [best, next] = matches;
    if (next && best.score === next.score && best.candidate.year === media.year === (next.candidate.year === media.year)) return null;
    return best.candidate;
  });
}
function parseContent(page) {
  var _a;
  const $ = htmlDocument(page.text);
  const body = $(".film-ic-sayfa");
  const title = body.find(".fhead h1.title").text().trim();
  if (!body.length || !title) throw new Error("P\xE1gina de conte\xFAdo sem estrutura ou t\xEDtulo esperado");
  const imdbLink = body.find(".imdb-link a").attr("href");
  const imdbId = imdbLink ? (_a = /\/title\/(tt\d+)(?:[/?#]|$)/.exec(imdbLink)) == null ? void 0 : _a[1] : null;
  if (imdbLink && !imdbId) throw new Error("Identificador IMDb inv\xE1lido na p\xE1gina");
  return { url: page.url, title, year: readYear(body.find(".fhead .date").text()), imdbId, html: page.text };
}
function readOptions(content, mediaType) {
  const $ = htmlDocument(content.html);
  const buttons = $("#player-section .mirrors [data-link]");
  const options = /* @__PURE__ */ new Map();
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons.eq(i);
    const label = button.text().trim();
    const url = httpUrl(button.attr("data-link"), content.url);
    const parsed = new URL(url);
    if (/^(?:www\.)?(?:youtube\.com|youtu\.be)$/.test(parsed.hostname) || /trailer/i.test(label)) continue;
    if (parsed.hostname !== "watch.brstream.cc") throw new Error("Host de player n\xE3o suportado");
    const valid = mediaType === "tv" ? /^\/tv\/[^/]+\/?$/.test(parsed.pathname) : /^\/watch\/[^/]+\/?$/.test(parsed.pathname) || parsed.pathname === "/watch" && parsed.searchParams.get("v");
    if (!valid) throw new Error("Bot\xE3o sem identificador de player v\xE1lido");
    const language = label ? normalizeLanguage(label) : null;
    options.set(`${url}|${language || ""}`, __spreadValues({ url }, language ? { language } : {}));
  }
  if (!options.size) throw new Error("Conte\xFAdo sem bot\xF5es BRStream de reprodu\xE7\xE3o");
  return [...options.values()];
}
function htmlDocument(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}
function contentType(url) {
  const path = new URL(url).pathname;
  if (path.startsWith("/filmes-hd-online/")) return "movie";
  if (path.startsWith("/series-online-hd-gratis/")) return "tv";
  return null;
}
function readYear(text) {
  const match = /\b(?:19|20)\d{2}\b/.exec(text);
  return match ? Number(match[0]) : null;
}
function httpUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Endere\xE7o obrigat\xF3rio ausente");
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Endere\xE7o n\xE3o \xE9 HTTP(S)");
  return url.href;
}

// src/cineagora/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const request2 = { tmdbId, mediaType, season, episode, stage: "Entrada" };
    try {
      return sortByQuality(yield extractStreams(request2));
    } catch (error) {
      const key = globalThis.TMDB_API_KEY;
      let message = String(error.message);
      if (typeof key === "string" && key.trim()) {
        for (const secret of [key, key.trim(), encodeURIComponent(key.trim())]) {
          message = message.split(secret).join("[redigido]");
        }
      }
      console.error(`[CineAgora] ${request2.stage}: ${message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
