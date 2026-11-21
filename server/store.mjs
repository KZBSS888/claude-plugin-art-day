// Personal collection: one JSON file, written atomically. No database, no dependencies.
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SOURCE_STRINGS, TRAIT_KEYS, checkLabels, languageName, needsLabels, parseLanguage, stringsFor, systemLanguage, traitKey} from './i18n.mjs';

/** Traits are stored and exchanged as keys; their names come from the language's dictionary. */
export const TRAITS = TRAIT_KEYS;
/** Tag groups a card carries, and the trait that singles each group out when the viewer marks it. */
export const FACETS = {colors: 'colors', mood: 'mood', subject: 'subject', manner: 'manner'};
const FACET_KEYS = Object.keys(FACETS);
const TRAIT_BONUS = 2; // a marked trait counts as much as two rating points on its group

/** Tags as given (a flat list or groups) → `{tags, facets}`: lower-cased, unique, every facet present. */
export function normalizeTags(given) {
  const clean = list => [...new Set((Array.isArray(list) ? list : []).map(tag => String(tag).trim().toLowerCase()).filter(Boolean))];
  const facets = Object.fromEntries(FACET_KEYS.map(key => [key, []]));
  if (Array.isArray(given)) return {tags: clean(given), facets};
  for (const key of FACET_KEYS) facets[key] = clean(given?.[key]);
  return {tags: clean(FACET_KEYS.flatMap(key => facets[key])), facets};
}
export const MAX_ATTEMPTS = 3;
const DAY_START_HOUR = 9; // the museum day begins at 09:00 Europe/Paris

