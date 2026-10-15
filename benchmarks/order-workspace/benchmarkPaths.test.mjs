import { test } from 'node:test'
import assert from 'node:assert/strict'
import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readComparisonBaseline } from './benchmarkPaths.mjs'

test('comparison cannot destroy its baseline through same paths, symlinks or hard links', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'legero-benchmark-paths-'))
  try {
    const baseline = path.join(directory, 'baseline.json')
    const content = '{"fiveRounds":[1,2,3,4,5]}'
    await writeFile(baseline, content)
    await symlink(baseline, path.join(directory, 'symbolic.json'))
    await link(baseline, path.join(directory, 'hard.json'))
    for (const output of [baseline, path.join(directory, 'symbolic.json'), path.join(directory, 'hard.json')]) {
      await assert.rejects(readComparisonBaseline(output, baseline), /refusing to overwrite baseline/)
      assert.equal(await readFile(baseline, 'utf8'), content)
    }
    assert.deepEqual(await readComparisonBaseline(path.join(directory, 'new.json'), baseline), JSON.parse(content))
    assert.equal(await readComparisonBaseline(path.join(directory, 'new.json')), null)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
