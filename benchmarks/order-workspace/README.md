# Order workspace synchronous-work benchmark

This benchmark imports the shared `src/services/orderBenchmark.ts` workload also used by the Settings diagnostic. It calls the production `countTodayOrders` / `selectTodayOrderIds` functions used by OrderControls / OrderList, an isolated instance of the real Zustand order store, and the domain toggle functions. Vite compiles the entry to a temporary SSR bundle; no copied date-filter implementation or extra dependency is used.

Run from the repository root:

```sh
pnpm benchmark:orders --label baseline --output benchmarks/order-workspace/results/baseline.json
# After the fix, on the same otherwise idle machine:
pnpm benchmark:orders --label fixed --output benchmarks/order-workspace/results/fixed.json --compare benchmarks/order-workspace/results/baseline.json
```

Every invocation starts **five fresh Node processes sequentially**. Each process runs 130, 520 and 1820 total-order scenarios (130 orders per day, always 130 today). Each scenario measures meat, staple and served actions separately, with two unrecorded warmup actions then five recorded actions per metric. A trial reports the arithmetic mean milliseconds per action; the final result is the arithmetic mean of the five trial means. The JSON preserves all five trial values, stage timings, source hashes, Git state and machine/runtime metadata.

One measured action performs the actual domain toggle and optimistic store update, recomputes both today counters and list IDs, simulates an authoritative response with a higher server version, then recomputes both views again. The list filter is the UI default, `all`; fixture generation, hydration and initial view derivation are outside the timing. Target orders are valid for their actions, and the benchmark checks that both daily views still contain exactly 130 orders. It uses a fixed Shanghai business date and deliberately runs the host process in UTC. Browser runs use five isolated stores in the same browser process; CLI trials additionally isolate V8 initialization using fresh processes.

This measures synchronous JavaScript work associated with one successful action. It excludes network latency, HTTP/backend/PostgreSQL work, React rendering, DOM/layout/paint, storage disk I/O, the singleton optimistic journal and request bookkeeping. The 300 ms duplicate-tap guard is outside the measured path. CLI runs also exclude Android WebView. The numbers checked into `results/` are development-machine measurements and cannot be presented as measured restaurant-device latency. The Settings entry can run the same workload on an Android device without touching live orders or persistent storage.

Compare results only with the same fixture, warmup, iteration counts, machine and Node version. Avoid running builds or tests concurrently. Timings are observations, not CI pass/fail thresholds.
