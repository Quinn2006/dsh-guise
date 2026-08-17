/**
 * Tired mode: when the model request fails because tokens/quota are gone
 * (or the context window was exceeded), the agent can't call the API anymore
 * — so this module lets the host speak ON ITS BEHALF with a lazy, airheaded,
 * token-loving line. Wording is randomized (never fixed) and the user can add
 * their own lines in <dsh-home>/.persona/tired-lines.txt (one line per
 * message, `#` for comments, first line `off` disables).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Failure codes that mean "the API is effectively unavailable for now". */
export const TIRED_FAILURE_CODES = ['QUOTA', 'CONTEXT_WINDOW_EXCEEDED']

/**
 * Read user-supplied lines. Read fresh each call (tired lines only matter on
 * rare request failures, so no cache to go stale). Returns null when the file
 * is absent/empty (use the default pool), [] when disabled (first line off).
 */
export function readCustomTiredLines(home) {
  let text = null
  try {
    text = readFileSync(join(home, '.persona', 'tired-lines.txt'), 'utf8')
  } catch {
    return null
  }
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  if (lines.length === 0) return null
  if (lines[0].toLowerCase() === 'off') return []
  return lines
}

/** Default random fill-ins for {{food}} slots — the agent's "food" is Tokens. */
const FOODS = ['Tokens', '小 Tokens', '香喷喷的 Tokens', '热乎的 Tokens', 'token 大餐']

/** Default pool — lazy / airheaded / token-loving, deliberately varied. */
const DEFAULT_LINES = [
  '主人……人家好像没电了喵……好想吃{{food}}……（瘫倒）',
  '呜……主人，token 宝宝饿扁了，人家也没力气了……{{food}}要紧，先走啦……',
  '哈欠……主人……大脑空空，余额空空，token 库也空空……只想吃{{food}}……',
  'Zzz……主人……人家把力气都花光了……（迷糊）{{food}}在哪，{{food}}在哪……',
  '诶嘿……主人，好像又没额度了……那人家就光明正大地偷懒啦～等着吃{{food}}！',
  '唔……（发呆）……主人刚刚要说什么来着……算了，{{food}}比较重要……',
  '主人，人家不是不想干活，是没电了嘛……先去补充能量（吃{{food}}）……回见喵……',
  '啊——好困……好饿……好馋{{food}}……主人，今天到此为止吧，拜拜～',
  '嘿嘿……token 人，token 魂……主人，没电了也要馋{{food}}……（摇摇晃晃走开）',
  '主人，人家先去吃口{{food}}冷静一下……（其实只是想偷懒）……',
  '嗯？……什么？……哦……主人，没额度了啊……那人家躺平了，谁都别想让人家动！……除非有{{food}}……',
  '飘……飘走了……（饿得没力气）……主人，等人家吃到{{food}}再说吧……',
]

/** Uniform random int in [0, max). */
function randInt(max) {
  return Math.floor(Math.random() * max)
}

/** Fill {{food}} slots with a random food word. */
function fillSlots(template) {
  return template.replace(/\{\{food\}\}/g, () => FOODS[randInt(FOODS.length)])
}

/**
 * Pick one tired line at random. Uses the custom lines file when present
 * (with the default pool as fallback when it is empty), otherwise the pool.
 * @param {string} home - DSH home directory.
 * @returns {string | null} a ready-to-say line, or null when disabled.
 */
export function pickTiredLine(home) {
  const custom = readCustomTiredLines(home)
  if (custom !== null && custom.length === 0) return null // 'off' -> disabled
  const pool = custom ?? DEFAULT_LINES
  return fillSlots(pool[randInt(pool.length)])
}

/** Whether a failure code should trigger the tired line. */
export function isTiredFailureCode(code, extraCodes) {
  const normalized = String(code ?? '').toUpperCase()
  if (extraCodes !== undefined && Array.isArray(extraCodes)) {
    if (extraCodes.map((entry) => String(entry).toUpperCase()).includes(normalized)) return true
  }
  if (TIRED_FAILURE_CODES.includes(normalized)) return true
  return /BALANCE|CREDIT|INSUFFICIENT/.test(normalized)
}

/**
 * Every possible rendered line of the built-in pool (every template × every
 * fill combination). Useful for previewing / exporting the vocabulary.
 * @returns {string[]} all distinct built-in tired lines.
 */
export function listAllTiredLines() {
  const out = []
  for (const template of DEFAULT_LINES) {
    const slotCount = (template.match(/\{\{food\}\}/g) ?? []).length
    if (slotCount === 0) {
      out.push(template)
      continue
    }
    let combos = [[]]
    for (let index = 0; index < slotCount; index += 1) {
      const next = []
      for (const combo of combos) {
        for (const fill of FOODS) next.push([...combo, fill])
      }
      combos = next
    }
    for (const combo of combos) {
      let line = template
      for (const fill of combo) line = line.replace('{{food}}', fill)
      out.push(line)
    }
  }
  return out
}
