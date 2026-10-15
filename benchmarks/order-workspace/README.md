# 订单性能基准与现场诊断

共享工作负载调用生产 Zustand store、状态函数、列表／计数派生，以及独立的乐观操作 journal。所有计算夹具使用独立 store 和内存 storage，不操作真实订单。Node ≥24，pnpm 11；主机全局版本不符时可使用 `corepack pnpm@11`。

## C01–C05：计算协议 v3

```sh
pnpm benchmark:orders --label baseline-v3 --output benchmarks/order-workspace/results/baseline-v3.json
pnpm benchmark:orders --label candidate-v3 --output benchmarks/order-workspace/results/candidate-v3.json --compare benchmarks/order-workspace/results/baseline-v3.json
pnpm benchmark:orders --profile today --output /tmp/today-v3.json
pnpm benchmark:orders --profile batch --output /tmp/batch-v3.json
pnpm benchmark:orders --profile history --output /tmp/history-v3.json
```

CLI 顺序启动五个独立 Node 进程；应用的“设置 → 订单基准测试”运行相同场景，在同一浏览器进程中使用五个独立 store。默认轻量配置；扩展历史规模请在设备空闲时分批选择。

| 配置 | 总量／今日订单 | 每批远端更新 |
| --- | --- | --- |
| `default` | 130／130、520／130、1820／130 | 1、10 |
| `history` | 10000／130、50000／130 | 1、10 |
| `today` | 1820／130、1820／260、1820／520 | 1、10 |
| `batch` | 1820／130 | 1、10、50 |

日期固定在上海 2026-10-15；当日规模独立变化，历史日期每天保持 130 单。数据按索引确定生成，不使用门店数据。每个用例每轮先预热两次、再记录五次；完整运行先计算各轮均值，再对五轮等权求算术均值。JSON 保留 25 次操作样本、五个轮值，以及分别针对操作样本和轮值的 min/max/标准差/样本数，不计算五个均值的 P95/P99。

| 场景 | 实际路径与校验 |
| --- | --- |
| C01 | 肉／主食／出餐的本地状态写入、派生、模拟确认写入、再次派生 |
| C02 | `upsertOrdersIfNewer` 的单条／批量路径 |
| C03 | 新增、删除、清空、时间线改变、完成顺序改变 |
| C04 | 同版本、旧版本、批内重复 ID 取最高版本 |
| C05 | 真实隔离 journal 与 store 的确认／实时交错、回滚、较新版本保护、generation 保护 |

计时区间为同步操作序列入口至最后一次 all 列表和计数派生完成；状态写入、派生和 journal 另列阶段。C01 的状态写入阶段包含领域 toggle 与确认记录构造。每次操作前的夹具注入、初始派生、预期结果构造／排序及正确性断言均在计时外。所有场景核对最终记录、时间线、今日数量以及完成／未完成筛选和顺序。

**排除项：**真实 HTTP、数据库、WebSocket 解码、rAF 排队、hook 的事件预去重与 tombstone、完整请求 promise 管理、React、布局／绘制、持久化磁盘 I/O、300ms 防重复点击。C02 是真实 store 批量路径，不是完整实时接收链路；C05 是受控同步投递序列，实际异步交错由同步流程夹具补充验证。

CLI 路径保护回归可用 `pnpm test:benchmark-cli` 验证，输出与基线指向相同文件（包括软／硬链接）时会在运行前拒绝。CLI 可 Ctrl+C；`--timeout-ms` 控制每轮超时。取消／超时保存已收到的逐用例 checkpoint，缺失样本明确保留为部分结果，`means` 为空；阻塞子进程有强制终止兜底。应用退后台或离页中止隔离基准。取消后的已完成样本仍可保存；旧运行的晚到结果不能覆盖新运行。

