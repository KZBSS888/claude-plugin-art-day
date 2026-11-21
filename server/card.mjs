// The pinned card: a page (card.html) that Claude publishes as an artifact and keeps pinned in the
// sidebar. The server fills the page with a snapshot of the collection and saves the pictures beside it;
// publishing is Claude's step, because only Claude holds the artifact tool.
import {mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SOURCE_STRINGS} from './i18n.mjs';

export const CARD_DIR = 'card';
export const CARD_HTML = 'index.html';
// The plugin's own MCP server as the artifact viewer names it: `host:` + the local server's name with
// anything outside [A-Za-z0-9_-] replaced by `_`. A plugin installed in Claude Code is `plugin_<plugin>_<server>`.
export const HOST_SERVER = process.env.ART_DAY_HOST_SERVER || 'host:plugin_art-day_art-day';
export const CARD_TOOLS = ['art_day_open', 'art_day_rate'];
/**
 * What the artifact must declare: `mcp` so the page may call the plugin directly where a Claude app bridges
 * local servers, and `db` so a rating is kept in the artifact's own store everywhere else, until the next
 * «art day» carries it into the collection (the skill's step). The store is private to the artifact's owner.
 */
export const CARD_CAPABILITIES = {mcp: {servers: [{server: HOST_SERVER, tools: CARD_TOOLS}]}, db: {}};
/** The artifact-store collection the page writes and the skill drains: one document per painting id. */
export const RATINGS_COLLECTION = 'ratings';
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9_-]{6,64}$/;

/** A claude.ai artifact address and nothing else: the skill passes it back after the first publish. */
export function checkArtifactUrl(url) {
  if (!ARTIFACT_URL.test(String(url || ''))) throw new Error('Expected an artifact address like https://claude.ai/artifact/…');
  return url;
}

/** File name for the reproduction saved beside the page. */
export const imageName = type => (type === 'image/png' ? 'view.png' : 'view.jpg');

/** How many favorites travel with the page as miniatures; the rest open after the next republish. */
export const MAX_THUMBS = 60;
const template = readFileSync(new URL('./card.html', import.meta.url), 'utf8');

/** JSON that is safe inside a <script> element: no tag can open or close within it. */
export const embed = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, ch => '\\u' + ch.charCodeAt(0).toString(16));

/** File name of a favorite's miniature, from its collection id. */
export const thumbName = (id, type) => 'fav-' + String(id).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + (type === 'image/png' ? '.png' : '.jpg');

/**
 * The page, written for the artifact viewer: no document skeleton (the viewer adds one). It has the same
 * architecture as the card in the chat (view.html) and starts from a snapshot of the same `view`:
 * `image` is today's reproduction and `thumbs` the favorites' miniatures, all published beside the page,
 * because the viewer blocks other image hosts; `cards` holds the favorites' texts so they open without the plugin;
 * `strings` is the dictionary of the collection's language for the page's fixed texts.
 */
export function renderCard(view, {image = 'view.jpg', thumbs = {}, cards = {}, strings = SOURCE_STRINGS, server = HOST_SERVER} = {}) {
  const {artifact, ...shown} = view;
  return template.replace('/*SNAPSHOT*/', () => embed({view: shown, image, thumbs, cards, strings, server, ratings: RATINGS_COLLECTION}));
}

/**
 * Writes the page, the reproduction and the favorites' miniatures into `<dataDir>/card/`, each file atomically.
 * `pictures` is `{view: {type, bytes}, thumbs: {id: {type, bytes}}}`. Returns the paths; `files` maps every
 * published name to its path, for the Artifact tool's `files`.
 */
export function writeCard(dataDir, view, pictures, options = {}) {
  const dir = join(dataDir, CARD_DIR);
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const put = (file, body) => {
    writeFileSync(join(dir, file + '.tmp'), body, {mode: 0o600});
    renameSync(join(dir, file + '.tmp'), join(dir, file));
    return join(dir, file);
  };
  const name = imageName(pictures.view.type);
  const files = {[name]: put(name, pictures.view.bytes)};
  const thumbs = {};
  for (const [id, picture] of Object.entries(pictures.thumbs || {})) {
    thumbs[id] = thumbName(id, picture.type);
    files[thumbs[id]] = put(thumbs[id], picture.bytes);
  }
  const html = put(CARD_HTML, renderCard(view, {...options, image: name, thumbs}));
  return {dir, html, image: files[name], imageName: name, files};
}
