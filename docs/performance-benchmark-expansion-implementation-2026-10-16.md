# 性能测试与现场诊断扩展实施记录

日期：2026-10-16

前端主体提交：`f0d5750`，协议 v3 修正提交：`cd003ba`，桌面多客户端夹具提交：`789782a`；后端主体提交：`95088ab`，关联／开销证据提交：`fd2006c`。本次实现覆盖测量工具和诊断，不改变订单数据范围、排序算法、业务语义或门店订单。下面把实现与验收分别记录；未取得的设备或长期观测不标成完成。

## 阶段状态

| 阶段 | 本次实现与证据 | 待完成验收 |
| --- | --- | --- |
| E01 | 共用 UTF-8 JSON 出口；浏览器下载／Android Cache 回读后系统分享；固定快照、重试、取消、安全错误、唯一文件名、容量清理；1470816 字节合成夹具内容／摘要一致 | 实际 Android 文件管理器访问、外部再次传出、系统取消与存储故障。未连接设备，不能标记本阶段完成 |
| 第一阶段 C01–C05 | 协议 v3；真实 store 批量路径、独立 journal；五轮逐次样本、阶段和统计；开发机基线另列 | 门店 Android 基线；完整 WS 解码和帧内排队不属于此计算协议 |
| 第二阶段 U01/U02 | 主动限时／限量记录；Event Timing 分组与报告阈值、Long Task／LoAF、滚动回调、heap 能力；Profiler 专用构建；受控慢任务／渲染验证；开关开销另列 | 实际设备输入至业务呈现、门店操作记录、浏览器全部观察器及 profiling 开销；缺项保留 unavailable |
| 第三阶段 S01–S03 | 单客户端跨日／后台五轮；1／2／3 独立 Chromium 上下文各五轮：真实同步／按钮动作、分页、消息交错、回滚、删除／清空／版本及工作区隔离；资源释放 | 真实网络及 Android 生命周期、实际交互可用和屏幕呈现；功能轨迹不是设备延迟基线 |
| 第四阶段 L01 | 固定规模短跑及 2h／8h 每轮配置；有界序列／窗口与完整在线统计；失败、取消及订阅清理；短跑五轮另列 | 真正 2h／8h 五轮、连接／后台循环及 Android 进程资源趋势；不能由短跑推导长期稳定 |
| 第五阶段 A01 | 按请求启用的 Server-Timing、受控随机关联号、Bun 查询累计；CORS；隔离 PostgreSQL 五轮受控慢查询对应 Go 合成客户端往返／服务端／DB | 门店慢请求、pprof／DevTools／Perfetto 轨迹及系统资源竞争分析。未增加默认开放的诊断端点 |

## 测量边界

计算基准每轮每用例 2 次预热、5 次记录，5 轮等权。保存各操作原值及 25 次操作统计、5 个轮值统计；正确性在计时外。V1 原值及本次 V2 探索记录仍保留，不能直接比较。V2 完成顺序场景曾使用未完成订单，V3 修正为已完成订单重排，保持完整业务状态和完成数量一致；因此重新采集全部配置，未混用两次测量。默认 3 档、18 个用例；batch 配置 19 个。history、today、batch 是分开变化的维度，不做笛卡尔积。

C02 直接覆盖 `upsertOrdersIfNewer`，排除 WS 解码、rAF 排队和 hook 前置去重；C05 使用实际隔离 journal/store 方法，但不是完整 HTTP promise 管理。功能轨迹补充生产 hook 的真实异步路径，假传输／生命周期夹具明确隔离。

现场 `sync_receive_to_state` 从首个被接受的 hook 事件入队至状态合并，包含 rAF 等待，解码／转换另列。`workspace_ready_state` 是快照开始到校准状态完成；`realtime_ready` 单独计量，不能相加得出进入工作台至屏幕可用。`*_commit_approximation` 只是下一次订单子树提交；`businessFeedbackMs` unavailable，未宣称实际画面呈现。输入排队由支持且可靠归组的 Event Timing 提供，处理函数计时明确排除此前排队。

仅保留固定阶段、数值及一次会话内随机关联号；请求 header 的父子阶段与普通观察样本使用不同命名空间。不保留 token、ticket、手机号、订单正文、URL、DOM 目标或完整请求／响应。User Timing、定时器、观察器、rAF、记录窗口和进行中阶段均有清理与容量边界。

