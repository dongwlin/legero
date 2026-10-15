import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react'
import { recordPerformanceReactRender } from '@/services/performanceRecorder'

interface PerformanceProfilerProps {
  area: 'orders' | 'statistics' | 'form'
  children: ReactNode
}

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, _baseDuration, _startTime, commitTime) => {
  if (id === 'orders' || id === 'statistics' || id === 'form') {
    recordPerformanceReactRender(id, actualDuration, phase, commitTime)
  }
}

const PerformanceProfiler = ({ area, children }: PerformanceProfilerProps) => (
  <Profiler id={area} onRender={onRender}>{children}</Profiler>
)

export default PerformanceProfiler
