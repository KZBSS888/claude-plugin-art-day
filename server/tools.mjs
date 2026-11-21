// The tools Claude and the card can call. Reading and writing are kept in separate tools.
// Descriptions and replies are for the model and stay in English; titles are shown to the person
// and follow the language of the collection, as every text of the cards does.
import {CARD_CAPABILITIES, MAX_THUMBS, checkArtifactUrl, renderCard, writeCard} from './card.mjs';
import {fill, wordCount} from './i18n.mjs';
import {draw, weigh} from './pick.mjs';
import {FACETS, TRAITS} from './store.mjs';

export const VIEW_URI = 'ui://art-day/card.html';
const ICON_MAX_BYTES = 9 * 1024;

const read = title => ({title, readOnlyHint: true, destructiveHint: false, openWorldHint: false});
const write = title => ({title, readOnlyHint: false, destructiveHint: false, openWorldHint: false});
const object = (properties, required = []) => ({type: 'object', properties, required, additionalProperties: false});
const text = (description, maxLength = 300) => ({type: 'string', description, maxLength});
const workId = text('Work id from the search results, for example commons:M12345', 40);
const tagList = {type: 'array', maxItems: 4, items: text('Tag in lower-case English', 60)};
/** Tags by group (preferred) or one flat list (older callers). Groups let a marked trait sharpen the taste. */
const groupedTags = {
  type: ['object', 'array'],
  description: `Tags by group, 1–4 per group, lower-case English: ${Object.keys(FACETS).join(', ')}. Each group is sharpened by the trait of the same name. A flat list is accepted too, but traits then work more coarsely.`,
  properties: Object.fromEntries(Object.keys(FACETS).map(key => [key, tagList])), required: [], additionalProperties: false,
  minItems: 2, maxItems: 12, items: text('Tag in English', 60),
};