## 可重复运行

命令和完整排除项见 [基准说明](../benchmarks/order-workspace/README.md)，同步流程见 [夹具说明](../tests/performance/README.md)。Node 24.18.0、pnpm 11.28.4，命令通过 `corepack pnpm@11` 使用仓库要求版本。基线顺序执行，不与构建、测试或其他基准并行；只有文档整理和只读检查在采样期间进行。环境温度／充电状态无法可靠采集，不做推断。

## 开发机原始记录与复算

下表四组协议 v3 计算记录均来自 `cd003ba`，Node 24.18.0、V8 13.6、AMD Ryzen 7 5800H、Linux x64、production SSR、关闭 profiling；具体版本及源码摘要在 JSON 中。采样时文档、结果及桌面夹具尚未提交，`dirty: true` 如实保留。四组相关被测源码摘要完全一致，独立复算时也与当前文件一致；不把文档／夹具的未提交状态伪装成干净工作区。

| 配置与原始结果 | 独立维度 | 完整轮数 | 正式操作原值 |
| --- | --- | ---: | ---: |
| [default](../benchmarks/order-workspace/results/baseline-v3-default-2026-10-16.json) | 总量 130／520／1820，当日 130 | 5 | 1350 |
| [today](../benchmarks/order-workspace/results/baseline-v3-today-2026-10-16.json) | 总量 1820，当日 130／260／520 | 5 | 1350 |
| [batch](../benchmarks/order-workspace/results/baseline-v3-batch-2026-10-16.json) | 总量 1820，当日 130，每批 1／10／50 | 5 | 475 |
| [history](../benchmarks/order-workspace/results/baseline-v3-history-2026-10-16.json) | 总量 10000／50000，当日 130 | 5 | 900 |

合计 4075 个正式操作样本均通过正确性检查。另用不导入测量实现的 Node 算术脚本，从原值核对每轮均值、五轮等权均值、样本与轮值的最小／最大／总体标准差，并核对结果及源码 SHA-256；[复算记录](../benchmarks/order-workspace/results/validation-2026-10-16.json) 全部通过。最大计算 JSON 为 1287615 字节，多客户端功能 JSON 为 1466131 字节，均小于 [1470816 字节导出完整性夹具](../benchmarks/order-workspace/results/export-integrity-2026-10-16.json)。后者 SHA-256 为 `6791cf3ba615e7db954553e9f89bf5d40572afefe300d2494b35014774d65578`，文件字节／JSON 语义／摘要一致；它不是实际 Android 接收证明。

C01 本地操作至模拟确认完成的五轮均值如下，单位毫秒。仅用于该开发机的计算回归；排除网络、React 与绘制，不当作门店响应预算。

| 总订单（当日固定 130） | 肉 | 主食 | 出餐 |
| --- | ---: | ---: | ---: |
| 130 | 1.202 | 1.016 | 1.021 |
| 520 | 2.106 | 2.159 | 2.400 |
| 1820 | 6.705 | 5.355 | 5.344 |
| 10000 | 33.298 | 37.134 | 32.217 |
| 50000 | 192.489 | 193.852 | 191.652 |

这组证据仍显示计算随历史规模增加；本次扩大覆盖，未进行生产算法优化，因此没有前后加速百分比。V2 三组完成记录与 history 取消记录均保留为探索材料；history 部分记录无正式均值，不与 V3 混用。

## 采集开销与固定规模短跑

[记录器开关五轮](../benchmarks/order-workspace/results/recorder-overhead-node-2026-10-16.json) 使用五个独立 Node 进程，每条件预热 1000、记录 5000 次空阶段的 begin／finish，奇偶轮交换条件顺序。关闭／启用的每调用均值分别为 0.131／5.918 微秒，差值 5.787 微秒；这是包含真实 User Timing、有界样本保留及循环的受控路径。每轮启用后保留 2000、丢弃 4001 个样本，结束时所有自有定时器、mark、measure 均为零。它排除 start／stop／snapshot、浏览器观察器和 profiling；不能推导实际 Android 的完整采集开销。