/** Museum date (YYYY-MM-DD) for a moment in time, following Paris daylight saving. */
export function artDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  if (Number(parts.hour) < DAY_START_HOUR) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Artist + title folded to a comparable key, so a second file of the same painting is caught. */
export function identity(work) {
  return `${work.artist || ''}|${work.title || ''}`.normalize('NFKD').toLowerCase().replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

const emptyState = () => ({version: 1, enabled: true, cards: {}, days: [], prefs: {}, job: null, icon: null, artifact: null, language: null, labels: {}});

export function createStore(dir, {clock = () => new Date(), system = systemLanguage} = {}) {
  const file = dir ? join(dir, 'collection.json') : null;
  let state = emptyState();
  if (file) {
    mkdirSync(dir, {recursive: true, mode: 0o700});
    if (existsSync(file)) state = {...emptyState(), ...JSON.parse(readFileSync(file, 'utf8'))};
  }
  // Collections written before languages existed hold the traits by their Russian names.
  for (const p of Object.values(state.prefs)) p.traits = [...new Set((p.traits || []).map(trait => traitKey(trait)).filter(Boolean))];

  // The language set in the operating system, asked once; the viewer's own choice, when made, wins.
  let detected = null;
  const systemTag = () => (detected ||= (typeof system === 'function' ? system() : parseLanguage(system)) || {tag: 'en', base: 'en'});
  function language() {
    const chosen = parseLanguage(state.language) || systemTag();
    return {tag: chosen.tag, base: chosen.base, name: languageName(chosen.tag), auto: !parseLanguage(state.language), system: systemTag().tag};
  }
  const custom = () => state.labels?.[language().base] || null;
  const strings = () => stringsFor(language().base, custom());
  const labelsNeeded = () => needsLabels(language().base, custom());

  /** `language`: a tag, or `auto` to follow the system again. `labels`: Claude's translation of the fixed texts. */
  function setLanguage({language: wanted, labels} = {}) {
    if (wanted !== undefined) {
      if (wanted === 'auto') state.language = null;
      else {
        const parsed = parseLanguage(wanted);
        if (!parsed) throw new Error('Unknown language: ' + wanted);
        state.language = parsed.tag;
      }
    }
    if (labels !== undefined) {
      const base = language().base;
      state.labels = {...state.labels, [base]: {...state.labels?.[base], ...checkLabels(labels)}};
    }
    save();
    return language();
  }

  function save() {
    if (!file) return;
    writeFileSync(file + '.tmp', JSON.stringify(state), {mode: 0o600});
    renameSync(file + '.tmp', file);
    writeFileSync(join(dir, 'ART-TASTE.md.tmp'), profile(), {mode: 0o600});
    renameSync(join(dir, 'ART-TASTE.md.tmp'), join(dir, 'ART-TASTE.md'));
  }

  const today = () => artDate(clock());
  const latest = () => state.days[state.days.length - 1] || null;
  const stale = () => latest()?.day !== today();
  const pref = id => state.prefs[id] || {rating: null, favorite: false, traits: []};
  const weightOf = p => (p.rating === null ? 0 : p.rating - 3) + (p.favorite ? 2 : 0);

  /** Only today's work and favorites keep their texts; the rest shrink to a history line. */
  function compact() {
    const current = latest()?.id;
    for (const [id, card] of Object.entries(state.cards)) {
      if (id === current || pref(id).favorite || card.compact) continue;
      state.cards[id] = {
        id, compact: true, date: card.date, title: card.title, artist: card.artist, year: card.year,
        sourceUrl: card.sourceUrl, tags: card.tags, facets: card.facets,
      };
    }
  }

  /**
   * Taste from ratings and favorites, sharpened by traits: a rating moves every tag of the painting and its
   * artist; a marked trait adds a bonus to the tags of that group alone (`manner` also to the
   * artist), so `colors` on a Monet pulls towards his colours, not his subjects. A card published before
   * groups existed spreads the bonus over all its tags. `story` names no group and moves nothing.
   */
  function taste() {
    const tags = new Map(), artists = new Map();
    const add = (map, key, delta) => { if (key && delta) map.set(key, (map.get(key) || 0) + delta); };
    let rated = 0;
    for (const [id, p] of Object.entries(state.prefs)) {
      const card = state.cards[id];
      if (!card) continue;
      if (p.rating !== null) rated++;
      const weight = weightOf(p);
      const all = (card.tags || []).map(tag => tag.toLowerCase());
      for (const tag of all) add(tags, tag, weight);
      add(artists, card.artist, weight);
      const grouped = card.facets && FACET_KEYS.some(key => card.facets[key]?.length);
      for (const trait of p.traits || []) {
        const key = FACET_KEYS.find(facet => FACETS[facet] === trait);
        if (!key) continue;
        const group = grouped ? (card.facets[key] || []).map(tag => tag.toLowerCase()) : all;
        for (const tag of group) add(tags, tag, grouped ? TRAIT_BONUS : 1);
        if (key === 'manner') add(artists, card.artist, TRAIT_BONUS);
      }
    }
    const rank = map => [...map].filter(([, weight]) => weight !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 24)
      .map(([name, weight]) => ({name, weight}));
    return {ratedCount: rated, confidence: rated < 5 ? 'tentative' : 'developing', tags: rank(tags), artists: rank(artists)};
  }

  function profile() {
    const t = strings();
    const clean = value => String(value ?? '').replace(/[|\n\r<>]/g, ' ');
    const lines = taste().tags.filter(tag => tag.weight > 0).slice(0, 16).map(tag => `- ${clean(tag.name)}: ${tag.weight}`);
    const rows = [...state.days].reverse().map(day => {
      const card = state.cards[day.id] || {}, p = pref(day.id);
      return '| ' + [day.day, card.title, card.artist, card.sourceUrl, p.rating ?? '', p.favorite ? t.yes : ''].map(clean).join(' | ') + ' |';
    });
    return '# ' + t.profileTitle + '\n\n' + lines.join('\n') + '\n\n## ' + t.profileShown + '\n\n'
      + '| ' + t.profileHead + ' |\n|---|---|---|---|---|---|\n' + rows.join('\n') + '\n';
  }

  /** True when this painting was already shown: same file, same artwork record, same bytes or same artist + title. */
  function seen(work) {
    const key = identity(work);
    return state.days.some(day => day.id === work.id
      || (work.work && day.work === work.work)
      || (work.sha1 && day.sha1 === work.sha1)
      || (key.length > 1 && day.identity === key));
  }

  function attemptsLeft() {
    return state.job?.day === today() ? Math.max(0, MAX_ATTEMPTS - state.job.attempts) : MAX_ATTEMPTS;
  }

  /** Registers one selection attempt. The counter is saved before any search starts. */
  function begin() {
    if (!state.enabled) throw new Error('Daily picks are turned off.');
    if (!stale()) return {stale: false, attemptsLeft: attemptsLeft()};
    if (attemptsLeft() === 0) throw new Error('All three attempts for today are used. The next pick is in the new museum day.');
    const attempts = state.job?.day === today() ? state.job.attempts + 1 : 1;
    state.job = {day: today(), attempts, at: clock().getTime()};
    save();
    return {stale: true, attemptsLeft: attemptsLeft()};
  }

  function publish(card, icon = null) {
    if (!state.enabled) throw new Error('Daily picks are turned off.');
    if (!stale()) return {changed: false};
    // Repeats are matched on the source's own title and artist, not on the translated display text.
    if (seen({...card, ...card.facts})) throw new Error('This work has already been shown.');
    const day = today();
    state.cards[card.id] = {...card, ...normalizeTags(card.tags), date: day};
    state.days.push({day, id: card.id, work: card.work || '', sha1: card.sha1 || '', identity: identity(card.facts || card)});
    state.icon = icon;
    compact();
    save();
    return {changed: true};
  }

  function rate({id, rating, favorite, traits}) {
    const card = state.cards[id];
    if (!card) throw new Error('No such painting in the collection.');
    const next = {...pref(id)};
    if (rating !== undefined) {
      if (!(rating === null || (Number.isInteger(rating) && rating >= 1 && rating <= 5))) throw new Error('A rating is a whole number from 1 to 5.');
      next.rating = rating;
    }
    if (favorite !== undefined) {
      if (typeof favorite !== 'boolean') throw new Error('Favourite is true or false.');
      if (favorite && card.compact) throw new Error('The full card was not kept: a work is added to favourites on the day it is shown.');
      next.favorite = favorite;
    }
    if (traits !== undefined) {
      const keys = Array.isArray(traits) ? traits.map(trait => traitKey(trait, custom())) : [null];
      if (keys.includes(null)) throw new Error('Unknown trait. Use: ' + TRAITS.join(', '));
      next.traits = [...new Set(keys)];
    }
    state.prefs[id] = next;
    compact();
    save();
    return next;
  }

  function setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Expected true or false.');
    state.enabled = enabled;
    save();
  }

  /** Remembers where the pinned card lives and which day's card was published there. */
  function setArtifact(url) {
    state.artifact = {url, day: latest()?.day || null};
    save();
    return state.artifact;
  }

  /** The pinned card's address, and whether it still shows an older day than the collection. */
  function artifact() {
    const current = latest()?.day || null;
    return state.artifact ? {...state.artifact, stale: state.artifact.day !== current} : null;
  }

  /** Everything the card view needs. `selected` opens a favorite instead of today's work. */
  function view(selected = null) {
    const currentId = latest()?.id || null;
    const card = state.cards[selected] && !state.cards[selected].compact ? state.cards[selected] : state.cards[currentId] || null;
    const history = [...state.days].reverse().map(day => ({...state.cards[day.id], ...pref(day.id)}));
    return {
      today: today(), stale: stale(), enabled: state.enabled, attemptsLeft: attemptsLeft(), traits: TRAITS, lang: language().tag,
      card, pref: card ? pref(card.id) : null, artifact: artifact(),
      favorites: history.filter(item => item.favorite && !item.compact)
        .map(({id, title, artist, thumbUrl}) => ({id, title, artist, thumbUrl})),
      rated: history.filter(item => item.rating !== null)
        .map(({id, title, artist, rating, traits}) => ({id, title, artist, rating, traits})),
      taste: taste(),
    };
  }

  /** Bounded context for the selecting model: taste and recent ratings, never the full gallery. */
  function brief() {
    const recent = [...state.days].reverse().slice(0, 30).map(day => {
      const card = state.cards[day.id] || {}, p = pref(day.id);
      return {date: day.day, title: card.title, artist: card.artist, tags: card.tags, rating: p.rating, favorite: p.favorite, traits: p.traits};
    });
    const {tag, name, auto} = language();
    // The day's texts are written in `language`. When its fixed card texts are not translated yet, the English source rides along.
    return {today: today(), stale: stale(), enabled: state.enabled, attemptsLeft: attemptsLeft(), shownCount: state.days.length, taste: taste(), recent,
      language: {tag, name, auto}, labelsNeeded: labelsNeeded(), ...(labelsNeeded() ? {labelsSource: SOURCE_STRINGS} : {})};
  }

  return {view, brief, seen, begin, publish, rate, setEnabled, setArtifact, artifact, profile, taste, language, strings, labelsNeeded, setLanguage, icon: () => state.icon};
}