比较要求协议、配置、设备、运行时和构建模式相同，性能采集时不要同时运行构建、测试或其他基准。结果中的源码摘要、提交及未提交状态用于核对来源；结果本身不设未经验证的毫秒门槛。V1 归档及本次协议 V2 探索记录继续保留，V2 的完成顺序夹具曾使用未完成订单，V3 修正为已完成订单的合法重排；**不能直接与 V3 比较**：计时断言位置、场景和数据分布均有调整。本轮只扩大测量覆盖，未优化生产排序或工作台数据范围。

## E01：保存完整 JSON

基准、失败诊断、实时连接快照、操作记录共用文件出口。复制、手动文本与保存使用同一份 JSON；不会为保存重新计算均值。文件名包含用途、UTC 时间、应用版本（缺失为 `version-unknown`）和随机后缀，不含业务标识。

- 浏览器下载 Blob，只提示“已发起下载”；请在下载记录确认最终文件，浏览器不能可靠观察用户取消或磁盘失败。
- Android 使用官方 `@capacitor/filesystem` 在应用 Cache 写入 UTF-8 文件，逐字回读校验后由 `@capacitor/share` 交给系统。无须共享存储权限；不会声称接收方已经保存。通过目标应用选择保存／转发，再从文件管理器核对。Cache 不是永久保存位置，最多保留最近 8 份，系统也可清理它。
- 保存失败／取消不会重跑基准。重试与复制使用已固定数据；实时指标仍更新，可主动“获取最新导出快照”。离页取消文件准备；系统分享造成的后台切换不会误取消已完成结果。
- 文件包含模拟数据计时或受控诊断字段，不含 token、session ticket、账号凭据、订单正文或完整请求／响应。默认本地记录、主动导出，不自动上传。

新增插件须执行 `pnpm build && pnpm sync`，通过生成流程注册 Android 插件；不手改 Android 功能代码。原生文件管理器／外部分享验收仍需连接实际设备完成，不能用浏览器／mock 测试代替。

## U01/U02：主动记录实际操作

入口：“设置 → 实时连接诊断 → 记录实际操作”。开始后返回订单页正常操作／滚动，再回来停止、取消或保存。默认 2 分钟、最近 2000 条；内部接口上限 10 分钟／10000 条。记录离开诊断页后继续，达到时限自动停止；前后台状态单列，不将后台节流当作前台回归。

记录器分别检测 Event Timing、Long Tasks、Long Animation Frames、Resource Timing、滚动 rAF 间隔、JS heap 和 React Profiler。不可用为明确状态／原因，不能解释成零耗时或无卡顿。Event Timing 默认 `durationThreshold=40`，仅按可靠的非零 `interactionId` 归组，统计已报告且保留的窗口，不是全部交互均值或页面 INP。未报告事件、未发生输入和能力缺失分别记录。滚动 rAF 间隔是近似值，不代表实际呈现帧。

HTTP 记录 headers、正文读取、解码、往返；`sync_receive_to_state` 从首个被接受的 hook 事件入队至合并结束，包含 rAF 等待，不包含此前的 WS 解码／转换（另列阶段）；快照记录转换、合并、缓冲回放；本地操作记录接受操作至有效确认及 store 阶段。父子阶段共享随机会话内关联号，普通观察样本使用独立命名空间。User Timing 条目聚合后清理，样本／进行中阶段／提交近似标记均有容量限制。记录器关闭时不创建监听、计时条目或请求关联头。

```sh
pnpm build:profiling
pnpm preview
```

专用 profiling 构建把 `react-dom/client` 映射到 `react-dom/profiling`。订单、表单、统计子树记录 `actualDuration`；普通发布构建不产生这项数据。同步／快照后的首次订单子树提交命名为 `*_commit_approximation`，不能证明目标业务状态实际呈现，`businessFeedbackMs` 明确不可用。profiling 自身有额外开销，不能与普通发布构建混作同组比较。Storybook 的受控慢操作夹具验证长任务与慢渲染采集，不作为门店样本。

阶段记录器的开关开销可独立运行：

```sh
pnpm benchmark:recorder-overhead --output /tmp/recorder-overhead.json
```