[固定规模 quick 五轮](../benchmarks/order-workspace/results/soak-quick-2026-10-16.json) 每轮 1 秒、间隔 50ms，总量 520、当日 130，共 105 次操作，意外失败为零；每轮自有订阅从 1 清理为 0。五轮操作均值的等权均值为 1.500ms。序列包括肉／主食／出餐、远端 10 条批量、预期失败回滚与快照／journal 清理。heap 明确来自 Node `process.memoryUsage.heapUsed`，实际 WS 连接数为空；这五秒负载不能证明长期无泄漏或设备稳定。

## 同步与后端关联证据

[单客户端五轮](../benchmarks/order-workspace/results/sync-flow-functional-2026-10-16.json) 另外验证长后台恢复、上海午夜与旧工作区回调隔离。[桌面 1／2／3 客户端结果](../benchmarks/order-workspace/results/workspace-clients-desktop-2026-10-16.json) 共 15 轮、2775 个原始样本、每轮 14 项检查全部通过，页面错误和意外网络请求均为零。每客户端每轮 5 次快照 HTTP、3 次 realtime session、10 次解码 envelope、3 个 socket，全部由 hook 关闭；发起者 3 次真实 action-hook 请求包含 2 成功和 1 预期 503 回滚。原始样本和五轮阶段均值保留，阶段在各客户端内部用单调时钟计量，没有跨客户端相减；这是 Chromium 151 开发夹具的功能轨迹。

后端原始记录保存在后端仓库 `docs/performance-timing-http-2026-10-16.txt` 与 `docs/performance-timing-overhead-2026-10-16.txt`，解释见其 `docs/performance-timing.md`。隔离 PostgreSQL 执行 `pg_sleep(0.025)`，每轮检查普通请求不含性能头、两类合法关联号各一个成功响应；五轮均通过。UUID 组的五轮均值：Go 合成客户端完整响应体往返 25.687ms、服务端首次写头 25.448ms、DB 25.433ms。前端解析另有 API client 测试；这两个独立验证没有被宣称为一次 Android 全链路观测。

后端无 I/O 驱动的五轮平均：Bun 无 hook 183.860ns／32B／1alloc，注册但未记录 299.520ns／192B／2alloc，启用记录 360.440ns／192B／2alloc；单独关闭 hook 3.872ns／0alloc。普通请求注册 hook 仍有查询事件分配成本。旧的并行受干扰记录保持不变，新记录按顺序空闲采集，不用这些数值替代生产查询预算。

## 验证及限制

最终 `pnpm test --maxWorkers=2` 共 76 文件、556 项通过（单元／集成 51 文件 474 项，浏览器 25 文件 82 项）；另外 CLI 路径测试 1 项通过。首次合并运行曾有 3 个浏览器套件动态模块加载失败；未修改业务代码，单独完整浏览器项目和最终合并重跑均通过。桌面夹具的独立 TypeScript／ESLint 检查也通过。

`pnpm lint` 通过，保留既有 NowContext Fast Refresh 警告；普通构建与 profiling 构建通过（既有大 bundle 提示）。`pnpm sync` 正常生成文件／分享插件配置。Android wrapper 通过 shell 运行后，现有 Java 25 与 Gradle 8.14.3 不兼容；临时 JDK21 官方下载返回 HTTP403，因此未声称原生构建通过。未连接 Android 设备。现有 CI 使用 JDK21，仍需完成该环境的原生构建与实机验收。

后端 `go test ./... -count=1`、`go vet ./...`、`go build ./...` 通过，数据库用例使用隔离 postgres:18，未连接开发／门店业务数据库。CLI 超时记录 TIMEOUT、取消记录 ABORTED，均无正式均值；同路径、符号链接及硬链接不能覆盖比较基线。独立审查发现并修复了关联冲突、时限边界、过期事件分组、当日场景错行、远端批量空操作漏检和 CLI 取消保护。

## 后续验收顺序

1. 用 JDK21 完成 Android 构建，在实际设备保存完整 JSON，验证文件管理器和再次传出，再关闭 E01。
2. 在门店闲时取得同协议五轮基线，随后主动记录正常操作；不自动注入真实订单。
3. 桌面 1／2／3 客户端功能验证已有五轮证据；继续在真实设备验证前后台和网络故障，分别记录 ready、校准、提交及呈现。
4. 安排固定规模长期五轮（2h／8h 指每轮，分别需要 10／40h），按资源来源解读趋势；需要时采集系统轨迹。
5. 在稳定基线之上另行执行生产优化规划，保持相同协议的前后对比。本次没有宣称业务性能收益。
