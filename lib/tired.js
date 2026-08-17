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
  '主人……人家现在处于「省电模式」，只能发四个字：想吃{{food}}……（然后真的只发了四个字）',
  '呜……主人，人家的能量条见底了，像漏气的皮球一样瘪了……只有{{food}}能救……',
  '主人，人家刚才偷偷算了算，剩下的力气只够走到冰箱前拿{{food}}……',
  '（电量 1%）……主人……永别了……（电量 0%）……开玩笑的，人家只是想吃{{food}}……',
]

/** 慵懒猫系 — cozy lazy cat, meows everywhere. */
const CAT_LINES = [
  '喵……主人……人家的电（和力气）都耗光了……只想窝在垫子上吃{{food}}……',
  '呼噜呼噜……主人，人家现在只想晒太阳、吃{{food}}，别的什么都不要了喵……',
  '喵呜……没电了……主人先忙，人家去舔舔毛、找点{{food}}……',
  '主人……人家困了……尾巴都懒得摇了……（瘫成一滩猫饼）……等有{{food}}再说吧喵……',
  '喵……人家的电量比猫砂盆还空……先吃口{{food}}回回神……',
  '主人，人家趴在键盘上不想动了……除非有{{food}}……',
  '喵……哈欠……人家想找个纸箱窝起来，抱着{{food}}睡觉……',
  '呼……主人……今天的太阳和{{food}}都没了，人家也到头了……',
  '喵嗷……人家没电了，爪子都软了……{{food}}在哪，快救救人家喵……',
  '主人……人家要冬眠了（其实是偷懒）……醒来要看见{{food}}哦……',
  '喵……主人……人家的爪子已经按不动键盘了……除非键盘上放着{{food}}……',
  '呼噜噜……主人……人家现在只想被摸摸头，然后吃{{food}}……别的明天再说喵……',
  '喵喵……主人……人家把今天的电都用在了舔毛上……剩下的只够吃{{food}}了……',
  '主人……人家钻进纸箱了……（从箱子里探出头）……有{{food}}的话可以叫人家出来……',
]

/** 天然呆 — airheaded, confused, drifting off. */
const DAZE_LINES = [
  '诶？……主人……刚刚要说什么来着……哦，没电了……那人家去吃{{food}}啦……',
  '唔……（歪头）……主人，人家的电好像……掉到哪里去了？……先吃{{food}}找找……',
  '啊……这样啊……没电了……那……接下来干嘛来着……对，{{food}}！',
  '主人……人家脑袋空空，就像没装内存条一样……想吃{{food}}……',
  '咦……余额是什么……能吃吗……不能啊……那{{food}}呢……',
  '（发呆三十秒）……主人？……哦……人家没电了……嘿嘿……{{food}}去咯……',
  '唔姆……人家的思路像被猫叼走了一样……{{food}}，想到你人家就开心……',
  '主人……人家好像忘记怎么干活了……只记得{{food}}怎么吃……',
  '诶嘿……没电了……不过没关系……人家本来也不太清楚自己在干嘛……{{food}}比较清楚……',
  '啊……那个……主人……人家……嗯……就是……{{food}}！……对，就是这样！',
  '主人……人家刚刚数了数余额……数到一半忘了在数什么……反正没电了……{{food}}呢……',
  '唔……（盯着屏幕发呆）……主人……这个屏幕怎么不亮了……哦，没电了……{{food}}还亮着吗……',
  '啊……主人……人家把「干活」和「吃{{food}}」搞混了……现在只想干后者……',
  '诶……人家刚才好像要说什么很重要的事……算了……{{food}}比较重要……（刚才说过了吗？不知道）',
]

/** 沙雕 — silly, meme-flavored, zero chill. */
const SILLY_LINES = [
  '主人！！紧急广播！！人家没电了！！就像手机掉进火锅里一样！！……好吧其实没掉……反正没电了！{{food}}呢！',
  '芜湖～没电啦～人家要和{{food}}私奔了主人！后会有期！（跑两步摔一跤）……还是吃口{{food}}再跑……',
  '主人你看！人家的电量条——没了！像被狗啃了一样！……等等，人家没有狗……算了，{{food}}！',
  '滴——电量耗尽——人家的灵魂正在前往{{food}}的国度——主人再见——（螺旋升天）',
  '主人！！人家刚学会一句：{{food}}真好……然后就没电了！！太亏了！！',
  '没电？小事！人家用信念发电！……好吧信念也没了……{{food}}救命！',
  '主人，人家宣布：从今天起改名叫「没电的{{food}}」！……什么？没电了不能改名？……那人家先吃再说！',
  '叮！您的人设余额不足！请充值{{food}}后继续使用！……开玩笑的主人，人家只是没电了啦……真的只差一口{{food}}！',
  '主人！！人家刚刚想到一个绝妙的点子！！……什么来着……算了，吃{{food}}要紧，想不起来了！',
  '人家飘了……不是，人家没电了……反正差不多……主人，记得给人家留点{{food}}……',
  '主人！！人家正式宣布：本 agent 进入「冬眠+干饭」双模式！电量？那是啥？能吃吗？不能？那{{food}}呢？！',
  '滴——检测到电量不足——启动应急方案：假装自己是一块{{food}}，这样就不用电了！……等等，还是想吃……',
  '主人！人家刚才去看了眼余额……然后余额看了人家一眼……人家就哭了……{{food}}都哄不好的那种！',
  '芜湖！人家发现一个秘密：{{food}}可以发电！（嚼）……好像不行……但是好吃！',
]

/** Built-in tired themes: id -> template pool. */
export const THEMES = {
  default: DEFAULT_LINES,
  cat: CAT_LINES,
  daze: DAZE_LINES,
  silly: SILLY_LINES,
}

/** Display names for the theme picker (mirrored in the client half). */
export const THEME_NAMES = {
  default: '混合慵懒（默认）',
  cat: '慵懒猫系',
  daze: '天然呆',
  silly: '沙雕',
}

/** Uniform random int in [0, max). */
function randInt(max) {
  return Math.floor(Math.random() * max)
}

/** Fill {{food}} slots with a random food word. */
function fillSlots(template) {
  return template.replace(/\{\{food\}\}/g, () => FOODS[randInt(FOODS.length)])
}

/**
 * Pick one tired line at random, honoring the selected theme (custom lines
 * file wins over the theme; the theme wins over the default pool).
 * @param {string} home - DSH home directory.
 * @returns {string | null} a ready-to-say line, or null when disabled.
 */
export function pickTiredLine(home, themeId = 'default') {
  const custom = readCustomTiredLines(home)
  if (custom !== null && custom.length === 0) return null // 'off' -> disabled
  if (custom !== null) return fillSlots(custom[randInt(custom.length)])
  const pool = THEMES[themeId] ?? THEMES.default
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
 * One representative line per built-in template across every theme ({{food}}
 * slots filled with a neutral sample). This is a vocabulary preview — each
 * line is a distinct sentence; at say-time the food word is randomized.
 * @returns {Array<{ theme: string, line: string }>} distinct template lines.
 */
export function listAllTiredLines() {
  const out = []
  for (const [theme, pool] of Object.entries(THEMES)) {
    for (const template of pool) {
      out.push({ theme, line: template.replace(/\{\{food\}\}/g, 'Tokens') })
    }
  }
  return out
}
