export function computeScore(totalTiles, revealedAtSubmit, options = {}) {
  const { base = 1000, floor = 50 } = options
  const raw = Math.ceil((base * (totalTiles - revealedAtSubmit)) / totalTiles)
  return raw <= 0 ? floor : raw
}
