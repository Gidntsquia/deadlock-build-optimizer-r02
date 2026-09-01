#!/usr/bin/env node
// Fails if src/generator/ references the held-out Zergggy validation data.
// Trivially passes while src/generator/ is empty or absent (T3 fills it in).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const GENERATOR_DIR = 'src/generator'
const NEEDLE = /zergggy/i

function walk(dir) {
  let files = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files = files.concat(walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

const files = walk(GENERATOR_DIR)
const hits = []
for (const file of files) {
  const content = readFileSync(file, 'utf8')
  if (NEEDLE.test(content)) {
    hits.push(file)
  }
}

if (hits.length > 0) {
  console.error('gate:heldout FAILED — "zergggy" referenced in src/generator/:')
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}

console.log(`gate:heldout OK — ${files.length} file(s) in ${GENERATOR_DIR} clean of held-out references.`)
