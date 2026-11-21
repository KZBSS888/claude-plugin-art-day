// Manual end-to-end check of the server connection against the real Wikimedia Commons.
// Start the server first, then: node test/e2e.mjs http://127.0.0.1:8787/mcp/<ART_DAY_TOKEN>
const url = process.argv[2];
let id = 0;

async function rpc(method, params) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: ++id, method, params})});
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}
const tool = async (name, args = {}) => {
  const result = await rpc('tools/call', {name, arguments: args});
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return result;
};

console.log('сервер:', (await rpc('initialize', {protocolVersion: '2025-06-18'})).serverInfo.title);
console.log('инструментов:', (await rpc('tools/list')).tools.length);
console.log('попытка:', (await tool('art_day_begin')).content[0].text);
const {candidates} = (await tool('art_day_search', {query: process.argv[3] || 'impressionism landscape'})).structuredContent;
console.log('кандидатов:', candidates.length);
const picked = (await tool('art_day_pick', {candidates: candidates.slice(0, 8).map(c => ({id: c.id, artist: c.artist, tags: ['landscape']}))})).structuredContent;
const chosen = candidates.find(c => c.id === picked.chosenId);
console.log('выбрано:', chosen.artist, '—', chosen.title);
const look = await tool('art_day_look', {id: chosen.id});
console.log('репродукция для просмотра:', look.content[1].mimeType, Math.round(look.content[1].data.length * 0.75 / 1024), 'КБ');
const story = Array(80).fill('слово').join(' '), detail = Array(30).fill('слово').join(' ');
console.log('публикация:', (await tool('art_day_publish', {id: chosen.id, title: chosen.titleLocal || chosen.title, story, detail, tags: ['landscape', 'test']})).content[0].text);
console.log('оценка:', (await tool('art_day_rate', {id: chosen.id, rating: 5, favorite: true})).structuredContent.pref);
const view = (await tool('art_day_open')).structuredContent;
console.log('карточка:', view.card.title, '|', view.card.artist, '|', view.card.year, '|', view.card.museum, '|', view.card.rights, '| устарела:', view.stale);
console.log('изображение:', view.card.viewUrl);
console.log('значок в serverInfo:', ((await rpc('initialize', {})).serverInfo.icons?.[0]?.src || 'нет').slice(0, 40));
console.log('повторная публикация:', (await tool('art_day_publish', {id: chosen.id, title: 'x', story, detail, tags: ['a', 'b']})).content[0].text);
