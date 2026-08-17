/**
 * Balance pre-flight for the tired mode: before a new conversation actually
 * calls the API, check that the DeepSeek account still has enough balance
 * (default threshold: more than 1 CNY, adjustable via the panel / the
 * balance-min.txt file). When the balance is KNOWN to be below the minimum,
 * the agent must not request the API at all — it says a tired line and the
 * turn closes. Unknown state (no key, network failure, non-DeepSeek provider)
 * fails OPEN: the request proceeds normally.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** DeepSeek balance endpoint (read-only). */
const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Re-check at most once per minute per process. */
const CACHE_TTL_MS = 60 * 1000

/** Request timeout. */
const FETCH_TIMEOUT_MS = 8000

/** Per-process cache of the last balance query. */
let cache = { at: 0, balance: null, known: false }

/**
 * Read the DeepSeek API key: environment first, then the credentials file
 * (<dsh-home>/.credentials.yaml, `DEEPSEEK_API_KEY: sk-...`).
 * @param {string} home - DSH home directory.
 * @returns {string | null}
 */
export function readApiKey(home) {
  const fromEnv = process.env.DEEPSEEK_API_KEY
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv.trim()
  try {
    const text = readFileSync(join(home, '.credentials.yaml'), 'utf8')
    for (const line of text.split('\n')) {
      const match = /^\s*DEEPSEEK_API_KEY\s*:\s*(.+?)\s*$/.exec(line)
      if (match !== null) {
        return match[1].replace(/^["']|["']$/g, '').trim()
      }
    }
  } catch {
    /* missing credentials file — no key */
  }
  return null
}

/**
 * Query the DeepSeek balance.
 * @param {string} apiKey - DeepSeek API key.
 * @returns {Promise<{ ok: boolean, balance?: number, reason?: string }>}
 */
export async function fetchBalance(apiKey) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(BALANCE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` }
    const data = await response.json()
    const infos = Array.isArray(data.balance_infos) ? data.balance_infos : []
    const balance = infos.reduce((sum, info) => sum + (Number(info.total_balance) || 0), 0)
    return { ok: true, balance }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The full balance picture against a threshold. The API query itself runs at
 * most once per minute; the threshold comparison is recomputed on every call.
 * @param {string} home - DSH home directory.
 * @param {number} min - balance-warning threshold in CNY.
 * @returns {Promise<{ known: boolean, balance: number | null, min: number, sufficient: boolean }>}
 *   known=false means the balance could not be determined (fail open).
 */
export async function getBalanceInfo(home, min) {
  if (Date.now() - cache.at >= CACHE_TTL_MS) {
    let balance = null
    let known = false
    const apiKey = readApiKey(home)
    if (apiKey !== null) {
      try {
        const fetched = await fetchBalance(apiKey)
        if (fetched.ok) {
          balance = fetched.balance
          known = true
        }
      } catch {
        /* fail open: unknown */
      }
    }
    cache = { at: Date.now(), balance, known }
  }
  const sufficient = !cache.known || cache.balance > min
  return { known: cache.known, balance: cache.balance, min, sufficient }
}

/**
 * Whether the account can afford a conversation right now.
 * @param {string} home - DSH home directory.
 * @param {number} minBalance - minimum balance in CNY (default 1).
 * @returns {Promise<boolean>} true when sufficient OR unknown (fail open);
 *   false only when the balance is KNOWN to be below the minimum.
 */
export async function checkBalanceSufficient(home, minBalance = 1) {
  return (await getBalanceInfo(home, minBalance)).sufficient
}

/** Drop the cached balance decision (used by tests). */
export function clearBalanceCache() {
  cache = { at: 0, balance: null, known: false }
}
