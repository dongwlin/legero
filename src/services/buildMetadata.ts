export interface BuildMetadata {
  appVersion: string | null
  mode: string
  profiling: boolean
  commit: string | null
  dirty: boolean | null
  sourceSha256: Record<string, string>
  unavailableReason: string | null
}

declare const __LEGERO_BUILD__: BuildMetadata | undefined

export const getBuildMetadata = (): BuildMetadata => typeof __LEGERO_BUILD__ !== 'undefined'
  ? __LEGERO_BUILD__
  : {
    appVersion: null, mode: 'unknown', profiling: false, commit: null,
    dirty: null, sourceSha256: {}, unavailableReason: 'build metadata was not injected',
  }
