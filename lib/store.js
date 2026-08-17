/**
 * Guise (persona wardrobe) store: file conventions, mtime-cached reads, the persona
 * library, and global/local resolution for the dsh-guise plugin.
 *
 * Conventions:
 * - global: <dsh-home>/.persona/global.txt — applies to every session.
 *   Content: raw persona text, OR a single line `@preset:<id>` pointing at a
 *   library preset, OR `off` / `disabled` to turn the persona off.
 * - library: <dsh-home>/.persona/library/<id>.txt — named personas. The
 *   optional first line `# <名称>` is the display name (defaults to the id).
 * - local: <session-cwd>/<localFile> — when present, REPLACES the global
 *   resolution for that workspace (checked first). Same content rules.
 * - An existing but empty file counts as "not defined" and falls through.
 */

import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** mtime-keyed read cache: path -> { mtimeMs, text } */
const cache = new Map()

/** First-line markers that disable injection. */
const OFF_MARKERS = new Set(['off', 'disabled', 'none', 'off.', 'disabled.', '关', '关闭'])

/**
 * Read a file with mtime caching. Returns the trimmed text, or null when the
 * file is missing / not a regular file / unreadable.
 * @param {string} filePath - absolute path.
 * @returns {string | null}
 */
export function readFileCached(filePath) {
  let stat = null
  try {
    const value = statSync(filePath)
    if (value.isFile()) stat = value
  } catch {
    stat = null
  }
  const mtimeMs = stat === null ? 0 : stat.mtimeMs
  const hit = cache.get(filePath)
  if (hit !== undefined && hit.mtimeMs === mtimeMs) return hit.text
  let text = null
  if (stat !== null) {
    try {
      text = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim()
    } catch {
      text = null
    }
  }
  cache.set(filePath, { mtimeMs, text })
  return text
}

/** Drop the whole read cache (after saves/deletes so changes apply at once). */
export function clearPersonaCache() {
  cache.clear()
}

/** The persona file paths for the current convention. */
export function personaPaths(home, localFile) {
  return {
    global: join(home, '.persona', 'global.txt'),
    libraryDir: join(home, '.persona', 'library'),
    /** @param {string | undefined} cwd */
    localFor: (cwd) => (cwd === undefined || cwd === '' ? null : join(cwd, localFile)),
  }
}

/** Validate and normalize a library preset id (ASCII slug, 40 chars max). */
export function sanitizePresetId(value) {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug === '' ? `preset-${Date.now().toString(36)}` : slug
}

/**
 * List every library preset.
 * @param {string} home - DSH home directory.
 * @returns {Array<{ id: string, name: string, text: string, path: string }>}
 */
export function listLibrary(home) {
  const dir = personaPaths(home, '').libraryDir
  let files = []
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.txt'))
  } catch {
    return []
  }
  const out = []
  for (const file of files.sort()) {
    const id = file.slice(0, -4)
    const text = readFileCached(join(dir, file))
    if (text === null || text === '') continue
    const lines = text.split('\n')
    const name = lines[0].startsWith('# ') ? lines[0].slice(2).trim() : id
    out.push({ id, name, text, path: join(dir, file) })
  }
  return out
}

/** One library preset by id, or null. */
export function findLibraryPreset(home, id) {
  return listLibrary(home).find((preset) => preset.id === id) ?? null
}

/** The master switch file: <home>/.persona/enabled.txt — missing means ON. */
export function masterSwitchPath(home) {
  return join(home, '.persona', 'enabled.txt')
}

/**
 * Read the master switch. Missing/unknown content means enabled.
 * @param {string} home - DSH home directory.
 * @returns {boolean} whether persona injection is switched on.
 */
export function readMasterSwitch(home) {
  const text = readFileCached(masterSwitchPath(home))
  if (text === null || text === '') return true
  const value = text.trim().toLowerCase()
  return !(value === '0' || value === 'false' || value === 'off' || value === 'no' || value === '关' || value === '关闭')
}

/**
 * Write the master switch.
 * @param {string} home - DSH home directory.
 * @param {boolean} enabled - target state.
 * @returns {string} the switch file path.
 */
export function setMasterSwitch(home, enabled) {
  const target = masterSwitchPath(home)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, enabled ? '1' : '0', 'utf8')
  clearPersonaCache()
  return target
}

