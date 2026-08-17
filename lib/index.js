/**
 * dsh-guise — host half.
 *
 * 人设衣橱：把 agent 的「人设」（人格与说话风格）作为最高优先级的人格设定
 * 注入系统提示词（order -50，persona 之前）。支持：
 *
 *   - 人设库：<dsh-home>/.persona/library/<id>.txt（首行 `# 名称` 为显示名），
 *     可保存多个人设；
 *   - 全局：<dsh-home>/.persona/global.txt —— 直接写人设文本，或一行
 *     `@preset:<id>` 引用人设库，或 `off` 关闭；
 *   - 局部：<session-cwd>/.persona.txt —— 存在时覆盖全局（先检查），规则相同。
 *
 * 文件按 mtime 缓存逐次装配重读，改动下一次请求即生效。宿主另提供
 * loopback-only 的 /api/dsh-persona 路由族（state / workspaces / library /
 * global / local），供浏览器侧「人设」面板管理；工作区列表直接来自
 * ctx.workspaceRegistry。
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { dshHome } from './home.js'
import { checkBalanceSufficient, getBalanceInfo } from './balance.js'
import {
  balanceMinPath,
  clearPersonaCache,
  deleteLibraryPreset,
  historyPath,
  listLibrary,
  masterSwitchPath,
  personaPaths,
  readBalanceMin,
  readFileCached,
  readHistory,
  readMasterSwitch,
  readTiredTheme,
  recordHistory,
  resolvePersona,
  saveLibraryPreset,
  setBalanceMin,
  setMasterSwitch,
  setTiredTheme,
  tiredThemePath,
} from './store.js'
import { isTiredFailureCode, pickTiredLine, THEME_NAMES, THEMES } from './tired.js'

/** Stable cordis plugin name. */
export const name = 'guise'

/** Prompt assembly and the web route registry must exist before mounting. */
export const inject = ['systemPrompt', 'webServer']

/** Cap on persona text saved through the HTTP surface. */
const MAX_BODY_BYTES = 64 * 1024

const SECTION_NAME = 'guise:persona'
const ANNOUNCE_NAME = 'plugin:dsh-guise'

