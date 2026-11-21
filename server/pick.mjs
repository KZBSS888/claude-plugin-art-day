// Weighted random choice. The draw happens here, in code, so taste shifts the odds
// without ever fixing the outcome, and every candidate keeps a real chance.
const FLOOR = 0.25;

/** One weight per candidate from tag and artist scores; few ratings mean a weaker pull. */
export function weigh(candidates, taste) {
  const tags = new Map((taste?.tags || []).map(tag => [tag.name.toLowerCase(), tag.weight]));
  const artists = new Map((taste?.artists || []).map(artist => [artist.name.toLowerCase(), artist.weight]));
  const pull = (taste?.ratedCount || 0) < 5 ? 0.15 : 0.35;
  return candidates.map(candidate => {
    let score = artists.get(String(candidate.artist || '').toLowerCase()) || 0;
    for (const tag of new Set((candidate.tags || []).map(tag => String(tag).toLowerCase()))) score += tags.get(tag) || 0;
    score = Math.max(-6, Math.min(6, score));
    return Math.max(FLOOR, Math.exp(score * pull));
  });
}

/** Draws one index in proportion to the weights. */
export function draw(weights, random = Math.random) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let point = random() * total;
  for (let index = 0; index < weights.length; index++) {
    point -= weights[index];
    if (point < 0) return index;
  }
  return weights.length - 1;
}
