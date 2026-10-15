# 桌面多客户端工作台功能轨迹

`pnpm benchmark:clients` 运行 S01、S02 及 S03 工作区切换：默认依次测试 1、2、3 个客户端，每档五轮。每个客户端使用全新的 Playwright Chromium browser context、独立 localStorage 和独立的生产模块 singleton；每轮结束卸载 hook 并关闭 context。该入口只运行固定合成数据，不需要本机后端、账号或门店工作区。

```sh
pnpm benchmark:clients
pnpm benchmark:clients --clients 2,3 --output benchmarks/order-workspace/results/workspace-clients-desktop.json
```

需要已有依赖以及 Playwright Chromium 运行时。缺少浏览器时保存 `unavailable` 状态，不自动下载依赖或改动环境。程序以 loopback 随机端口启动专用 Vite 开发服务器，不占用已有应用服务器；HTTP 仅允许夹具自身 origin 及保留域名 `isolated-client-workspace.invalid`，后者全部由 Playwright 路由返回。WebSocket 通过 `routeWebSocket` 完整模拟，不连接真实服务。

每轮的固定顺序如下：

1. WebSocket ready 到达后保持首个 HTTP 快照未完成，发送同 ID 的较新、旧版及重复更新，再释放两页快照。
2. 发起真实 `useOrderItemActions` 肉操作，校验乐观状态，先释放 HTTP 确认，再发送实时回声。
3. 发起真实主食操作，先发送更高版本／重复实时事件，再释放旧版本 HTTP 确认，核对不降级。
4. 发起满足出餐条件的真实操作，注入 HTTP 503，核对乐观状态和失败回滚；这是预期故障，原始 `server_ack` failure 样本保留。
5. 通过真实 web offline／online 事件触发恢复，在未完成的重连快照期间发送删除、全清空和批量更新，再释放旧快照及生产 hook 要求的清空后快照。
6. 再发送已删 ID 和旧版／新版重复更新，核对无复活、最高版本生效。
7. 切换合成工作区，核对新快照数据隔离、旧连接关闭，最后卸载各 hook 并确认所有连接关闭。

页面只提供夹具按钮和状态，实际调用生产 action hook、业务规则、repository、API client、WebSocket 解码、rAF 批处理、同步 hook、乐观 journal、tombstone 和 store。断网信号与 HTTP／WebSocket 数据由测试控制；发送顺序通过每个页面本地的解码计数确认后再释放 HTTP，不依赖跨上下文时钟比较。

JSON 保存协议、源码 SHA-256、提交和 dirty 状态、环境、每档五轮原始 recorder 样本、固定计数、正确性检查及每阶段均值。每阶段先在一轮内汇总成功样本，再对五个轮均值等权求算术平均，同时保存最小／最大轮均值和轮均值标准差。任一轮失败、取消或超时，该档不生成五轮均值。预期失败保留在 failure 样本中，不算作成功延迟。按 Ctrl+C 取消时保留部分结果；`--timeout-ms` 可在 5000–120000 范围内设置每轮上限，默认 60000。

这些是 **桌面开发构建的功能阶段轨迹**，用于验证真实前端链路在独立客户端间收敛。各时长仅使用本客户端单调时钟；重叠阶段不相加，不计算“客户端 A 操作到 B 显示”。ready、快照校准、store ready 各有独立边界。完整生产登录、真实网络／后端／数据库、React Profiler commit、屏幕可用、Android 原生生命周期、上海跨日及长后台恢复均不属于该入口。跨日／后台恢复和旧工作区回调失效由 `tests/performance/workspaceSyncFlows.test.tsx` 的单客户端受控夹具另行验证，不能由本入口替代实机验收。

结果不保存请求／响应正文、URL、token、ticket、用户／工作区／订单 ID 或订单内容。故障详情使用固定步骤与错误码，避免异常消息泄露网络内容。收敛校验读取的合成订单字段仅用于内存断言，不写入结果文件。

开发校验：`pnpm exec tsc -b benchmarks/browser-workspace/tsconfig.json` 检查夹具及导入的生产类型；仓库的 `pnpm lint` 也覆盖此目录。常规 `pnpm build` 的入口保持不变，此 HTML 不打入发布应用。

2026-10-16 的[完整桌面结果](../order-workspace/results/workspace-clients-desktop-2026-10-16.json)已保存：1／2／3 客户端各五轮共 15 轮全部通过，每轮 14 项正确性检查；每轮分别保留 104／185／266 个样本，共 2,775 个。所有连接均由 hook 关闭，页面异常和意外网络请求均为零，样本无丢弃或未完成阶段。该次夹具类型检查和 ESLint 通过；从原始样本独立复算各阶段五轮均值一致，结果文件不含合成认证信息或订单正文。这份数据仍是开发构建功能轨迹，不作为生产或 Android 延迟基线。