该命令在五个独立 Node 进程中交替对比开／关，每种状态预热 1000 次、记录 5000 次真实阶段调用。只测量计时器、User Timing 和有界记录维护，启动／停止／导出在计时外；Node 不支持的浏览器观察器成本和实际业务开销不在其中。保留五轮原值及均值，不能据此推导整页采集的总开销。

## S01–S03：同步功能轨迹

```sh
LEGERO_SYNC_REPORT=/tmp/sync-flow.json pnpm benchmark:sync
```

五轮真实前端生产链路，使用假传输和生命周期适配器，覆盖分页、ready 与数据就绪分离、重连期间并发版本／删除／清空、后台跨午夜和工作区切换。另验证失败及取消。详见 [同步夹具说明](../../tests/performance/README.md)。这是单客户端 jsdom 功能轨迹；2／3 个独立客户端、真实网络、实际 Android 前后台及呈现尚未验收，不把夹具调度均值当作设备基线。

## L01：固定规模持续运行

```sh
pnpm benchmark:soak --profile quick --output /tmp/soak-quick.json
pnpm benchmark:soak --profile 2h --output /tmp/soak-2h.json
pnpm benchmark:soak --profile 8h --output /tmp/soak-8h.json
```

默认五轮 × 1 秒、50ms 目标间隔。`2h`／`8h` 表示**每轮**时长，五轮计划分别 10／40 小时，可通过 `--round-ms` 覆盖。`--interval-ms`、`--total-orders`、`--today-orders`、`--sample-capacity`、`--window-capacity`、`--window-ms` 独立控制负载与容量。默认固定 520 总单／130 今日单，按固定序列执行 toggle／确认、远端 10 条、失败回滚、快照／journal prune，不累积业务数据。

保留最近窗口和操作序列、完整成功操作的常量空间在线统计、失败数、实际速率及订阅清理计数。取消保留部分记录，未完成五轮不生成正式五轮均值。堆接口来源单列；Node JS heap／浏览器可选 heap 不等同于 Android 进程内存，GC 波动不直接判为泄漏。该工具不创建真实 WS，连接数为 null；不覆盖真正的断线／前后台循环。短跑只证明工具可用，不能证明 2／8 小时稳定。

## A01：服务端关联

主动记录的请求才携带随机 `X-Performance-Request-ID`。新后端回显受控关联号，并暴露 `Server-Timing: app;dur=..., db;dur=...`；旧后端缺失时不填零。`app` 截至首次响应头，`db` 是 Bun 查询 hook 累计（含连接池／驱动等开销），不是 PostgreSQL 引擎独占时间。阶段可重叠，不能相加。后端说明见相邻仓库的 `docs/performance-timing.md`；没有默认开放 pprof。

所有开发电脑报告与门店 Android 结果分别解读。现场照片转录仍见 [2026-10-15 记录](../../docs/order-benchmark-onsite-2026-10-15.md)，不视为完整可复算的五轮 JSON。阶段状态、采样证据与待验收项见 [扩展方案](../../docs/performance-benchmark-expansion-plan.md)。

## 桌面独立客户端功能流程

`pnpm benchmark:clients --output benchmarks/order-workspace/results/workspace-clients-desktop-2026-10-16.json` 顺序运行 1／2／3 客户端各五轮。每个客户端使用全新浏览器上下文和独立 singleton，实际调用同步及按钮 action hook；传输为合成 HTTP／WebSocket。覆盖分页、HTTP／WS 交错、失败回滚、断线快照期间删除／清空／批量更新、工作区切换及连接清理。完整边界见[多客户端说明](../browser-workspace/README.md)。这是桌面开发构建功能轨迹，不能用来推导真实设备间的端到端呈现耗时。

本次所有基线、开销、短跑和未完成验收汇总于[2026-10-16 实施记录](../../docs/performance-benchmark-expansion-implementation-2026-10-16.md)。
