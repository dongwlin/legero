import { Button, Card } from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '@/components/Header'
import DiagnosticExport from '@/components/DiagnosticExport'
import {
  runOrderBenchmark,
  type OrderBenchmarkProgress,
  type OrderBenchmarkProfile,
  type OrderBenchmarkResult,
} from '@/services/orderBenchmark'
import {
  benchmarkActionLabel,
  benchmarkActions,
  benchmarkFailureLabel,
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
  const [profile, setProfile] = useState<OrderBenchmarkProfile>('default')
  const [progress, setProgress] = useState<OrderBenchmarkProgress | null>(null)
  const [result, setResult] = useState<OrderBenchmarkResult | null>(null)
  const [failure, setFailure] = useState<OrderBenchmarkFailure | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const resultJson = useMemo(() => result ? JSON.stringify(result, null, 2) : '', [result])
  const failureJson = failure ? formatBenchmarkFailureReport(failure) : ''
  const running = status === 'running'

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden' && controllerRef.current) {
        controllerRef.current.abort()
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

    try {
      const nextResult = await runBenchmark({
        signal: controller.signal,
        profile,
        onProgress: (nextProgress) => {
          if (controllerRef.current === controller) {
            setProgress(nextProgress)
          }
        },
      })
      if (controllerRef.current === controller) {
        if (controller.signal.aborted && nextResult.status === 'completed') {
          setResult({ ...nextResult, status: 'cancelled', means: [] })
          setStatus('cancelled')
          return
        }
        setResult(nextResult)
        setStatus(nextResult.status === 'completed' ? 'done' : nextResult.status === 'cancelled' ? 'cancelled' : 'error')
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
    setStatus('cancelled')
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
                使用隔离订单测试本地操作、批量更新、排序、版本检查和失败回滚。每个场景运行 5 轮。
              </Card.Description>
            </Card.Header>
            <Card.Content className='space-y-5 px-5 pb-5 md:px-6 md:pb-6'>
              <div className='space-y-2 text-sm leading-6 text-foreground/75'>
                <p>默认分别测试 130、520、1820 单，每个场景包含 130 单今日订单。大规模场景请在设备空闲时单独选择。</p>
                <p>测试不会读取或修改真实订单，也不会提交订单到服务器。</p>
                <p>结果仅反映本地模拟处理耗时，不包含网络、服务器响应或页面完整渲染耗时。请在非忙碌时测试，并保持应用在前台。</p>
              </div>
              <label className='flex flex-col gap-2 text-sm font-medium'>
                测试配置
                <select aria-label='测试配置' value={profile} disabled={running}
                  onChange={(event) => { setProfile(event.target.value as OrderBenchmarkProfile) }}
                  className='min-h-11 rounded-xl border border-border bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-accent'>
                  <option value='default'>默认 · 历史累积 130 / 520 / 1820 单</option>
                  <option value='history'>扩展历史 · 10000 / 50000 单</option>
                  <option value='today'>当日业务量 · 130 / 260 / 520 单</option>
                  <option value='batch'>批量更新 · 1 / 10 / 50 条</option>
                </select>
              </label>
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
                        ? `第 ${progress.run} / ${progress.totalRuns} 轮 · ${progress.totalOrders} 单${progress.action ? ` · ${benchmarkActionLabel[progress.action]}` : progress.caseLabel ? ` · ${progress.caseLabel}` : ' · 准备中'}`
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
                  <p className='text-foreground/75'>测试已取消，未生成完整五轮平均值；已完成样本可保存。可重新开始。</p>
                ) : status === 'error' ? (
                  <p role='alert' className='text-foreground font-medium'>
                    测试未完成：{benchmarkFailureLabel[failure?.code ?? 'UNEXPECTED_FAILURE']}（{failure?.code ?? 'UNEXPECTED_FAILURE'}）。可保存安全诊断信息后反馈，再重新运行测试。
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
                  <h2 id='benchmark-results-title' className='text-lg font-semibold md:text-xl'>{result.status === 'completed' ? '5 轮平均结果' : '部分测试记录'}</h2>
                  <p className='text-sm leading-6 text-foreground/75'>
                    应用版本：{result.environment.appVersion ?? '当前浏览器未提供'}
                    {result.environment.appBuild ? `（构建 ${result.environment.appBuild}）` : ''}
                  </p>
                  {result.status !== 'completed' ? <p className='text-sm leading-6 text-foreground/75'>已保留 {result.trials.length} 轮记录，状态为{result.status === 'cancelled' ? '取消' : '失败'}；未生成正式平均值。</p> : null}
                  <p className='text-sm leading-6 text-foreground/75'>协议 v{result.protocol.protocolVersion}，逐次样本与校验结果见完整 JSON；不与旧协议数值直接比较。</p>
                  <p className='text-sm leading-6 text-foreground/75'>本地阶段为立即更新，确认阶段模拟收到服务器记录后的再次更新；两个阶段均包含状态写入和列表计算。</p>
                </div>
                {result.means.map((scenario) => (
                  <div key={`${scenario.totalOrders}-${scenario.todayOrders}`} className='rounded-2xl border border-border/70 bg-background-secondary/35 px-4 py-4 sm:px-5'>
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
                    <details className='mt-3 border-t border-border/60 pt-1'>
                      <summary className='min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-2 focus-visible:outline-accent'>批量更新与正确性场景</summary>
                      <div className='overflow-x-auto'>
                        <table className='w-full text-left text-xs tabular-nums sm:text-sm'>
                          <caption className='sr-only'>C02 至 C05 的五轮均值，各场景详细样本见 JSON</caption>
                          <thead><tr><th scope='col' className='py-2 font-medium'>场景</th><th scope='col' className='py-2 text-right font-medium'>状态写入</th><th scope='col' className='py-2 text-right font-medium'>视图派生</th><th scope='col' className='py-2 text-right font-medium'>总耗时</th></tr></thead>
                          <tbody className='divide-y divide-border/60'>
                            {scenario.cases.filter((item) => item.sceneId !== 'C01').map((item) => <tr key={item.id}>
                              <th scope='row' className='max-w-52 py-3 pr-3 font-medium'>{item.sceneId} · {item.label}</th>
                              <td className='py-3 text-right'>{item.timings ? formatBenchmarkMs(item.timings.storeCommitMs) : '—'}</td>
                              <td className='py-3 text-right'>{item.timings ? formatBenchmarkMs(item.timings.viewDerivationMs) : '—'}</td>
                              <td className='py-3 text-right'>{item.timings ? formatBenchmarkMs(item.timings.totalMs) : '—'}</td>
                            </tr>)}
                          </tbody>
                        </table>
                      </div>
                    </details>
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
                            const sample = trial.scenarios.find((item) => item.totalOrders === scenario.totalOrders && item.todayOrders === scenario.todayOrders)
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
              <DiagnosticExport key={result.capturedAt} json={resultJson} purpose='order-benchmark'
                appVersion={result.environment.appVersion} copyLabel='复制测试结果' copiedLabel='已复制结果'
                textLabel='完整测试结果 JSON' />
            </>
          ) : null}
          {failure ? (
            <DiagnosticExport key={failure.occurredAt} json={failureJson} purpose='order-benchmark'
              textLabel='订单基准测试诊断 JSON' />
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default OrderBenchmark
