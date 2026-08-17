/**
 * DSH_HOME resolution for the dsh-speaking-style plugin.
 * Mirrors the shared contract used by the dsh-web-ui plugin family:
 * the DSH_HOME environment override wins, the platform home fallback follows.
 */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/** Expand a leading ~ (or ~user) in a path, platform-style. */
export function expandHome(path, home = homedir()) {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

/**
 * Resolve the DSH home directory.
 * @param {NodeJS.ProcessEnv} [env] - process environment to read DSH_HOME from.
 * @param {string} [home] - platform home directory fallback (test seam).
 * @returns {string} the absolute DSH home path.
 */
export function resolveDshHome(env = process.env, home = homedir()) {
  const raw = env.DSH_HOME
  if (raw !== undefined && raw.trim() !== '') {
    const expanded = expandHome(raw.trim(), home)
    return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded)
  }
  return join(home, '.dsh')
}

/** Resolve the DSH home directory from the live environment. */
export function dshHome() {
  return resolveDshHome()
}
