import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { expect, userEvent, waitFor } from 'storybook/test'
import PerformanceProfiler from '@/components/PerformanceProfiler'
import { getPerformanceRecordingSnapshot } from '@/services/performanceRecorder'
import PerformanceRecordingPanel from '@/views/Settings/Diagnostics/PerformanceRecordingPanel'

const SlowRender = ({ iteration }: { iteration: number }) => {
  if (iteration > 0) {
    // Time-based work is intentional in this isolated profiling fixture.
    // eslint-disable-next-line react-hooks/purity
    const until = performance.now() + 60
    // eslint-disable-next-line react-hooks/purity
    while (performance.now() < until) { /* Controlled slow render, test fixture only. */ }
  }
  return <p>受控渲染次数：{iteration}</p>
}

const RecordingFixture = () => {
  const [iteration, setIteration] = useState(0)
  return <div className='mx-auto max-w-4xl space-y-6 p-4'>
    <PerformanceRecordingPanel />
    <div className='space-y-3'>
      <p className='text-sm text-foreground/75'>仅供开发验证的慢任务与渲染夹具，不会读取订单。</p>
      <button className='min-h-11 rounded-xl border border-border px-4' onClick={() => {
        const until = performance.now() + 70
        while (performance.now() < until) { /* Controlled long task, test fixture only. */ }
        setIteration((value) => value + 1)
      }}>触发受控慢操作</button>
      <PerformanceProfiler area='orders'><SlowRender iteration={iteration} /></PerformanceProfiler>
    </div>
  </div>
}

const meta = {
  title: 'Settings/PerformanceRecording', component: RecordingFixture,
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
  parameters: { a11y: { test: 'error' } },
} satisfies Meta<typeof RecordingFixture>
export default meta
type Story = StoryObj<typeof meta>

export const ControlledSlowOperation: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /开始.*记录/ }))
    await userEvent.click(canvas.getByRole('button', { name: '触发受控慢操作' }))
    await waitFor(() => {
      const snapshot = getPerformanceRecordingSnapshot()
      expect(snapshot?.samples.some((sample) => sample.stage === 'react_render_orders' && sample.durationMs >= 50)).toBe(true)
      if (snapshot?.capabilities.longTasks.status === 'available') {
        expect(snapshot.samples.some((sample) => sample.stage === 'long_task' && sample.durationMs >= 50)).toBe(true)
      }
    })
    await userEvent.click(canvas.getByRole('button', { name: '停止记录' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('记录已停止')
    await expect(canvas.getByRole('button', { name: '保存结果文件' })).toBeEnabled()
  },
}
