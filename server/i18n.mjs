// Language: the plugin speaks the language set in the operating system, not a fixed one.
// Texts about a painting are written anew every day by Claude in that language; the fixed texts of the
// cards (buttons, captions, tool titles) come from the dictionaries below. English and Russian are built
// in; for any other language Claude translates the English dictionary once and the collection keeps it.
import {execFileSync} from 'node:child_process';

/** The traits a viewer can mark, as stable keys. The first four are also the tag groups of a card. */
export const TRAIT_KEYS = ['colors', 'mood', 'subject', 'manner', 'story'];

const EN = {
  tabToday: 'Today', tabSaved: 'Favourites', tabTaste: 'My taste',
  loading: 'Loading the painting…',
  noCard: 'The first painting has not been picked yet.',
  zoom: '⤢ Look closer', close: 'Close ×',
  favAdd: 'Add to favourites', favRemove: 'Remove from favourites',
  detail: 'Look closely',
  openOriginal: '↓ Open the original', sourcePage: 'Page on Wikimedia Commons ↗',
  rateQuestion: 'Does this painting speak to you?',
  rateN: 'Rating {n} of 5', yourRating: 'Your rating: {n} of 5',
  rateHint: 'From "not for me" to "more like this"',
  traitsQuestion: 'What did you like most?',
  trait_colors: 'Colours', trait_mood: 'Mood', trait_subject: 'Subject', trait_manner: "The artist's manner", trait_story: "The painting's story",
  saved: 'Saved', sentToChat: 'Sent to the chat — Claude will save it',
  favTitle: 'Favourites', favEmpty: 'Nothing here yet. Tap the heart next to a painting.',
  tasteEyebrow: 'Your collection of impressions', tasteTitle: 'My taste',
  tasteRated: 'Paintings rated: {n}. Picks follow your ratings, favourites and the traits you marked.',
  tasteEmpty: 'Start rating paintings and your preferences will appear here.',
  tasteCloser: 'What you are drawn to', tasteFew: 'Not enough ratings yet to tell.',
  tasteNote: "Every day is a fresh search in Wikimedia Commons only. Today's work and your favourites are kept in full.",
  pickOff: 'Daily picks are turned off.',
  pickMissing: 'No painting has been picked for {date} yet.',
  pickSpent: 'All three attempts for today are used. The next pick is tomorrow.',
  pickNow: 'Pick now',
  sayPick: "Pick today's Art Day painting.",
  saySave: 'Save for Art Day ({id}): {what}.',
  sayFavOn: 'add to favourites', sayFavOff: 'remove from favourites',
  sayRating: 'rating {n} of 5', sayTraits: 'marked traits: {list}', none: 'none',
  copied: 'Copied — paste the message into the Claude chat',
  writeToChat: 'Write to the Claude chat: "{text}"',
  storedLater: 'Saved — it will count towards your taste at the next "art day" in the chat',
  copyMode: 'Ratings are not saved here directly: a tap copies a message for the Claude chat',
  noPicture: 'The reproduction will appear here after the next "art day" in the chat.',
  laterWork: 'This work will appear here after the next "art day" in the chat',
  errNoPlugin: 'The Art Day plugin does not answer from this window.',
  errNoAccess: "The page is not allowed to reach the plugin. Allow it in the artifact's Permissions menu.",
  errApproval: 'Your approval is needed: confirm it in Claude and tap again.',
  errCancelled: 'Cancelled.',
  errRefused: 'The plugin refused: {message}',
  errFull: 'The card\'s storage is full: open "art day" in the chat to carry the ratings over.',
  errSave: 'Could not save ({code}). Try again.',
  // Shown by Claude apps outside the cards: tool titles, the text form of the card, the taste file.
  toolBrief: 'Taste summary', toolBegin: 'Start picking', toolSearch: 'Search Wikimedia Commons', toolPick: 'Random pick by taste',
  toolLook: 'Look at a candidate', toolPublish: "Publish today's painting", toolRate: 'Rate the painting',
  toolCard: 'Card for the pinned artifact', toolSchedule: 'Turn daily picks on or off', toolLanguage: 'Language of Art Day',
  textNoCard: "Today's painting has not been picked yet.",
  textSource: 'Source: {url} · {rights}',
  textRating: 'Rating: {rating}', textFavorite: 'in favourites',
  textIssue: 'Issue of {date}.', textStale: 'This is the issue of {date}. No painting has been picked for {today} yet.',
  profileTitle: 'My taste', profileShown: 'Works shown',
  profileHead: 'Date | Work | Artist | Source | Rating | Favourite', yes: 'yes',
};

