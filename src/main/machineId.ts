import { createHash } from 'crypto'
import { execSync } from 'child_process'
import { hostname, userInfo } from 'os'

/** Stable PC fingerprint for same-PC vs new-PC data policy. */
export function getMachineFingerprint(): string {
  const guid = readWindowsMachineGuid()
  if (guid) return `mg:${guid}`
  const user = safeUserName()
  const host = hostname() || 'unknown-host'
  const digest = createHash('sha256').update(`${host}|${user}`).digest('hex').slice(0, 32)
  return `hu:${digest}`
}

function readWindowsMachineGuid(): string | null {
  if (process.platform !== 'win32') return null
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    )
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9A-Fa-f-]+)/)
    const guid = m?.[1]?.trim()
    return guid && guid.length >= 8 ? guid : null
  } catch {
    return null
  }
}

function safeUserName(): string {
  try {
    return userInfo().username || 'user'
  } catch {
    return 'user'
  }
}
