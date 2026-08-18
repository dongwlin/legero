import { createContext } from 'react'
import type { RealtimeDiagnosticsSnapshot } from '@/services/realtimeDiagnostics'

export type RealtimeDiagnosticsAccess = {
  getDiagnostics: () => RealtimeDiagnosticsSnapshot | null
}

export const RealtimeDiagnosticsContext = createContext<RealtimeDiagnosticsAccess | null>(
  null,
)