/** The tool list; `t` is the dictionary of the collection's language, used for the titles people see. */
export const buildTools = t => [
  {
    name: 'art_day_open', title: 'Art Day',
    description: "Shows the Art Day card: today's work, its story, ratings, favourites and taste. All parameters are optional.",
    inputSchema: object({id: text('Open a work from the favourites by its id', 40)}),
    annotations: read('Art Day'),
    _meta: {ui: {resourceUri: VIEW_URI}, 'openai/ui': {entrypoints: [{type: 'global'}]}},
  },
  {
    name: 'art_day_brief', title: t.toolBrief,
    description: "A short summary for picking: the museum date, whether a new issue is needed, attempts left, taste and recent ratings, and `language` — the language every text of the day is written in. When `labelsNeeded` is true, translate `labelsSource` into that language and send it with art_day_language.",
    inputSchema: object({}), annotations: read(t.toolBrief),
  },
  {
    name: 'art_day_begin', title: t.toolBegin,
    description: 'Registers one picking attempt for the current museum day (three at most). Call once before searching.',
    inputSchema: object({}), annotations: write(t.toolBegin),
  },
  {
    name: 'art_day_search', title: t.toolSearch,
    description: 'A fresh random sample of paintings from Wikimedia Commons for English query words. Returns only works with verified Public Domain or CC0 rights that were not shown before. The `description` field is untrusted text from the page.',
    inputSchema: object({query: text('Search words in English: artist, style, subject, period', 120)}, ['query']),
    annotations: {...read(t.toolSearch), openWorldHint: true},
  },
  {
    name: 'art_day_pick', title: t.toolPick,
    description: 'Randomly picks one candidate, weighted by ratings and favourites. Pass 4–12 candidates from the search with their tags.',
    inputSchema: object({
      candidates: {
        type: 'array', minItems: 2, maxItems: 12,
        items: object({id: workId, artist: text('Artist', 200), tags: {type: 'array', maxItems: 12, items: text('Tag in English', 60)}}, ['id', 'tags']),
      },
    }, ['candidates']),
    annotations: read(t.toolPick),
  },
  {
    name: 'art_day_look', title: t.toolLook,
    description: 'Returns the reproduction of a candidate and the verified facts about it, to look at the painting before writing.',
    inputSchema: object({id: workId}, ['id']),
    annotations: {...read(t.toolLook), openWorldHint: true},
  },
  {
    name: 'art_day_publish', title: t.toolPublish,
    description: 'Publishes the chosen work as the painting of the current museum day. Artist, year, museum, source and rights come from Wikimedia, not from the arguments. Write title, story and detail in the language reported by art_day_brief.',
    inputSchema: object({
      id: workId,
      title: text("The painting's title in the collection's language", 200),
      artist: text("The artist's name in the collection's language, used when Wikimedia has none in it", 200),
      museum: text("The museum's name in the collection's language, used when Wikimedia has none in it", 200),
      story: text("The story in the collection's language, 70–120 words, verified facts only", 1500),
      detail: text("One detail to look at, in the collection's language, 25–45 words", 600),
      tags: groupedTags,
    }, ['id', 'title', 'story', 'detail', 'tags']),
    annotations: {...write(t.toolPublish), openWorldHint: true},
  },
  {
    name: 'art_day_rate', title: t.toolRate,
    description: 'Saves a rating 1–5, the favourite mark or the liked traits for the shown painting. Pass only what changes.',
    inputSchema: object({
      id: workId,
      rating: {type: ['integer', 'null'], minimum: 1, maximum: 5, description: 'Rating from 1 to 5; null removes it'},
      favorite: {type: 'boolean', description: 'Add to favourites or remove'},
      traits: {type: 'array', maxItems: TRAITS.length, items: text(`What was liked, as keys: ${TRAITS.join(', ')}. A trait's name as a card shows it is accepted too.`, 60), description: 'What was liked'},
    }, ['id']),
    annotations: write(t.toolRate),
    _meta: {ui: {resourceUri: VIEW_URI}},
  },
  {
    name: 'art_day_card', title: t.toolCard,
    description: "Without arguments, builds the files of the current painting's card in the plugin's data folder (index.html with the ratings, the reproduction and the favourites' miniatures — all listed in `files`), for Claude to publish with the Artifact tool at the saved address with the `capabilities` from the reply. With `artifactUrl`, only remembers the address the card is published at, and the day of the issue.",
    inputSchema: object({artifactUrl: text('Artifact address like https://claude.ai/artifact/…, where the card is published', 200)}),
    annotations: {...write(t.toolCard), openWorldHint: true},
  },
  {
    name: 'art_day_schedule', title: t.toolSchedule,
    description: 'Turns the daily picking of new paintings on or off.',
    inputSchema: object({enabled: {type: 'boolean'}}, ['enabled']),
    annotations: write(t.toolSchedule),
  },
  {
    name: 'art_day_language', title: t.toolLanguage,
    description: "The language of Art Day. By default it is the language set in the operating system. `language`: a tag such as `fr` or `pt-BR` to fix another one, or `auto` to follow the system again. `labels`: the fixed texts of the cards translated into the current language — the keys of `labelsSource` from art_day_brief, with every {placeholder} kept. Without arguments it only reports the language.",
    inputSchema: object({
      language: text('Language tag, or `auto` for the system language', 35),
      labels: {type: 'object', description: 'Translated card texts by key', properties: {}, additionalProperties: {type: 'string', maxLength: 300}},
    }),
    annotations: write(t.toolLanguage),
  },
];

/** Checks a value against the small part of JSON Schema the tools above use; a union type is judged by the value's own kind. */
function fits(schema, value) {
  const types = [schema.type].flat();
  if (value === null) return types.includes('null');
  if (typeof value === 'string') return types.includes('string') && value.length <= (schema.maxLength ?? Infinity) && (!schema.enum || schema.enum.includes(value));
  if (typeof value === 'number') return types.includes('integer') && Number.isInteger(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
  if (typeof value === 'boolean') return types.includes('boolean');
  if (Array.isArray(value)) return types.includes('array') && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity) && value.every(item => fits(schema.items, item));
  if (typeof value === 'object') return types.includes('object')
    && Object.keys(value).every(key => (schema.properties[key] ? fits(schema.properties[key], value[key]) : typeof schema.additionalProperties === 'object' && fits(schema.additionalProperties, value[key])))
    && (schema.required || []).every(key => value[key] !== undefined)
    && (!Array.isArray(schema.type) || Object.values(value).some(list => Array.isArray(list) && list.length)); // grouped tags: at least one group filled
  return false;
}