/** The balance-warning threshold file: <home>/.persona/balance-min.txt. */
export function balanceMinPath(home) {
  return join(home, '.persona', 'balance-min.txt')
}

/**
 * Read the balance-warning threshold (CNY). Missing/invalid -> the fallback.
 * @param {string} home - DSH home directory.
 * @param {number} fallback - default threshold when the file is absent.
 * @returns {number} the effective threshold.
 */
export function readBalanceMin(home, fallback = 1) {
  const text = readFileCached(balanceMinPath(home))
  if (text === null) return fallback
  const value = Number.parseFloat(text.trim())
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

/**
 * Write the balance-warning threshold.
 * @param {string} home - DSH home directory.
 * @param {number} value - threshold in CNY (> 0).
 * @returns {string} the threshold file path.
 */
export function setBalanceMin(home, value) {
  const target = balanceMinPath(home)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, String(value), 'utf8')
  clearPersonaCache()
  return target
}

/**
 * Save (create or overwrite) a library preset.
 * @param {string} home - DSH home directory.
 * @param {{ id?: string, name?: string, text: string }} input
 * @returns {string} the preset id actually written.
 */
export function saveLibraryPreset(home, input) {
  const dir = personaPaths(home, '').libraryDir
  mkdirSync(dir, { recursive: true })
  const id = sanitizePresetId(input.id !== undefined && String(input.id).trim() !== '' ? input.id : input.name)
  const name = String(input.name ?? id).trim() || id
  const body = `# ${name}\n${String(input.text).replace(/\r\n/g, '\n').trimEnd()}\n`
  writeFileSync(join(dir, `${id}.txt`), body, 'utf8')
  clearPersonaCache()
  return id
}

/**
 * Delete one library preset. Missing files are a silent no-op.
 * @param {string} home - DSH home directory.
 * @param {string} id - preset id to delete.
 */
export function deleteLibraryPreset(home, id) {
  const dir = personaPaths(home, '').libraryDir
  try {
    unlinkSync(join(dir, `${sanitizePresetId(id)}.txt`))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  clearPersonaCache()
}

/** Parse a file's first-line directive: off / preset pointer / raw text. */
function parseDirective(text) {
  const lines = text.split('\n')
  const first = lines[0].trim()
  if (OFF_MARKERS.has(first.toLowerCase())) return { kind: 'off' }
  if (lines.length === 1) {
    const match = /^@preset:([A-Za-z0-9_-]{1,40})$/.exec(first)
    if (match !== null) return { kind: 'preset', id: match[1] }
  }
  return { kind: 'raw' }
}

/**
 * Resolve the effective persona for one assembly. Returns null when the
 * master switch is off (injection disabled for every scope).
 * @param {string} home - DSH home directory.
 * @param {string} localFile - workspace-root persona file name.
 * @param {string | undefined} cwd - the session workspace, when known.
 * @returns {null | { source: string, text: string, path: string, presetId: string | null, disabled: boolean, presetName?: string }}
 */
export function resolvePersona(home, localFile, cwd) {
  if (!readMasterSwitch(home)) return null
  const paths = personaPaths(home, localFile)
  if (cwd !== undefined && cwd !== '') {
    const resolved = resolveFile(home, paths.localFor(cwd), 'local')
    if (resolved !== null) return resolved
  }
  return resolveFile(home, paths.global, 'global')
}

/** Resolve one persona file (directive + library pointer follow-through). */
function resolveFile(home, filePath, scope) {
  if (filePath === null) return null
  const text = readFileCached(filePath)
  if (text === null || text === '') return null
  const directive = parseDirective(text)
  if (directive.kind === 'off') {
    return { source: 'off', text: '', path: filePath, presetId: null, disabled: true }
  }
  if (directive.kind === 'preset') {
    const preset = findLibraryPreset(home, directive.id)
    if (preset === null) return null // broken pointer -> fall through
    return {
      source: `${scope}-preset`,
      text: preset.text,
      path: preset.path,
      presetId: preset.id,
      presetName: preset.name,
      disabled: false,
    }
  }
  return { source: scope, text, path: filePath, presetId: null, disabled: false }
}
