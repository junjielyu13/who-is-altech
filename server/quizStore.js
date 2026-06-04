import { promises as fs } from 'node:fs'

let counter = 0
function genId() {
  counter += 1
  return `q${counter}_${process.hrtime.bigint().toString(36)}`
}

export class QuizStore {
  constructor(filePath) {
    this.filePath = filePath
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      return JSON.parse(raw)
    } catch (err) {
      if (err.code === 'ENOENT') return { questions: [] }
      throw err
    }
  }

  async save(quiz) {
    await fs.writeFile(this.filePath, JSON.stringify(quiz, null, 2), 'utf8')
  }

  async addQuestion({ photoFile, answer, aliases = [], grid = { rows: 4, cols: 4 }, intervalMs = 3000 }) {
    if (!photoFile) throw new Error('缺少照片')
    if (!answer || !String(answer).trim()) throw new Error('缺少正确答案')
    const quiz = await this.load()
    const q = { id: genId(), photoFile, answer: String(answer).trim(), aliases, grid, intervalMs }
    quiz.questions.push(q)
    await this.save(quiz)
    return q
  }
}