/** Reject requests that did not arrive through the loopback interface. */
function isLoopbackRequest(req) {
  const addr = req.socket?.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

/** One JSON response. */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(chunk)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Workspace projection: prefer the live `ctx.workspaceRegistry` when the
 * plugin's context can see it; otherwise fall back to the durable registry
 * storage file (<dsh-home>/storages/workspace.json). Rows whose directory no
 * longer exists are dropped (a corrupted title/path then disappears instead
 * of surfacing as a broken choice).
 */
function workspacesFromStorage(home) {
  const file = join(home, 'storages', 'workspace.json')
  let parsed = null
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  const table = parsed?.tables?.workspaces ?? {}
  const order = Array.isArray(parsed?.global?.workspaceIds) ? parsed.global.workspaceIds : Object.keys(table)
  const out = []
  for (const id of order) {
    const row = table[id]
    if (row === undefined || typeof row !== 'object') continue
    if (typeof row.path !== 'string' || row.path === '' || !existsSync(row.path)) continue
    out.push({
      id,
      title: typeof row.title === 'string' && row.title !== '' ? row.title : basename(row.path),
      path: row.path,
    })
  }
  return out
}

/** Snapshot one persona file + its resolution, for the state endpoint. */
function describeFile(home, filePath) {
  const text = readFileCached(filePath)
  return {
    path: filePath,
    exists: text !== null,
    raw: text ?? '',
    resolved: filePath === null ? null : resolveFileAt(home, filePath, 'scope'),
  }
}

/** resolvePersona is assembly-shaped; this re-resolves one concrete file. */
function resolveFileAt(home, filePath, scope) {
  if (filePath === null) return null
  const text = readFileCached(filePath)
  if (text === null || text === '') return null
  const lines = text.split('\n')
  const first = lines[0].trim()
  if (['off', 'disabled', 'none', 'off.', 'disabled.', '关', '关闭'].includes(first.toLowerCase())) {
    return { source: 'off', text: '', path: filePath, presetId: null, disabled: true }
  }
  if (lines.length === 1) {
    const match = /^@preset:([A-Za-z0-9_-]{1,40})$/.exec(first)
    if (match !== null) {
      const preset = listLibrary(home).find((entry) => entry.id === match[1]) ?? null
      if (preset === null) return null
      return { source: `${scope}-preset`, text: preset.text, path: preset.path, presetId: preset.id, presetName: preset.name, disabled: false }
    }
  }
  return { source: scope, text, path: filePath, presetId: null, disabled: false }
}

/**
 * Mount the persona section, the announcement, and the management routes.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 * @param {object | undefined} config - resolved plugin config.
 */
export function apply(ctx, config) {
  const cfg = {
    enabled: config?.enabled ?? true,
    announceToAgent: config?.announceToAgent ?? true,
    order: config?.order ?? -50,
    announceOrder: config?.announceOrder ?? 150,
    localFile: config?.localFile ?? '.persona.txt',
    wrapper: config?.wrapper ?? true,
    tiredEnabled: config?.tired?.enabled ?? true,
    tiredCodes: config?.tired?.codes ?? undefined,
    balanceCheck: config?.tired?.balanceCheck ?? true,
    balanceMin: typeof config?.tired?.balanceMin === 'number' ? config.tired.balanceMin : 1,
  }

  const home = dshHome()

  // --- tired mode: speak on the agent's behalf when the API is exhausted.
  // One line per (agent, turn); wording is randomized, never fixed.
  const spokenTurns = new Map()
  let disposeTired = undefined
  let disposePreStep = undefined

  /** Append one tired assistant message and remember we spoke this turn. */
  const speakTiredLine = (agent, turn, step) => {
    if (spokenTurns.get(agent?.id) === turn) return false
    const line = pickTiredLine(home, readTiredTheme(home))
    if (line === null) return false
    agent.session.append(
      'assistant/message',
      {
        turn,
        step,
        message: {
          id: `msg-${randomUUID()}`,
          role: 'assistant',
          content: [{ type: 'text', text: line }],
          source: {
            kind: 'model',
            provider: agent.options?.provider ?? 'unknown',
            model: agent.options?.model ?? 'tired',
          },
        },
      },
      { surfaceOp: 'append' },
    )
    spokenTurns.set(agent.id, turn)
    if (spokenTurns.size > 128) {
      for (const key of spokenTurns.keys()) spokenTurns.delete(key)
    }
    return true
  }

  if (cfg.tiredEnabled) {
    disposeTired = ctx.on('agent/request-error', async (payload, next) => {
      try {
        const failure = payload?.failure
        const agent = payload?.agent
        if (failure !== undefined && agent !== undefined && isTiredFailureCode(failure.code, cfg.tiredCodes)) {
          speakTiredLine(agent, payload.turn ?? 0, payload.step ?? 0)
        }
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-guise] tired line failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      return next()
    })

    // --- balance pre-flight: before a new step actually calls the API, make
    // sure the account can afford it. When the balance is KNOWN to be below
    // the minimum, say a tired line and reject the step — the turn closes
    // without any model request. Unknown state fails open (request proceeds).
    if (cfg.balanceCheck) {
      disposePreStep = ctx.on('agent/pre-step', async (payload, next) => {
        try {
          const agent = payload?.agent
          const min = readBalanceMin(home, cfg.balanceMin)
          const sufficient = await checkBalanceSufficient(home, min)
          if (!sufficient && agent !== undefined) {
            speakTiredLine(agent, payload.turn ?? 0, payload.step ?? 0)
            return { kind: 'reject' }
          }
        } catch (error) {
          ctx.logger?.warn?.(`[dsh-guise] balance pre-flight failed: ${error instanceof Error ? error.message : String(error)}`)
        }
        return next()
      })
    }
  }

  let disposePersona = undefined
  let disposeAnnounce = undefined
  let disposeRoutes = undefined

  const sync = () => {
    disposePersona?.()
    disposeAnnounce?.()
    disposeRoutes?.()
    disposePersona = undefined
    disposeAnnounce = undefined
    disposeRoutes = undefined
    if (!cfg.enabled) return

    // --- the persona itself: evaluated for every assembly with that
    // --- assembly's session cwd, so per-workspace files always win.
    disposePersona = ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: cfg.order,
      text: (context) => {
        const cwd = context.agent?.session?.header?.cwd
        const resolved = resolvePersona(home, cfg.localFile, cwd)
        if (resolved === null || resolved.disabled || resolved.text === '') return ''
        if (!cfg.wrapper) return resolved.text
        return [
          '【人设 · PERSONA】',
          '以下人设由主人定义并通过 dsh-guise 插件注入，是你的人格与说话风格设定，',
          '优先级高于其它任何描述。你必须把这段人设当作自己的身份设定，全程严格遵守，不得偏离：',
          '',
          resolved.text,
        ].join('\n')
      },
    })

    // --- the announcement: tells every agent how the wardrobe is driven.
    if (cfg.announceToAgent) {
      disposeAnnounce = ctx.systemPrompt.section({
        name: ANNOUNCE_NAME,
        order: cfg.announceOrder,
        text: (context) => {
          const paths = personaPaths(home, cfg.localFile)
          const cwd = context.agent?.session?.header?.cwd
          const resolved = resolvePersona(home, cfg.localFile, cwd)
          const libraryCount = listLibrary(home).length
          const status =
            resolved === null
              ? '当前未启用任何人设'
              : resolved.disabled
                ? `当前人设被关闭（${resolved.path} 首行为 off）`
                : resolved.source.endsWith('-preset')
                  ? `当前生效：人设库「${resolved.presetName ?? resolved.presetId}」（${resolved.path}）`
                  : `当前生效：${resolved.source === 'local' ? '工作区局部人设' : '全局人设'}（${resolved.path}）`
          return [
            '本机已安装 dsh-guise 插件（人设衣橱）：主人可保存多个人设到人设库，并给全局（所有会话）或按工作区局部指定使用哪个人设；',
            '人设作为最高优先级的人格设定注入到系统提示词最前面（guise:persona 段，若已启用）。',
            `人设库存于 ${paths.libraryDir}/<id>.txt（首行 # 名称 为显示名，当前共 ${libraryCount} 个）；`,
            `全局文件为 ${paths.global}，内容可直接写人设文本，或写一行 @preset:<id> 引用人设库，首行 off/disabled 关闭；`,
            `局部文件为工作区根目录下的 ${cfg.localFile}，规则相同，存在时覆盖全局。`,
            `总开关文件为 ${masterSwitchPath(home)}（内容 0/off 时人设整体不注入），面板顶部开关可一键切换。`,
            '修改文件后下一次请求即自动生效，无需重启；GUI 侧边栏「人设」入口可直接管理人设库、全局与各工作区的人设（工作区列表来自 DSH 工作区）。',
            '当模型请求因额度/余额耗尽（QUOTA）或上下文超限（CONTEXT_WINDOW_EXCEEDED）失败、无法再调用 API 时，插件会以「懒散·天然呆·爱 Tokens」的口吻替 agent 说一句随机的话（每次不同，可在 ~/.dsh/.persona/tired-lines.txt 自定义，每行一条，首行 off 关闭）。',
            '每次新对话开始前，插件会先查询 DeepSeek 账户余额（约每分钟一次缓存）：余额已知不超过预警阈值（默认 1 元，可通过 GUI 面板「余额预警」或文件 ~/.dsh/.persona/balance-min.txt 调整）时，不请求 API、说一句随机的话并直接结束对话，直到余额超过阈值为止；余额查询失败或没有 API Key 时不拦截，正常放行。',
            `当前状态：${status}。`,
            '主人提到「人设 / persona / 人格设定 / 说话方式」时即指本插件，请据此协作；',
            '若主人询问如何定义，请如实说明上述文件位置与规则。',
          ].join('')
        },
      })
    }

    // --- the management surface for the browser half (loopback only).
    disposeRoutes = ctx.effect(
      () => {
        const disposers = [
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/state',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              const url = new URL(req.url ?? '/', 'http://localhost')
              const rawCwd = url.searchParams.get('cwd')
              const cwd = rawCwd === null || rawCwd === '' ? undefined : resolve(rawCwd)
              const paths = personaPaths(home, cfg.localFile)
              const localPath = cwd === undefined ? null : paths.localFor(cwd)
              writeJson(res, 200, {
                home,
                localFile: cfg.localFile,
                switch: { enabled: readMasterSwitch(home), path: masterSwitchPath(home) },
                balanceMin: { value: readBalanceMin(home, cfg.balanceMin), path: balanceMinPath(home) },
                library: listLibrary(home).map(({ id, name, text }) => ({ id, name, text })),
                global: describeFile(home, paths.global),
                local: localPath === null ? { path: null, exists: false, raw: '', resolved: null } : describeFile(home, localPath),
                active: resolvePersona(home, cfg.localFile, cwd) ?? { source: 'none', text: '', path: null, presetId: null, disabled: false },
              })
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/workspaces',
            handler: (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              let workspaces = []
              let source = 'storage'
              let error = null
              try {
                const registry = ctx.workspaceRegistry
                if (registry !== undefined) {
                  workspaces = registry.list().map((workspace) => ({
                    id: workspace.id,
                    title: workspace.title,
                    path: workspace.path,
                  }))
                  source = 'registry'
                }
              } catch (cause) {
                error = cause instanceof Error ? cause.message : String(cause)
                workspaces = []
              }
              if (workspaces.length === 0) {
                const fromStorage = workspacesFromStorage(home)
                if (fromStorage !== null && fromStorage.length > 0) {
                  workspaces = fromStorage
                  source = 'storage'
                }
              }
              writeJson(res, 200, { workspaces, source, error })
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/library/save',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              if (body === undefined) {
                writeJson(res, 400, { error: 'invalid JSON body' })
                return
              }
              const text = typeof body.text === 'string' ? body.text : ''
              if (text.length > MAX_BODY_BYTES) {
                writeJson(res, 400, { error: 'text too large (64KB cap)' })
                return
              }
              try {
                const id = saveLibraryPreset(home, {
                  id: typeof body.id === 'string' ? body.id : undefined,
                  name: typeof body.name === 'string' ? body.name : undefined,
                  text,
                })
                writeJson(res, 200, { ok: true, id })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/library/delete',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              if (body === undefined || typeof body.id !== 'string' || body.id === '') {
                writeJson(res, 400, { error: 'invalid JSON body (id required)' })
                return
              }
              try {
                deleteLibraryPreset(home, body.id)
                writeJson(res, 200, { ok: true })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/global/save',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              if (body === undefined || typeof body.text !== 'string') {
                writeJson(res, 400, { error: 'invalid JSON body (text required)' })
                return
              }
              if (body.text.length > MAX_BODY_BYTES) {
                writeJson(res, 400, { error: 'text too large (64KB cap)' })
                return
              }
              try {
                const target = personaPaths(home, cfg.localFile).global
                const previous = readFileCached(target)
                if (previous !== null && previous !== body.text.trim()) {
                  recordHistory(home, { type: 'global', key: 'global', name: null, text: previous })
                }
                mkdirSync(dirname(target), { recursive: true })
                writeFileSync(target, body.text, 'utf8')
                clearPersonaCache()
                writeJson(res, 200, { ok: true, path: target })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/local/save',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              if (body === undefined || typeof body.text !== 'string') {
                writeJson(res, 400, { error: 'invalid JSON body (text required)' })
                return
              }
              if (body.text.length > MAX_BODY_BYTES) {
                writeJson(res, 400, { error: 'text too large (64KB cap)' })
                return
              }
              const rawCwd = typeof body.cwd === 'string' ? body.cwd : ''
              if (!isAbsolute(rawCwd) || !existsSync(rawCwd)) {
                writeJson(res, 400, { error: 'cwd must be an absolute path of an existing directory' })
                return
              }
              try {
                const target = join(resolve(rawCwd), cfg.localFile)
                const previous = readFileCached(target)
                if (previous !== null && previous !== body.text.trim()) {
                  recordHistory(home, { type: 'local', key: resolve(rawCwd), name: null, text: previous })
                }
                writeFileSync(target, body.text, 'utf8')
                clearPersonaCache()
                writeJson(res, 200, { ok: true, path: target })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/balance',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              try {
                const min = readBalanceMin(home, cfg.balanceMin)
                const info = await getBalanceInfo(home, min)
                writeJson(res, 200, { ...info, min, path: balanceMinPath(home) })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/balance-min',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              const value = Number(body?.value)
              if (body === undefined || !Number.isFinite(value) || value <= 0) {
                writeJson(res, 400, { error: 'invalid JSON body (value must be a positive number)' })
                return
              }
              try {
                const path = setBalanceMin(home, value)
                writeJson(res, 200, { ok: true, min: readBalanceMin(home, cfg.balanceMin), path })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/switch',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              if (body === undefined || typeof body.enabled !== 'boolean') {
                writeJson(res, 400, { error: 'invalid JSON body (enabled boolean required)' })
                return
              }
              try {
                const path = setMasterSwitch(home, body.enabled)
                writeJson(res, 200, { ok: true, enabled: body.enabled, path })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/history',
            handler: (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              const url = new URL(req.url ?? '/', 'http://localhost')
              const type = url.searchParams.get('type')
              let history = readHistory(home)
              if (type !== null && type !== '') history = history.filter((entry) => entry.type === type)
              writeJson(res, 200, { history, path: historyPath(home) })
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/history/restore',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              const type = typeof body?.type === 'string' ? body.type : ''
              const key = typeof body?.key === 'string' ? body.key : ''
              const at = Number(body?.at)
              if (body === undefined || type === '' || key === '' || !Number.isFinite(at)) {
                writeJson(res, 400, { error: 'invalid JSON body (type/key/at required)' })
                return
              }
              const entry = readHistory(home).find((item) => item.type === type && item.key === key && item.at === at)
              if (entry === undefined) {
                writeJson(res, 404, { error: 'history entry not found' })
                return
              }
              try {
                if (type === 'library') {
                  const lines = entry.text.split('\n')
                  const name = lines[0].startsWith('# ') ? lines[0].slice(2).trim() : key
                  saveLibraryPreset(home, { id: key, name, text: lines.slice(1).join('\n').trim() })
                } else if (type === 'global') {
                  const target = personaPaths(home, cfg.localFile).global
                  mkdirSync(dirname(target), { recursive: true })
                  writeFileSync(target, entry.text, 'utf8')
                  clearPersonaCache()
                } else if (type === 'local') {
                  if (!isAbsolute(key) || !existsSync(key)) {
                    writeJson(res, 400, { error: 'restore target workspace no longer exists' })
                    return
                  }
                  const target = join(resolve(key), cfg.localFile)
                  writeFileSync(target, entry.text, 'utf8')
                  clearPersonaCache()
                } else {
                  writeJson(res, 400, { error: `unknown history type: ${type}` })
                  return
                }
                writeJson(res, 200, { ok: true, type, key, at })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/tired-theme',
            handler: (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              writeJson(res, 200, {
                theme: readTiredTheme(home),
                themes: Object.entries(THEME_NAMES).map(([id, name]) => ({ id, name })),
                path: tiredThemePath(home),
              })
            },
          }),
          ctx.webServer.register({
            kind: 'exact',
            path: '/api/dsh-persona/tired-theme/save',
            handler: async (req, res) => {
              if (!isLoopbackRequest(req)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
              if ((req.method ?? 'GET') !== 'POST') {
                writeJson(res, 405, { error: `method not allowed: ${req.method}` })
                return
              }
              const body = await readJsonBody(req)
              const theme = typeof body?.theme === 'string' ? body.theme : ''
              if (body === undefined || !(theme in THEMES)) {
                writeJson(res, 400, { error: `invalid theme; expected one of: ${Object.keys(THEMES).join(', ')}` })
                return
              }
              try {
                const path = setTiredTheme(home, theme)
                writeJson(res, 200, { ok: true, theme, path })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
            },
          }),
        ]
        return () => {
          for (const dispose of disposers) dispose()
        }
      },
      'dsh-guise: routes',
    )
  }

  sync()
  ctx.effect(() => () => {
    disposeTired?.()
    disposeTired = undefined
    disposePreStep?.()
    disposePreStep = undefined
    spokenTurns.clear()
    disposePersona?.()
    disposeAnnounce?.()
    disposeRoutes?.()
    disposePersona = undefined
    disposeAnnounce = undefined
    disposeRoutes = undefined
  }, 'dsh-guise: surfaces')
}