const RU = {
  tabToday: 'Сегодня', tabSaved: 'Избранное', tabTaste: 'Мой вкус',
  loading: 'Загрузка картины…',
  noCard: 'Первая картина ещё не подобрана.',
  zoom: '⤢ Рассмотреть', close: 'Закрыть ×',
  favAdd: 'В избранное', favRemove: 'Убрать из избранного',
  detail: 'Присмотритесь',
  openOriginal: '↓ Открыть оригинал', sourcePage: 'Страница в Wikimedia Commons ↗',
  rateQuestion: 'Вам близка эта картина?',
  rateN: 'Оценка {n} из 5', yourRating: 'Ваша оценка: {n} из 5',
  rateHint: 'От «не моё» до «хочу больше такого»',
  traitsQuestion: 'Что особенно понравилось?',
  trait_colors: 'Цвета', trait_mood: 'Настроение', trait_subject: 'Сюжет', trait_manner: 'Манера художника', trait_story: 'История картины',
  saved: 'Сохранено', sentToChat: 'Отправлено в чат — Claude сохранит',
  favTitle: 'Избранное', favEmpty: 'Пока пусто. Нажмите сердечко у картины.',
  tasteEyebrow: 'Ваша коллекция впечатлений', tasteTitle: 'Мой вкус',
  tasteRated: 'Оценено картин: {n}. Подбор учитывает оценки, избранное и отмеченные признаки.',
  tasteEmpty: 'Начните оценивать картины — здесь появятся ваши предпочтения.',
  tasteCloser: 'Что вам ближе', tasteFew: 'Пока недостаточно оценок для выводов.',
  tasteNote: 'Каждый день — свежий поиск только в Wikimedia Commons. Полностью хранятся текущая работа и избранное.',
  pickOff: 'Ежедневный подбор выключен.',
  pickMissing: 'На {date} картина ещё не подобрана.',
  pickSpent: 'Три попытки на сегодня исчерпаны. Следующий подбор — завтра.',
  pickNow: 'Подобрать сейчас',
  sayPick: 'Подбери картину дня на сегодня.',
  saySave: 'Сохрани для картины дня ({id}): {what}.',
  sayFavOn: 'добавь в избранное', sayFavOff: 'убери из избранного',
  sayRating: 'оценка {n} из 5', sayTraits: 'отмеченные признаки — {list}', none: 'нет',
  copied: 'Скопировано — вставьте сообщение в чат Claude',
  writeToChat: 'Напишите в чат Claude: «{text}»',
  storedLater: 'Сохранено — попадёт во вкус при следующем «art day» в чате',
  copyMode: 'Оценки здесь не сохраняются сами: нажатие копирует сообщение для чата Claude',
  noPicture: 'Репродукция появится здесь после следующего «art day» в чате.',
  laterWork: 'Эта работа появится здесь после следующего «art day» в чате',
  errNoPlugin: 'Плагин Art Day не отвечает из этого окна.',
  errNoAccess: 'Странице не разрешён доступ. Разрешите его в меню Permissions артефакта.',
  errApproval: 'Нужно ваше разрешение: подтвердите его в Claude и нажмите ещё раз.',
  errCancelled: 'Отменено.',
  errRefused: 'Плагин отказал: {message}',
  errFull: 'Хранилище карточки переполнено: откройте «art day» в чате, чтобы перенести оценки.',
  errSave: 'Не удалось сохранить ({code}). Попробуйте ещё раз.',
  toolBrief: 'Сводка вкуса', toolBegin: 'Начать подбор', toolSearch: 'Поиск в Wikimedia Commons', toolPick: 'Случайный выбор по вкусу',
  toolLook: 'Рассмотреть кандидата', toolPublish: 'Опубликовать картину дня', toolRate: 'Оценить картину',
  toolCard: 'Карточка для закреплённого артефакта', toolSchedule: 'Включить или выключить подбор', toolLanguage: 'Язык Art Day',
  textNoCard: 'Картина дня ещё не подобрана.',
  textSource: 'Источник: {url} · {rights}',
  textRating: 'Оценка: {rating}', textFavorite: 'в избранном',
  textIssue: 'Выпуск за {date}.', textStale: 'Это выпуск за {date}. На {today} картина ещё не подобрана.',
  profileTitle: 'Мой вкус', profileShown: 'Показанные работы',
  profileHead: 'Дата | Работа | Автор | Источник | Оценка | Избранное', yes: 'да',
};

