import { promises as fs } from 'node:fs'

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i
export const DEFAULT_GRID = { rows: 4, cols: 4 }
export const DEFAULT_INTERVAL = 3000

// Build the quiz by scanning an uploads directory. Each image file becomes a question whose
// answer is the file name without its extension (e.g. "junjie.jpeg" → answer "junjie").
// Questions are ordered alphabetically by file name. No quiz.json involved.
export async function buildQuiz(uploadsDir, options = {}) {
  const grid = options.grid || DEFAULT_GRID
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL
  let names
  try {
    names = await fs.readdir(uploadsDir)
  } catch (err) {
    if (err.code === 'ENOENT') return { questions: [] }
    throw err
  }
  const images = names.filter((n) => IMAGE_RE.test(n)).sort()
  const questions = images.map((file) => ({
    id: file,
    photoFile: file,
    answer: file.replace(IMAGE_RE, ''),
    aliases: [],
    grid,
    intervalMs,
  }))
  return { questions }
}