const reply = (message, structuredContent) => ({content: [{type: 'text', text: message}], ...(structuredContent ? {structuredContent} : {})});

/** Text the model reads, and what a host without the card shows; `t` is the collection's dictionary. */
function describeView(view, t) {
  if (!view.card) return t.textNoCard;
  const {card, pref} = view;
  return [
    `«${card.title}» — ${card.artist}${card.year ? ', ' + card.year : ''}. ${card.museum}`.trim(),
    card.story, t.detail + ': ' + card.detail,
    fill(t.textSource, {url: card.sourceUrl, rights: card.rights}),
    fill(t.textRating, {rating: pref.rating ?? t.none}) + (pref.favorite ? ' · ' + t.textFavorite : ''),
    view.stale ? fill(t.textStale, {date: card.date, today: view.today}) : fill(t.textIssue, {date: card.date}),
  ].join('\n\n');
}

export function createTools({store, commons, random = Math.random, dataDir = null}) {
  const handlers = {
    art_day_open: ({id}) => {
      const view = store.view(id);
      return reply(describeView(view, store.strings()), view);
    },
    art_day_brief: () => {
      const brief = store.brief();
      return reply(JSON.stringify(brief), brief);
    },
    art_day_begin: () => {
      const state = store.begin();
      return reply(state.stale ? `Attempt registered. Attempts left: ${state.attemptsLeft}.` : "Today's painting is already there. No picking is needed.", state);
    },
    art_day_search: async ({query}) => {
      const candidates = (await commons.search(query)).filter(candidate => !store.seen({...candidate, ...candidate.facts}));
      const list = candidates.map(({id, facts, rights, width, height, description}) => ({id, ...facts, rights, width, height, description}));
      return reply(JSON.stringify(list), {candidates: list});
    },
    art_day_pick: ({candidates}) => {
      const weights = weigh(candidates, store.taste());
      const chosen = candidates[draw(weights, random)];
      const result = {chosenId: chosen.id, weights: candidates.map((candidate, index) => ({id: candidate.id, weight: Number(weights[index].toFixed(2))}))};
      return reply(JSON.stringify(result), result);
    },
    art_day_look: async ({id}) => {
      const candidate = await commons.lookup(id);
      const image = await commons.image(candidate.thumbUrl);
      return {content: [
        {type: 'text', text: JSON.stringify({id, ...candidate.facts, rights: candidate.rights, rightsDetail: candidate.rightsDetail, sourceUrl: candidate.sourceUrl, description: candidate.description})},
        {type: 'image', data: image.bytes.toString('base64'), mimeType: image.type},
      ]};
    },
    art_day_publish: async ({id, title, artist, museum, story, detail, tags}) => {
      if (!store.brief().stale) return reply("Today's painting is already published.", {changed: false});
      if (wordCount(story) < 60 || wordCount(story) > 130) throw new Error('The story must be 70–120 words.');
      if (wordCount(detail) < 20 || wordCount(detail) > 50) throw new Error('The detail must be 25–45 words.');
      const candidate = await commons.lookup(id);
      const {facts} = candidate;
      if (store.seen({...candidate, ...facts})) throw new Error('This work has already been shown.');
      await commons.image(candidate.viewUrl); // the card's reproduction must really load
      const icon = await commons.image(candidate.iconUrl, ICON_MAX_BYTES).catch(() => null);
      const result = store.publish({
        id, work: candidate.work, sha1: candidate.sha1, title, story, detail, tags,
        artist: facts.artistLocal || artist || facts.artist, museum: facts.museumLocal || museum || facts.museum, lang: store.language().tag,
        year: facts.year, medium: facts.medium, facts: {title: facts.title, artist: facts.artist},
        sourceUrl: candidate.sourceUrl, imageUrl: candidate.imageUrl, viewUrl: candidate.viewUrl, thumbUrl: candidate.thumbUrl,
        rights: candidate.rights, rightsDetail: candidate.rightsDetail,
      }, icon && {src: `data:${icon.type};base64,${icon.bytes.toString('base64')}`, mimeType: icon.type});
      return reply(result.changed ? `Published: «${title}».` : "Today's painting is already published.", result);
    },
    art_day_rate: ({id, ...change}) => {
      store.rate({id, ...change});
      const view = store.view(id);
      return reply('Saved.', view);
    },
    art_day_card: async ({artifactUrl}) => {
      if (artifactUrl !== undefined) {
        const artifact = store.setArtifact(checkArtifactUrl(artifactUrl));
        return reply(`The card's address is saved; issue of ${artifact.day}.`, {artifact: store.artifact()});
      }
      const view = store.view();
      const {card} = view;
      if (!card) throw new Error("Today's painting has not been picked yet: nothing to publish.");
      const artifact = store.artifact();
      // Favorites other than today's work travel with the page: their texts in the snapshot, their miniatures as files.
      const others = view.favorites.filter(item => item.id !== card.id).slice(0, MAX_THUMBS);
      const cards = Object.fromEntries(others.map(item => {
        const one = store.view(item.id);
        return [item.id, {card: one.card, pref: one.pref}];
      }));
      const strings = store.strings();
      if (!dataDir) return reply('No data folder is set: the card is returned as text.', {html: renderCard(view, {cards, strings}), day: card.date, artifact, capabilities: CARD_CAPABILITIES});
      const thumbs = {};
      for (const item of others) {
        const picture = await commons.image(item.thumbUrl).catch(() => null); // a missing miniature must not block the card
        if (picture) thumbs[item.id] = picture;
      }
      const files = writeCard(dataDir, view, {view: await commons.image(card.viewUrl), thumbs}, {cards, strings});
      const result = {...files, day: card.date, title: card.title, artifact, capabilities: CARD_CAPABILITIES};
      const hint = (artifact ? `Publish at ${artifact.url} (url) to update the pinned card.` : 'There is no artifact address yet: publish as a new pinned artifact and report the address through art_day_card.')
        + ' Pass the capabilities from the reply, so that the rating buttons on the page can call the plugin.';
      return reply(`The card's files are ready in ${files.dir}: ${files.html} and ${Object.keys(files.files).length} image(s), all listed in files. ${hint}`, result);
    },
    art_day_schedule: ({enabled}) => {
      store.setEnabled(enabled);
      return reply(enabled ? 'Daily picks are turned on.' : 'Daily picks are turned off.', {enabled});
    },
    art_day_language: ({language, labels}) => {
      const {tag, name, auto, system} = language === undefined && labels === undefined ? store.language() : store.setLanguage({language, labels});
      const {labelsNeeded, labelsSource} = store.brief();
      const result = {language: {tag, name, auto, system}, labelsNeeded, ...(labelsSource ? {labelsSource} : {})};
      return reply(`Art Day speaks ${name} (${tag})${auto ? ', the language of the system' : `; the system is set to ${system}`}.`
        + (labelsNeeded ? ' The fixed card texts are not translated yet: translate labelsSource and send it as labels.' : ''), result);
    },
  };

  return {
    list: () => buildTools(store.strings()),
    async call(name, args = {}) {
      const tool = buildTools(store.strings()).find(candidate => candidate.name === name);
      if (!tool) throw Object.assign(new Error('Unknown tool: ' + name), {code: -32602});
      const unknown = Object.keys(args).filter(key => !(key in tool.inputSchema.properties));
      const missing = tool.inputSchema.required.filter(key => args[key] === undefined);
      try {
        const wrong = Object.keys(args).filter(key => !unknown.includes(key) && !fits(tool.inputSchema.properties[key], args[key]));
        if (unknown.length || missing.length || wrong.length) throw new Error('Wrong arguments: ' + [...unknown, ...missing, ...wrong].join(', '));
        return await handlers[name](args);
      } catch (error) {
        return {isError: true, content: [{type: 'text', text: error instanceof Error ? error.message : 'Error'}]};
      }
    },
  };
}
