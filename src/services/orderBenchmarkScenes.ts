import dayjs from 'dayjs'
import { createOrderStore } from '@/store/order'
import { createOrderOptimistic } from '@/services/orderOptimistic'
import { countTodayOrders, selectTodayOrderIds } from '@/services/orderWorkspaceView'
import { toggleOrderServed, toggleOrderStepStatus } from '@/services/orderStatus'
import { compareOrderRecordsByTimeline } from '@/services/orderSorting'
import { ORDER_BENCHMARK_REFERENCE_TIME } from '@/services/orderBenchmarkFixtures'
import type { OrderBenchmarkAction, OrderBenchmarkCase, OrderBenchmarkCaseTimings, OrderBenchmarkSample } from '@/services/orderBenchmarkTypes'
import type { OrderRecord } from '@/types'

export type BenchmarkStore = ReturnType<typeof createOrderStore>
export const createBenchmarkStore = (): BenchmarkStore => {
  const storage = new Map<string, string>()
  return createOrderStore({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value) },
    removeItem: (key) => { storage.delete(key) },
  })
}

export const benchmarkCaseDefinitions = (batchSizes: readonly number[]): OrderBenchmarkCase[] => [
  ...(['meat', 'staple', 'served'] as const).map((action) => ({ id: action, sceneId: 'C01' as const, label: { meat: '肉：本地操作与确认', staple: '主食：本地操作与确认', served: '出餐：本地操作与确认' }[action], batchSize: null })),
  ...batchSizes.map((batchSize) => ({ id: `remote-${batchSize}`, sceneId: 'C02' as const, label: `远端写入 ${batchSize} 条`, batchSize })),
  ...(['create', 'delete', 'clear', 'timeline', 'completion'] as const).map((id) => ({ id, sceneId: 'C03' as const, label: { create: '新增订单', delete: '删除订单', clear: '清空订单', timeline: '时间线重排', completion: '完成顺序变化' }[id], batchSize: null })),
  ...(['equal-version', 'old-version', 'duplicate-ids'] as const).map((id) => ({ id, sceneId: 'C04' as const, label: { 'equal-version': '同版本忽略', 'old-version': '旧版本忽略', 'duplicate-ids': '批内重复 ID 取最高版本' }[id], batchSize: null })),
  ...(['http-first', 'realtime-first', 'rollback', 'rollback-newer', 'stale-generation'] as const).map((id) => ({ id, sceneId: 'C05' as const, label: { 'http-first': 'HTTP 确认先于实时回声', 'realtime-first': '新实时版本先于 HTTP 确认', rollback: '失败回滚', 'rollback-newer': '失败保留更新的实时版本', 'stale-generation': '旧请求失败与新乐观操作交错' }[id], batchSize: null })),
].map((item) => ({ ...item, samples: [], timings: null, statistics: {} }))

type Views = ReturnType<typeof deriveViews>
const deriveViews = (store: BenchmarkStore) => {
  const state = store.getState()
  return {
    counts: countTodayOrders(state.ordersById, state.orderDisplayIds, ORDER_BENCHMARK_REFERENCE_TIME),
    ids: selectTodayOrderIds(state.ordersById, state.orderDisplayIds, 'all', ORDER_BENCHMARK_REFERENCE_TIME),
  }
}

const assertCorrect = (condition: boolean): void => {
  if (!condition) throw new Error('INVALID_BENCHMARK_RESULT')
}

/** All assertions, sorting of expected data, and extra filter checks are outside measured phases. */
const validateResult = (store: BenchmarkStore, expected: OrderRecord[], views: Views): void => {
  const state = store.getState()
  const sorted = [...expected].sort(compareOrderRecordsByTimeline)
  assertCorrect(state.orderDisplayIds.length === expected.length && Object.keys(state.ordersById).length === expected.length)
  assertCorrect(sorted.every((order, index) => state.orderDisplayIds[index] === order.id && state.ordersById[order.id] === order))
  const start = dayjs(ORDER_BENCHMARK_REFERENCE_TIME).tz('Asia/Shanghai').startOf('day')
  const end = start.add(1, 'day')
  const today = sorted.filter((order) => {
    const created = dayjs(order.createdAt)
    return !created.isBefore(start) && created.isBefore(end)
  })
  const completed = today.filter((order) => order.completedAt !== null)
  const uncompleted = today.filter((order) => order.completedAt === null)
  assertCorrect(views.counts.todayCompletedCount === completed.length && views.counts.uncompletedCount === uncompleted.length)
  assertCorrect(views.ids.join(',') === today.map((order) => order.id).join(','))
  const completedIds = selectTodayOrderIds(state.ordersById, state.orderDisplayIds, 'completed', ORDER_BENCHMARK_REFERENCE_TIME)
  const expectedCompletedIds = [...completed].sort((a, b) => dayjs(b.completedAt).valueOf() - dayjs(a.completedAt).valueOf()).map((order) => order.id)
  assertCorrect(completedIds.join(',') === expectedCompletedIds.join(','))
  assertCorrect(selectTodayOrderIds(state.ordersById, state.orderDisplayIds, 'uncompleted', ORDER_BENCHMARK_REFERENCE_TIME).join(',') === uncompleted.map((order) => order.id).join(','))
}

