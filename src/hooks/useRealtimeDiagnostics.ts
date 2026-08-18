import { useContext } from 'react'
import { RealtimeDiagnosticsContext } from './realtimeDiagnosticsContext'

export const useRealtimeDiagnostics = () =>
  useContext(RealtimeDiagnosticsContext)
