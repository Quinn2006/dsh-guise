/**
 * Usage accounting for the dsh-guise plugin: per-workspace and per-session
 * token totals plus an estimated CNY cost (tokens × configured unit prices),
 * persisted to <dsh-home>/.persona/usage.json. Feeds the composer banner
 * ("本对话消耗 …") and the workspace-dropdown annotations in the panel.
 *
 * The host observes `session/event`: every committed `assistant/message`
 * that carries a `usage` object adds its tokens to its own session and to
 * that session's workspace. Costs are ESTIMATES — DeepSeek does not return
 * a per-call cost, so the numbers are prompt/completion tokens × the unit
 * prices (defaults: DeepSeek list prices 2 / 8 CNY per 1M tokens).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readFileCached } from './store.js'

/** Default DeepSeek list prices, CNY per 1M tokens (input / output). */
export const DEFAULT_PRICES = Object.freeze({ input: 2, output: 8 })

/** Ledger schema version (future migrations read this). */
const LEDGER_VERSION = 1

/** In-memory ledger; null until the first read. */
let ledger = null

/** The usage ledger file: <home>/.persona/usage.json. */
export function usagePath(home) {
  return join(home, '.persona', 'usage.json')
}

/** The usage feature switch file: <home>/.persona/usage-enabled.txt. */
export function usageSwitchPath(home) {
  return join(home, '.persona', 'usage-enabled.txt')
}

/** A fresh empty ledger. */
function emptyLedger() {
  return { v: LEDGER_VERSION, workspaces: {} }
}

/**
 * Load the persisted ledger (missing/corrupt file → an empty ledger).
 * The ledger stays in memory after the first read; callers mutate it and
 * {@link persistLedger} flushes it back to disk.
 * @param {string} home - DSH home directory.
 * @returns {{ v: number, workspaces: Record<string, { total: { tokens: number, cost: number }, sessions: Record<string, { tokens: number, cost: number, updatedAt: number }> }> }}
 */
export function readUsageLedger(home) {
  if (ledger !== null) return ledger
  try {
    const parsed = JSON.parse(readFileSync(usagePath(home), 'utf8'))
    ledger =
      parsed !== null && typeof parsed === 'object' && parsed.workspaces !== null && typeof parsed.workspaces === 'object'
        ? parsed
        : emptyLedger()
  } catch {
    ledger = emptyLedger()
  }
  return ledger
}

/** Best-effort flush of the in-memory ledger. */
export function persistLedger(home) {
  if (ledger === null) return
  try {
    mkdirSync(dirname(usagePath(home)), { recursive: true })
    writeFileSync(usagePath(home), JSON.stringify(ledger), 'utf8')
  } catch {
    /* usage stats are best-effort — never fail a model response over them */
  }
}

/**
 * Normalize a provider usage object across the key spellings DSH adapters
 * produce: snake_case (`prompt_tokens`), generic camelCase (`promptTokens`),
 * and the DeepSeek wire shape (`inputTokens` / `cacheReadTokens` /
 * `outputTokens`). Cache-read tokens count as input (DeepSeek bills them at
 * the cache price, which the estimate folds into the input price).
 * @param {object} usage - the raw usage chunk carried by an assistant message.
 * @returns {{ prompt: number, completion: number, total: number }}
 */
export function normalizeUsage(usage) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = Number(usage?.[key])
      if (Number.isFinite(value) && value > 0) return value
    }
    return 0
  }
  const prompt = pick('prompt_tokens', 'promptTokens', 'inputTokens') + pick('cache_read_tokens', 'cacheReadTokens')
  const completion = pick('completion_tokens', 'completionTokens', 'outputTokens')
  const total = pick('total_tokens', 'totalTokens')
  return {
    prompt,
    completion,
    total: total > 0 ? total : prompt + completion,
  }
}

/**
 * Add one model response's usage to its session and workspace.
 * @param {string} home - DSH home directory.
 * @param {{ cwd: string, sessionId: string, prompt: number, completion: number, prices?: { input: number, output: number } }} entry
 */
export function recordUsage(home, entry) {
  const inputPrice = Number(entry.prices?.input ?? DEFAULT_PRICES.input)
  const outputPrice = Number(entry.prices?.output ?? DEFAULT_PRICES.output)
  const tokens = Math.round(entry.prompt) + Math.round(entry.completion)
  if (!Number.isFinite(tokens) || tokens <= 0) return
  const cost = (entry.prompt / 1e6) * inputPrice + (entry.completion / 1e6) * outputPrice
  const data = readUsageLedger(home)
  let workspace = data.workspaces[entry.cwd]
  if (workspace === undefined) {
    workspace = { total: { tokens: 0, cost: 0 }, sessions: {} }
    data.workspaces[entry.cwd] = workspace
  }
  workspace.total.tokens += tokens
  workspace.total.cost += cost
  let session = workspace.sessions[entry.sessionId]
  if (session === undefined) {
    session = { tokens: 0, cost: 0, updatedAt: 0 }
    workspace.sessions[entry.sessionId] = session
  }
  session.tokens += tokens
  session.cost += cost
  session.updatedAt = Date.now()
  persistLedger(home)
}

/** Read the usage feature switch. Missing/unknown content means ON. */
export function readUsageSwitch(home) {
  const text = readFileCached(usageSwitchPath(home))
  if (text === null || text === '') return true
  const value = text.trim().toLowerCase()
  return !(value === '0' || value === 'false' || value === 'off' || value === 'no')
}

/** Write the usage feature switch. */
export function setUsageSwitch(home, enabled) {
  const target = usageSwitchPath(home)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, enabled ? '1' : '0', 'utf8')
  return target
}

/** Clear usage stats: one workspace when cwd is given, otherwise everything. */
export function resetUsage(home, cwd) {
  const data = readUsageLedger(home)
  if (cwd === undefined || cwd === null || cwd === '') {
    data.workspaces = {}
  } else {
    delete data.workspaces[cwd]
  }
  persistLedger(home)
}
