/**
 * Lightweight PDF text extraction without OCR or heavy deps.
 * Pulls literal strings from content streams / whole file — works for many text PDFs.
 * Image-only / scanned PDFs will return little or no text.
 */
import { readFileSync } from 'fs'

function decodePdfEscapes(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
}

export function extractTextFromPdfBuffer(buf: Buffer): string {
  // Prefer latin1 so binary stays 1:1 with byte values for regex scans
  const raw = buf.toString('latin1')
  const chunks: string[] = []

  // Parentheses strings: (Hello World)
  const parenRe = /\((?:\\.|[^\\)]){2,}\)(?:\s*Tj|\s*TJ)?/g
  let m: RegExpExecArray | null
  while ((m = parenRe.exec(raw)) !== null) {
    const inner = m[0].replace(/^\(/, '').replace(/\)(?:\s*Tj|\s*TJ)?$/, '')
    const decoded = decodePdfEscapes(inner)
    if (/[A-Za-z]{2,}/.test(decoded)) chunks.push(decoded)
  }

  // Hex strings: <48656C6C6F>
  const hexRe = /<([0-9A-Fa-f\s]{4,})>/g
  while ((m = hexRe.exec(raw)) !== null) {
    const hex = m[1].replace(/\s+/g, '')
    if (hex.length % 2 !== 0) continue
    const bytes: number[] = []
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16))
    }
    const decoded = Buffer.from(bytes).toString('utf8')
    if (/[A-Za-z]{2,}/.test(decoded)) chunks.push(decoded)
  }

  // Fallback: long printable ASCII runs (helps some PDFs)
  if (chunks.length < 5) {
    const asciiRe = /[A-Za-z][A-Za-z0-9 ,.;:'"\/\-\n\r\t]{12,}/g
    while ((m = asciiRe.exec(raw)) !== null) {
      chunks.push(m[0])
    }
  }

  const text = chunks
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

export function extractTextFromPdfFile(filePath: string): string {
  const buf = readFileSync(filePath)
  return extractTextFromPdfBuffer(buf)
}
