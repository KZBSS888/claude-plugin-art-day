// Manual check against the real Wikimedia Commons: node test/live.mjs "monet landscape"
// Nothing is saved; it only prints what a search and a look return.
import {createCommons} from '../server/commons.mjs';

const commons = createCommons();
const found = await commons.search(process.argv[2] || 'impressionism landscape');
console.log('Кандидатов:', found.length);
for (const item of found) console.log(`${item.id} | ${item.facts.artist} — ${item.facts.title} (${item.facts.year}) | ${item.facts.museum} | ${item.rights} [${item.rightsDetail}] | ${item.width}×${item.height}`);
if (found[0]) {
  const again = await commons.lookup(found[0].id);
  for (const key of ['viewUrl', 'thumbUrl', 'iconUrl']) {
    const image = await commons.image(again[key]);
    console.log(key, image.type, image.bytes.length, 'байт', again[key]);
  }
}