export const BUILT_IN = {en: EN, ru: RU};
export const SOURCE_STRINGS = EN;
const MAX_LABEL = 300;

/** A language tag in any spelling (`ru_RU.UTF-8`, `en-GB`) → `{tag, base}`, or null when it names no language. */
export function parseLanguage(value) {
  const raw = String(value || '').split(/[.@]/)[0].replace(/_/g, '-').trim();
  if (!raw || /^(c|posix)$/i.test(raw)) return null;
  try {
    const locale = new Intl.Locale(raw);
    return {tag: locale.baseName, base: locale.language};
  } catch { return null; }
}

/**
 * The language set in the operating system. `ART_DAY_LANG` overrides it; on macOS it is the first entry of
 * the system's language list, elsewhere the locale of the environment, then the one Node itself resolved.
 */
export function systemLanguage({env = process.env, platform = process.platform, run = execFileSync} = {}) {
  const fixed = parseLanguage(env.ART_DAY_LANG);
  if (fixed) return fixed;
  if (platform === 'darwin') {
    try {
      const first = String(run('defaults', ['read', '-g', 'AppleLanguages'], {encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']})).match(/[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*/);
      const found = parseLanguage(first?.[0]);
      if (found) return found;
    } catch { /* fall through to the environment */ }
  }
  if (platform !== 'win32') {
    for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
      const found = parseLanguage(env[name]);
      if (found) return found;
    }
  }
  return parseLanguage(Intl.DateTimeFormat().resolvedOptions().locale) || {tag: 'en', base: 'en'};
}

/** The language's English name, for the model that writes the day's texts. */
export function languageName(tag) {
  try { return new Intl.DisplayNames(['en'], {type: 'language'}).of(tag) || tag; } catch { return tag; }
}

const holes = text => (String(text).match(/\{[a-z]+\}/g) || []).sort().join();

/** A translated dictionary as Claude sent it → only known keys, bounded strings, the same placeholders. */
export function checkLabels(labels) {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) throw new Error('labels must be an object of translated strings.');
  const clean = {};
  for (const [key, value] of Object.entries(labels)) {
    if (!(key in EN)) throw new Error('Unknown label: ' + key);
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_LABEL) throw new Error('Label must be a short non-empty string: ' + key);
    if (holes(value) !== holes(EN[key])) throw new Error('Label must keep the placeholders of the source: ' + key);
    clean[key] = value;
  }
  return clean;
}

/** The dictionary for a language: built in, or the stored translation over English. */
export function stringsFor(base, custom = null) {
  return {...EN, ...(BUILT_IN[base] || custom || {})};
}

/** True when the language has neither a built-in nor a complete stored dictionary. */
export function needsLabels(base, custom = null) {
  return !BUILT_IN[base] && !Object.keys(EN).every(key => custom?.[key]);
}

/** Fills `{name}` placeholders. */
export const fill = (text, values = {}) => String(text).replace(/\{([a-z]+)\}/g, (hole, name) => (name in values ? String(values[name]) : hole));

/**
 * A trait in any spelling the cards or older data may send — a key, or its name in a known language —
 * → its key, or null. Collections written before languages existed hold the Russian names.
 */
export function traitKey(value, custom = null) {
  const wanted = String(value || '').trim().toLowerCase();
  if (TRAIT_KEYS.includes(wanted)) return wanted;
  for (const dictionary of [...Object.values(BUILT_IN), custom || {}]) {
    const key = TRAIT_KEYS.find(trait => String(dictionary['trait_' + trait] || '').toLowerCase() === wanted);
    if (key) return key;
  }
  return null;
}

/** Length in words; for scripts written without spaces, two characters count as a word. */
export function wordCount(value) {
  const text = String(value || '').trim();
  const dense = (text.match(/[฀-๿぀-ヿ㐀-鿿]/g) || []).length;
  return dense > text.length / 3 ? Math.round(dense / 2) : text.split(/\s+/).filter(Boolean).length;
}
