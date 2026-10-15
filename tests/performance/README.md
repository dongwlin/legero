# 工作台同步流程与现场记录器验证

运行单客户端生产路径的五轮受控功能轨迹：

```sh
LEGERO_SYNC_REPORT=/tmp/legero-sync-flow.json pnpm benchmark:sync
```

不设置 `LEGERO_SYNC_REPORT` 时只执行断言；设置后以 UTF-8 JSON 保存五轮逐次阶段、各轮阶段均值和五轮等权均值。原始轨迹保留于 [`sync-flow-functional-2026-10-15.json`](../../benchmarks/order-workspace/results/sync-flow-functional-2026-10-15.json)。这是功能轨迹，不是门店设备延迟基线，也不与计算基准协议的均值直接比较；下一次运行会直接采集 Git 提交、未提交状态和相关源码摘要，不依赖浏览器构建注入；本次已保存轨迹的构建来源信息缺失，不能当作带完整来源的发布版本结果。

`workspaceSyncFlows.test.tsx` 调用生产 `apiClient`、repository、WebSocket 解码、同步 hook、乐观操作 journal、tombstone 和 Zustand store。仅 fetch、WebSocket 传输和原生网络／生命周期信号使用夹具；夹具不会连接实际服务或操作真实订单。每轮使用 jsdom 的隔离存储，结束时关闭 socket、恢复监听和记录会话。

五轮使用同一固定操作序列：

1. 实时 ready 后暂缓首次快照，确认 online 不等于数据就绪；首屏使用两页快照，并在等待期间发送重复 ID 和新旧版本事件。
2. 在固定位置发送离线／联网信号，重连快照期间发送删除、全量清空及新版本批量事件，再执行清空后的补充快照。
3. 固定业务时钟为上海午夜前两秒，后台等待跨过午夜和恢复阈值，然后恢复并完成新快照。
4. 切换工作区，校验新数据及旧 socket 延迟事件隔离，最后检查全部连接关闭。

业务／生命周期 `Date` 时钟被注入；单调计时和任务调度保持真实。因此轨迹含夹具调度与 jsdom 开销，不代表真实网络、服务端、数据库、Android、浏览器布局或绘制。阶段可能重叠，不能相加。测试另外覆盖快照失败与组件离开时的诊断阶段取消；未完成的业务 HTTP 请求仍可在原有生产流程中稍后完成，旧组件不会接收结果。

每轮只有一个真实 singleton 客户端。2／3 客户端并发、真实网络故障、Android 前后台、跨设备时钟和真实屏幕呈现尚待独立浏览器上下文或设备验证。

现场记录器单元测试在 [`performanceRecorder.test.ts`](../../src/services/performanceRecorder.test.ts)，覆盖关闭状态无监听／计时条目、受控慢阶段、观察器条目、非零 interactionId 归组、报告阈值统计口径、能力缺失、条数与时限、User Timing 清理、取消及过期 token、慢渲染及后续 React 提交近似值。HTTP 记录的允许字段、随机会话关联和隐私边界由 [`apiClient.test.ts`](../../src/services/apiClient.test.ts) 校验；失败确认和乐观回滚由 [`useOrderItemActions.test.tsx`](../../src/views/Order/components/list/useOrderItemActions.test.tsx) 校验。

普通发布构建无法提供 React profiling 数据；专用 profiling 构建记录渲染开销，并把同步后第一次订单子树提交标为近似值。它不能验证目标业务状态已经画到屏幕上，`businessFeedbackMs` 不可用。Event Timing 只统计已报告且仍保留的交互；没有条目不能证明没有卡顿。所有现场记录保留在本机并由用户主动导出。
