import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export const readComparisonBaseline = async (output, baseline) => {
  if (!baseline) return null
  const baselinePath = await realpath(path.resolve(baseline))
  const outputPath = await realpath(path.resolve(output)).catch(() => path.resolve(output))
  const baselineStat = await stat(baselinePath)
  const outputStat = await stat(outputPath).catch(() => null)
  if (outputPath === baselinePath || outputStat && outputStat.dev === baselineStat.dev && outputStat.ino === baselineStat.ino) {
    throw new Error('Output must differ from the comparison baseline; refusing to overwrite baseline')
  }
  // Read before any output mutation, including raw-result preservation on comparison failure.
  return JSON.parse(await readFile(baselinePath, 'utf8'))
}