/** Prepared delivery is synchronous. HTTP transport, hook promises, tombstones and rAF queues are excluded. */
export const performBenchmarkCase = (
  definition: OrderBenchmarkCase,
  store: BenchmarkStore,
  orders: OrderRecord[],
  iteration: number,
): OrderBenchmarkSample => {
  // The stale-version case needs a valid earlier server version (versions start at 1).
  if (definition.id === 'old-version') orders = orders.map((order, index) => index === 1 ? { ...order, version: 2 } : order)
  // Every operation starts from the same fixture; reset, injection, and initial derivation are not timed.
  store.getState().resetSyncState()
  store.getState().setOrders(orders)
  validateResult(store, orders, deriveViews(store))
  const journal = createOrderOptimistic()
  const action = definition.id as OrderBenchmarkAction
  const target = orders[action === 'served' ? 4 : definition.id === 'completion' ? 0 : 1]
  let expected = orders
  let inputEvents = 1
  let distinctIds = 1
  let acceptedUpdates = 1
  let checks: boolean[] = []
  let views: Views
  const timings: OrderBenchmarkCaseTimings = { storeCommitMs: 0, viewDerivationMs: 0, totalMs: 0 }
  const measureStore = (operation: () => void): void => {
    const start = performance.now()
    operation()
    timings.storeCommitMs += performance.now() - start
  }
  const measureJournal = <T,>(operation: () => T): T => {
    const start = performance.now()
    const result = operation()
    timings.journalMs = (timings.journalMs ?? 0) + performance.now() - start
    return result
  }
  const measureViews = (): Views => {
    const start = performance.now()
    const result = deriveViews(store)
    timings.viewDerivationMs += performance.now() - start
    return result
  }
  const replaceExpected = (updated: OrderRecord): void => {
    expected = expected.map((order) => order.id === updated.id ? updated : order)
  }
  // Construct deterministic authoritative payloads before starting the clock.
  const newer = { ...target, version: 3, updatedAt: ORDER_BENCHMARK_REFERENCE_TIME, note: 'benchmark-v3' }
  const confirmed = { ...target, version: 2, updatedAt: ORDER_BENCHMARK_REFERENCE_TIME, note: 'benchmark-v2' }
  const created = { ...target, id: 'benchmark-created', displayNo: '9999', createdAt: ORDER_BENCHMARK_REFERENCE_TIME }
  const remote = orders.slice(1, 1 + (definition.batchSize ?? 1)).map((order) => ({ ...order, version: order.version + 1, note: 'benchmark-remote' }))
  const duplicated = [confirmed, target, newer, { ...newer, note: 'ignored-equal-version' }, confirmed]
  let finalRecord: OrderRecord | null = null
  const started = performance.now()

  if (definition.sceneId === 'C01') {
    const optimisticStart = performance.now()
    const next = action === 'served'
      ? toggleOrderServed(target, ORDER_BENCHMARK_REFERENCE_TIME)
      : toggleOrderStepStatus(target, action)
    store.getState().upsertOrder(next)
    timings.optimisticCommitMs = performance.now() - optimisticStart
    const viewStart = performance.now()
    measureViews()
    timings.optimisticViewsMs = performance.now() - viewStart
    const authoritativeStart = performance.now()
    finalRecord = { ...next, version: target.version + 1, updatedAt: ORDER_BENCHMARK_REFERENCE_TIME }
    store.getState().upsertIfNewer(finalRecord)
    timings.authoritativeCommitMs = performance.now() - authoritativeStart
    const finalViewStart = performance.now()
    views = measureViews()
    timings.authoritativeViewsMs = performance.now() - finalViewStart
    timings.storeCommitMs = timings.optimisticCommitMs + timings.authoritativeCommitMs
  } else {
    switch (definition.id) {
      case 'create': measureStore(() => { store.getState().upsertIfNewer(created) }); break
      case 'delete': measureStore(() => { store.getState().removeOrder(target.id) }); break
      case 'clear': measureStore(() => { store.getState().clearOrders() }); break
      case 'timeline':
        finalRecord = { ...confirmed, createdAt: ORDER_BENCHMARK_REFERENCE_TIME }
        measureStore(() => { store.getState().upsertIfNewer(finalRecord!) })
        break
      case 'completion':
        finalRecord = { ...confirmed, completedAt: ORDER_BENCHMARK_REFERENCE_TIME }
        measureStore(() => { store.getState().upsertIfNewer(finalRecord!) })
        break
      case 'equal-version':
        measureStore(() => { store.getState().upsertOrdersIfNewer([{ ...target, note: 'ignored-equal' }]) })
        break
      case 'old-version':
        measureStore(() => { store.getState().upsertOrdersIfNewer([{ ...target, version: target.version - 1, note: 'ignored-old' }]) })
        break
      case 'duplicate-ids': measureStore(() => { store.getState().upsertOrdersIfNewer(duplicated) }); break
      default:
        if (definition.sceneId === 'C02') {
          measureStore(() => { store.getState().upsertOrdersIfNewer(remote) })
        } else {
          const firstGeneration = measureJournal(() => journal.beginMutation(target.id, target))
          const optimistic = toggleOrderStepStatus(target, 'meat')
          measureStore(() => { store.getState().upsertOrder(optimistic) })
          if (definition.id === 'stale-generation') {
            const second = toggleOrderStepStatus(optimistic, 'staple')
            const secondGeneration = measureJournal(() => journal.beginMutation(target.id, optimistic))
            measureStore(() => { store.getState().upsertOrder(second) })
            const staleEnded = measureJournal(() => journal.endMutation(target.id, firstGeneration))
            const stillPending = journal.hasPending(target.id)
            if (staleEnded) measureStore(() => { store.getState().upsertOrder(target) })
            const latestConfirmed = { ...second, version: 2 }
            if (measureJournal(() => journal.endMutation(target.id, secondGeneration))) {
              measureStore(() => { store.getState().upsertIfNewer(latestConfirmed) })
              measureJournal(() => { journal.recordUpsert(latestConfirmed) })
            }
            finalRecord = latestConfirmed
            checks = [!staleEnded, stillPending]
          } else {
            if (definition.id === 'realtime-first' || definition.id === 'rollback-newer') {
              measureStore(() => { store.getState().upsertOrdersIfNewer([newer]) })
            }
            if (measureJournal(() => journal.endMutation(target.id, firstGeneration))) {
              if (definition.id === 'rollback' || definition.id === 'rollback-newer') {
                const current = store.getState().ordersById[target.id]
                if (!current || current.version <= target.version) measureStore(() => { store.getState().upsertOrder(target) })
              } else {
                measureStore(() => { store.getState().upsertIfNewer(confirmed) })
                measureJournal(() => { journal.recordUpsert(confirmed) })
              }
            }
            if (definition.id === 'http-first') measureStore(() => { store.getState().upsertOrdersIfNewer([confirmed]) })
          }
        }
    }
    views = measureViews()
  }
  timings.totalMs = performance.now() - started

  // Expected outcomes and correctness checks deliberately begin after the final timestamp.
  if (definition.sceneId === 'C01') {
    assertCorrect(finalRecord !== null)
    const correctNext = action === 'served' ? toggleOrderServed(target, ORDER_BENCHMARK_REFERENCE_TIME) : toggleOrderStepStatus(target, action)
    assertCorrect(correctNext !== target && finalRecord?.completedAt === correctNext.completedAt && finalRecord.meatStepStatusCode === correctNext.meatStepStatusCode && finalRecord.stapleStepStatusCode === correctNext.stapleStepStatusCode)
    replaceExpected(finalRecord!)
    inputEvents = 2
    acceptedUpdates = 2
  } else if (definition.sceneId === 'C02') {
    for (const record of remote) replaceExpected(record)
    inputEvents = remote.length
    distinctIds = remote.length
    acceptedUpdates = remote.length
  } else if (definition.sceneId === 'C05') {
    const final = definition.id === 'http-first' ? confirmed
      : definition.id === 'rollback' ? target
        : definition.id === 'stale-generation' ? finalRecord! : newer
    replaceExpected(final)
    assertCorrect(!journal.hasPending(target.id) && checks.every(Boolean))
    const effects = journal.effectsAfter({ seq: -1, pendingIds: [] })
    assertCorrect(effects.length === (definition.id.startsWith('rollback') ? 0 : 1))
    if (effects[0]?.type === 'upsert') assertCorrect(effects[0].order.version === 2)
    inputEvents = definition.id === 'stale-generation' ? 4 : definition.id === 'rollback' ? 2 : 3
    acceptedUpdates = definition.id === 'stale-generation' ? 3 : 2
    journal.reset()
    assertCorrect(journal.effectsAfter({ seq: -1, pendingIds: [] }).length === 0)
  } else {
    switch (definition.id) {
      case 'create': expected = [...orders, created]; break
      case 'delete': expected = orders.filter((order) => order.id !== target.id); break
      case 'clear': expected = []; distinctIds = orders.length; acceptedUpdates = orders.length; break
      case 'timeline': case 'completion': replaceExpected(finalRecord!); break
      case 'equal-version': case 'old-version': acceptedUpdates = 0; break
      case 'duplicate-ids': replaceExpected(newer); inputEvents = duplicated.length; break
    }
  }
  validateResult(store, expected, views!)
  return { iteration, timings, inputEvents, distinctIds, acceptedUpdates, correctness: 'passed' }
}
