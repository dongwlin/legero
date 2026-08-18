import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  RealtimeDiagnosticsContext,
  type RealtimeDiagnosticsAccess,
} from './realtimeDiagnosticsContext'

type RealtimeDiagnosticsProviderProps = {
  children: ReactNode
  getDiagnostics: RealtimeDiagnosticsAccess['getDiagnostics']
}

/**
 * Exposes the diagnostics getter owned by the active workspace sync session.
 * The provider never creates or owns a realtime subscription.
 */
export const RealtimeDiagnosticsProvider = ({
  children,
  getDiagnostics,
}: RealtimeDiagnosticsProviderProps) => {
  const value = useMemo<RealtimeDiagnosticsAccess>(
    () => ({ getDiagnostics }),
    [getDiagnostics],
  )

  return (
    <RealtimeDiagnosticsContext.Provider value={value}>
      {children}
    </RealtimeDiagnosticsContext.Provider>
  )
}
