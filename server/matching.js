export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // 去标点（保留字母/数字/空白）
    .trim()
    .replace(/\s+/g, ' ')
}

export function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      // count adjacent transpositions (Damerau extension) as 1 edit
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
      }
    }
  }
  return dp[m][n]
}

export function isCorrect(guess, answers, options = {}) {
  const { maxEdits = 1 } = options
  const g = normalize(guess)
  if (!g) return false
  return answers.some((ans) => {
    const a = normalize(ans)
    if (!a) return false
    if (a === g) return true
    return levenshtein(a, g) <= maxEdits
  })
}
