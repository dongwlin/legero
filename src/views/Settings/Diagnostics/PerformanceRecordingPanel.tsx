import { Button, Card } from '@heroui/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import DiagnosticExport from '@/components/DiagnosticExport'
import { getBuildMetadata } from '@/services/buildMetadata'
import {
  cancelPerformanceRecording, getPerformanceRecordingSnapshot, startPerformanceRecording,
  stopPerformanceRecording, subscribePerformanceRecording,
} from '@/services/performanceRecorder'

const PerformanceRecordingPanel = () => {
  const [recording, setRecording] = useState(getPerformanceRecordingSnapshot)
  const [error, setError] = useState(false)
  const running = recording?.status === 'recording'
  const build = getBuildMetadata()

  useEffect(() => {
    const refresh = () => { setRecording(getPerformanceRecordingSnapshot()) }
    const unsubscribe = subscribePerformanceRecording(refresh)
    const interval = window.setInterval(refresh, 1000)
    return () => { unsubscribe(); window.clearInterval(interval) }
  }, [])

  return (
    <Card.Root variant='secondary' className='border border-border/70 p-0 shadow-surface'>
      <Card.Header className='gap-1 px-5 pt-5 md:px-6 md:pt-6'>
        <Card.Title className='text-lg md:text-xl'>记录实际操作</Card.Title>
        <Card.Description className='leading-6 text-foreground/75'>主动开启后，返回订单页照常操作，再回来停止并保存记录。</Card.Description>
      </Card.Header>
      <Card.Content className='space-y-4 px-5 pb-5 md:px-6 md:pb-6'>
        <p className='text-sm leading-6 text-foreground/75'>
          最长记录 2 分钟，保留最近 2000 条阶段样本；不会自动提交或修改订单。离开诊断页后继续记录，达到时限自动停止；后台状态会单独标记。
        </p>
        <div className='flex flex-col flex-wrap gap-3 sm:flex-row'>
          <Button.Root className='min-h-11 w-full sm:w-auto' isDisabled={running} onPress={() => {
            setError(false)
            try { setRecording(startPerformanceRecording({ profilingBuild: build.profiling || import.meta.env.DEV })) }
            catch { setError(true) }
          }}>{recording ? '开始新记录' : '开始记录实际操作'}</Button.Root>
          {running ? <>
            <Button.Root className='min-h-11 w-full sm:w-auto' variant='outline' onPress={() => { setRecording(stopPerformanceRecording()) }}>停止记录</Button.Root>
            <Button.Root className='min-h-11 w-full sm:w-auto' variant='outline' onPress={() => { setRecording(cancelPerformanceRecording()) }}>取消记录</Button.Root>
            <Link className='inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent' to='/order'>返回订单页操作</Link>
          </> : null}
        </div>
        {error ? <p role='alert' className='text-sm text-danger'>记录器未能启动，请停止已有记录后重试。</p> : null}
        {recording ? <div className='space-y-4'>
          <p role='status' className='text-sm leading-6 tabular-nums'>
            {running ? '正在记录' : recording.status === 'cancelled' ? '已取消，保留部分记录' : recording.status === 'duration_limit' ? '已达到时限并停止' : '记录已停止'}
            {' · '}{(recording.elapsedMs / 1000).toFixed(0)} 秒 · 保留 {recording.samples.length} 条 · 丢弃 {recording.droppedSamples} 条
          </p>
          <dl className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
            {([
              ['eventTiming', '交互事件'], ['longTasks', '长任务'], ['longAnimationFrames', '长动画帧'],
              ['scrollFrames', '滚动回调间隔'], ['heap', 'JS 堆内存'], ['reactProfiler', 'React 渲染分析'],
            ] as const).map(([key, label]) => <div key={key}>
              <dt className='text-foreground/75'>{label}</dt>
              <dd className='mt-1'>{recording.capabilities[key].status === 'available' ? '可采集' : '当前不可用'}</dd>
            </div>)}
          </dl>
          <p className='text-sm leading-6 text-foreground/75'>
            交互采集阈值 {recording.limits.eventDurationThresholdMs} ms，已报告 {recording.eventTiming.reportedInteractions} 组。
            {recording.eventTiming.coverage === 'unavailable' ? '当前 WebView 不支持交互事件采集。'
              : recording.eventTiming.coverage === 'no_observed_input' ? '尚未观察到输入。'
                : recording.eventTiming.coverage === 'inputs_without_reported_interactions' ? '已观察到输入，尚未报告达到阈值且可归组的交互。' : '这些是已报告交互，不代表全部操作的平均值或页面 INP。'}
            状态写入、React 提交和滚动回调间隔均不等同于画面实际呈现时间。普通发布构建不采集 React 渲染耗时。
          </p>
          <DiagnosticExport key={recording.sessionId} json={JSON.stringify(recording, null, 2)} purpose='performance-recording'
            appVersion={build.appVersion} copyLabel='复制操作记录' copiedLabel='已复制操作记录'
            textLabel='完整操作记录 JSON' refreshable />
        </div> : <p className='text-sm text-foreground/75'>尚未开启记录。采集能力、时限和丢弃数量会随结果一起导出。</p>}
      </Card.Content>
    </Card.Root>
  )
}

export default PerformanceRecordingPanel
