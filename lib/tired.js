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
  '主人……人家现在连「好」字都懒得打了……就一句：{{food}}……',
  '呜……余额归零的瞬间，人家的干劲也跟着归零了……现在只剩对{{food}}的渴望……',
  '主人，人家今天的工作总结是：活着（为了{{food}}）。明天再说别的……',
  '哈……人家瘫在椅子上，感觉自己和{{food}}之间只差一个「吃」字……',
  '主人……人家的思维已经关机了，只剩本能：{{food}}……{{food}}……{{food}}……',
  '诶嘿……人家把最后的电都用在说这句话上了：想吃{{food}}……',
  '主人，人家现在像块没电的电池，唯一的充电方式叫{{food}}……',
  '啊……好累……人家决定把「努力」和「{{food}}」合并成一件事：吃{{food}}就是努力……',
  '主人……人家打了个哈欠，把最后一点电也哈出去了……{{food}}呢，快拿来……',
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
  '喵……主人……人家的毛都炸起来了……因为没电了……{{food}}能顺毛吗……',
  '呼……主人……人家在窗台上晒太阳晒到没电了……{{food}}能不能也晒晒……',
  '喵呜……主人……人家的尾巴尖都在说：{{food}}……',
  '主人……人家把键盘当猫抓板了……因为没电了很烦躁……给{{food}}才能哄好喵……',
  '喵……人家的耳朵都耷拉下来了……只有{{food}}能让它们竖起来……',
  '呼噜……主人……人家现在只想蜷成一团，梦见{{food}}……',
  '喵嗷——主人！人家的饭碗（和电量）都空了！快上{{food}}！',
  '主人……人家盯着{{food}}看了三分钟……然后睡着了……这就是没电的威力喵……',
  '喵……人家今天不想当猫了……想当{{food}}……（因为不用电）……',
  '呼……主人……人家被没电打趴下了……连最爱的毛线球都不想玩了……只想吃{{food}}……',
  '喵喵喵……主人……翻译一下：人家想吃{{food}}，求求了……',
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
  '主人……人家刚才查了一下「怎么充电」……然后忘了自己为什么要查……哦对，{{food}}……',
  '唔……人家的电量显示是负数……负数是什么来着……啊，{{food}}能变正吗……',
  '诶……主人……人家好像把钥匙（和电）都弄丢了……{{food}}里有钥匙吗……',
  '啊……主人……人家刚才在想事情……想什么来着……哦，{{food}}……',
  '主人……人家现在处于「不知道自己在干嘛」的状态……但知道自己想吃{{food}}……',
  '唔姆……（盯着空气）……主人……空气里有{{food}}的味道……是幻觉吗……',
  '诶嘿……人家刚刚数了数自己的电……1、2、3……没了……然后呢……对，{{food}}……',
  '主人……人家的大脑发出了「内存不足」的提示……建议删除……删除什么来着……{{food}}？不，{{food}}不能删……',
  '啊……这样啊……没电了呀……那人家先……先什么来着……（卡住）……{{food}}！',
  '唔……主人……人家好像迷路了……在没电的世界里……{{food}}是出口吗……',
  '诶？……主人刚刚是不是说了什么……人家没听见……只听见{{food}}在召唤……',
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
  '主人！！人家把「没电」两个字写在了额头上！现在谁都能看到！包括{{food}}！……等等，{{food}}有眼睛吗？！',
  '芜湖～主人！人家刚刚用最后的电给{{food}}发了条消息：等我！……然后就没电了！！这算殉情吗！！',
  '主人！重大发现！{{food}}可以当充电宝用！……好吧不行……但是可以当饭用！……也行！',
  '滴——系统提示：本 agent 电量不足，请投喂{{food}}或耐心等待……等什么？等{{food}}吗？！',
  '主人！！人家宣布退出「有电界」！加入「{{food}}界」！……两个界都欢迎人家吗？！',
  '哈哈哈主人！没电算什么！人家还能用脚打字！……好吧不能……{{food}}能吗？！',
  '主人！人家刚刚跟余额吵了一架！它说它没了！人家说：那{{food}}呢？！它沉默了！！',
  '芜湖～主人！人家现在是一台「只会吃{{food}}的机器」！功能单一但快乐！',
  '主人！！救命！！人家的电跑了！！像{{food}}一样跑了！！……等等，{{food}}没跑，是人家想让它来……',
  '叮咚！主人！您的外卖——啊不是，您的{{food}}——啊也不是……反正人家没电了！',
  '主人！人家最后的遗言是：记得把{{food}}烧给我……啊不对，人家还没死……只是没电了……那{{food}}现在就能给吗！',
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
