import { Button, Card } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import Header from '@/components/Header'
import {
  runOrderBenchmark,
  type OrderBenchmarkProgress,
  type OrderBenchmarkResult,
} from '@/services/orderBenchmark'
import {
  benchmarkActionLabel,
  benchmarkActions,
  benchmarkFailureLabel,
  copyBenchmarkText,
  formatBenchmarkFailureReport,
  formatBenchmarkMs,
  getBenchmarkFailureCode,
  type OrderBenchmarkFailure,
} from '@/views/Settings/Benchmark/formatters'

interface OrderBenchmarkProps {
  runBenchmark?: typeof runOrderBenchmark
}

const OrderBenchmark = ({ runBenchmark = runOrderBenchmark }: OrderBenchmarkProps) => {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'cancelled' | 'error'>('idle')
  const [progress, setProgress] = useState<OrderBenchmarkProgress | null>(null)
  const [result, setResult] = useState<OrderBenchmarkResult | null>(null)
  const [failure, setFailure] = useState<OrderBenchmarkFailure | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const controllerRef = useRef<AbortController | null>(null)
  const resultJson = result ? JSON.stringify(result, null, 2) : ''
  const failureJson = failure ? formatBenchmarkFailureReport(failure) : ''
  const running = status === 'running'

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden' && controllerRef.current) {
        controllerRef.current.abort()
        controllerRef.current = null
        setStatus('cancelled')
      }
    }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden)
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  const handleRun = async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus('running')
    setProgress(null)
    setResult(null)
    setFailure(null)
    setCopyState('idle')

    try {
      const nextResult = await runBenchmark({
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (controllerRef.current === controller) {
            setProgress(nextProgress)
          }
        },
      })
      if (controllerRef.current === controller) {
        setResult(nextResult)
        setStatus('done')
      }
    } catch (error) {
      if (controllerRef.current === controller) {
        if (controller.signal.aborted) {
          setStatus('cancelled')
        } else {
          setFailure({ code: getBenchmarkFailureCode(error), occurredAt: new Date().toISOString() })
          setStatus('error')
        }
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }

  const handleCancel = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStatus('cancelled')
  }

  const handleCopy = async () => {
    const copied = await copyBenchmarkText(result ? resultJson : failureJson)
    setCopyState(copied ? 'copied' : 'manual')
  }

  return (
    <div className='min-h-dvh bg-background pb-20 text-foreground'>
      <Header title='订单基准测试' backLabel='返回设置' backPath='/settings' />
      <main className='mx-auto max-w-4xl px-4 pt-[calc(5.25rem+env(safe-area-inset-top))] md:px-8'>
        <div className='space-y-6'>
          <Card.Root variant='secondary' className='border border-border/70 p-0 shadow-surface'>
            <Card.Header className='gap-1 px-5 pt-5 md:px-6 md:pt-6'>
              <h2 className='text-lg font-semibold md:text-xl'>测试这台设备</h2>
              <Card.Description className='leading-6 text-foreground/75'>
                用模拟订单重复执行“肉、主食、出餐”的本地状态更新与列表计算，每个场景运行 5 轮取平均值。
              </Card.Description>
            </Card.Header>
            <Card.Content className='space-y-5 px-5 pb-5 md:px-6 md:pb-6'>
              <div className='space-y-2 text-sm leading-6 text-foreground/75'>
                <p>分别测试 130、520、1820 单，每个场景包含 130 单今日订单。</p>
                <p>测试不会读取或修改真实订单，也不会提交订单到服务器。</p>
                <p>结果仅反映本地模拟处理耗时，不包含网络、服务器响应或页面完整渲染耗时。请在非忙碌时测试，并保持应用在前台。</p>
              </div>
              <div className='flex flex-col gap-3 sm:flex-row'>
                <Button.Root
                  className='min-h-11 w-full sm:w-auto'
                  isDisabled={running}
                  onPress={() => { void handleRun() }}
                >
                  {running ? '测试进行中' : result ? '重新测试 5 轮' : '开始测试 5 轮'}
                </Button.Root>
                {running ? (
                  <Button.Root className='min-h-11 w-full sm:w-auto' variant='outline' onPress={handleCancel}>
                    取消测试
                  </Button.Root>
                ) : null}
              </div>
              <div aria-live='polite' aria-atomic='true' className='text-sm leading-6'>
                {running ? (
                  <div className='space-y-2'>
                    <p>
                      {progress
                        ? `第 ${progress.run} / ${progress.totalRuns} 轮 · ${progress.totalOrders} 单${progress.action ? ` · ${benchmarkActionLabel[progress.action]}` : ' · 准备中'}`
                        : '正在准备模拟订单…'}
                    </p>
                    <progress
                      aria-label='基准测试轮次'
                      className='h-2 w-full accent-accent'
                      max={5}
                      value={progress ? Math.max(0, progress.run - 1) : 0}
                    />
                    <p className='text-foreground/75'>可随时取消；离开此页或切换到后台会停止测试。</p>
                  </div>
                ) : status === 'cancelled' ? (
                  <p className='text-foreground/75'>测试已取消，未生成平均值。可重新开始。</p>
                ) : status === 'error' ? (
                  <p role='alert' className='text-foreground font-medium'>
                    测试未完成：{benchmarkFailureLabel[failure?.code ?? 'UNEXPECTED_FAILURE']}（{failure?.code ?? 'UNEXPECTED_FAILURE'}）。可复制安全诊断信息后反馈，再重新运行测试。
                  </p>
                ) : status === 'done' ? (
                  <p>已完成 5 轮，以下为每次模拟操作的平均耗时，数值越低越快。</p>
                ) : (
                  <p className='text-foreground/75'>尚未测试。请在出现卡顿的实际操作设备上运行，并保留结果用于对比。</p>
                )}
              </div>
            </Card.Content>
          </Card.Root>

          {result ? (
            <>
              <section aria-labelledby='benchmark-results-title' className='space-y-5'>
                <div className='space-y-1'>
                  <h2 id='benchmark-results-title' className='text-lg font-semibold md:text-xl'>5 轮平均结果</h2>
                  <p className='text-sm leading-6 text-foreground/75'>
                    应用版本：{result.environment.appVersion ?? '当前浏览器未提供'}
                    {result.environment.appBuild ? `（构建 ${result.environment.appBuild}）` : ''}
                  </p>
                  <p className='text-sm leading-6 text-foreground/75'>本地阶段为立即更新，确认阶段模拟收到服务器记录后的再次更新；两个阶段均包含状态写入和列表计算。</p>
                </div>
                {result.means.map((scenario) => (
                  <div key={scenario.totalOrders} className='rounded-2xl border border-border/70 bg-background-secondary/35 px-4 py-4 sm:px-5'>
                    <h3 className='font-medium tabular-nums'>{scenario.totalOrders} 单，其中今日 {scenario.todayOrders} 单</h3>
                    <table className='mt-3 w-full table-fixed text-left text-xs tabular-nums sm:text-sm'>
                      <caption className='sr-only'>{scenario.totalOrders} 单下各操作的 5 轮平均耗时</caption>
                      <thead className='text-foreground/75'>
                        <tr>
                          <th scope='col' className='w-12 py-2 font-medium sm:w-16'>操作</th>
                          <th scope='col' className='py-2 text-right font-medium'>平均总耗时</th>
                          <th scope='col' className='py-2 text-right font-medium'>本地阶段</th>
                          <th scope='col' className='py-2 text-right font-medium'>确认阶段</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-border/60'>
                        {benchmarkActions.map((action) => {
                          const timing = scenario.metrics[action]
                          return (
                            <tr key={action}>
                              <th scope='row' className='py-3 font-medium'>{benchmarkActionLabel[action]}</th>
                              <td className='py-3 text-right font-semibold'>{formatBenchmarkMs(timing.totalMs)}</td>
                              <td className='py-3 text-right text-foreground/75'>{formatBenchmarkMs(timing.optimisticCommitMs + timing.optimisticViewsMs)}</td>
                              <td className='py-3 text-right text-foreground/75'>{formatBenchmarkMs(timing.authoritativeCommitMs + timing.authoritativeViewsMs)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <details className='mt-2 border-t border-border/60 pt-1'>
                      <summary className='min-h-11 cursor-pointer py-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'>查看 5 轮原始耗时</summary>
                      <table className='w-full table-fixed text-left text-xs tabular-nums sm:text-sm'>
                        <caption className='sr-only'>{scenario.totalOrders} 单下各轮的总耗时</caption>
                        <thead className='text-foreground/75'>
                          <tr>
                            <th scope='col' className='w-12 py-2 font-medium sm:w-16'>轮次</th>
                            {benchmarkActions.map((action) => <th key={action} scope='col' className='py-2 text-right font-medium'>{benchmarkActionLabel[action]}</th>)}
                          </tr>
                        </thead>
                        <tbody className='divide-y divide-border/60'>
                          {result.trials.map((trial) => {
                            const sample = trial.scenarios.find((item) => item.totalOrders === scenario.totalOrders)
                            return (
                              <tr key={trial.run}>
                                <th scope='row' className='py-2 font-medium'>{trial.run}</th>
                                {benchmarkActions.map((action) => <td key={action} className='py-2 text-right'>{sample ? formatBenchmarkMs(sample.metrics[action].totalMs) : '—'}</td>)}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </details>
                  </div>
                ))}
              </section>
              <section className='space-y-3' aria-label='导出测试结果'>
                <Button.Root className='min-h-11 w-full sm:w-auto' variant='outline' onPress={() => { void handleCopy() }}>
                  {copyState === 'copied' ? '已复制结果' : '复制测试结果'}
                </Button.Root>
                <p aria-live='polite' className='text-sm leading-6 text-foreground/75'>
                  {copyState === 'copied'
                    ? '已复制全部 5 轮、平均值和设备环境，可粘贴用于排查。'
                    : copyState === 'manual'
                      ? '当前环境无法自动复制。请长按下方文本，选择全部后复制。'
                      : '结果包含模拟数据的耗时和设备环境，不包含真实订单或账号信息。'}
                </p>
                <details open={copyState === 'manual'} className='rounded-2xl border border-border/70 bg-background-secondary/35 px-4'>
                  <summary className='min-h-11 cursor-pointer py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'>完整测试数据（JSON）</summary>
                  <textarea
                    aria-label='完整测试结果 JSON'
                    readOnly
                    value={resultJson}
                    rows={12}
                    onFocus={(event) => event.currentTarget.select()}
                    className='mb-4 block w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground caret-accent selection:bg-accent/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                  />
                </details>
              </section>
            </>
          ) : null}
          {failure ? (
            <section className='space-y-3' aria-label='导出诊断信息'>
              <Button.Root className='min-h-11 w-full sm:w-auto' variant='outline' onPress={() => { void handleCopy() }}>
                {copyState === 'copied' ? '已复制诊断信息' : '复制诊断信息'}
              </Button.Root>
              <p aria-live='polite' className='text-sm leading-6 text-foreground/75'>
                {copyState === 'copied'
                  ? '已复制错误类别和发生时间；不会包含原始错误消息或堆栈。'
                  : copyState === 'manual'
                    ? '当前环境无法自动复制。请长按下方文本，选择全部后复制。'
                    : '诊断信息仅包含安全错误代码和发生时间，不包含原始错误消息或堆栈。'}
              </p>
              <details open={copyState === 'manual'} className='rounded-2xl border border-border/70 bg-background-secondary/35 px-4'>
                <summary className='min-h-11 cursor-pointer py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'>诊断数据（JSON）</summary>
                <textarea
                  aria-label='订单基准测试诊断 JSON'
                  readOnly
                  value={failureJson}
                  rows={8}
                  onFocus={(event) => event.currentTarget.select()}
                  className='mb-4 block w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground caret-accent selection:bg-accent/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                />
              </details>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default OrderBenchmark
