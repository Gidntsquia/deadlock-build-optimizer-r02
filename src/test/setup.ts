import '@testing-library/jest-dom/vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// jsdom has no real server to answer the app's runtime fetch('/data/**')
// calls. Serve those paths straight from the committed public/data/**
// snapshot files on disk (same files the production build serves as static
// assets), and fall back to the real fetch for anything else (none expected
// in tests, since item/hero images aren't loaded by jsdom's <img>).
const realFetch = globalThis.fetch?.bind(globalThis)

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = resolveRequestUrl(input)
  if (url.startsWith('/data/')) {
    const filePath = join(process.cwd(), 'public', url)
    if (!existsSync(filePath)) {
      return new Response(null, { status: 404, statusText: 'Not Found' })
    }
    return new Response(readFileSync(filePath, 'utf8'), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  if (!realFetch) throw new Error(`no fetch available for ${url}`)
  return realFetch(input, init)
}) as typeof fetch
