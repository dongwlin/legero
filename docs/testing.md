# 前端测试

项目使用 Vitest 作为统一测试执行器，普通测试和 Storybook 组件测试各自运行在独立的 Vitest Project 中。

## 测试层级

- `unit` Project 默认使用 Node 环境，纯函数、Store 和服务层测试运行在这里。需要 DOM 的测试在文件顶部声明 `/* @vitest-environment jsdom */`。
- 页面和组件集成测试放在 `tests/`，通过 `tests/setup.ts` 安装 DOM matcher、MSW 生命周期和通用清理。HTTP 请求在 MSW 边界拦截，不访问真实公网服务。
- `storybook` Project 由 `@storybook/addon-vitest` 创建，使用 Playwright Chromium Browser Mode 执行 Story 的渲染、交互和可访问性测试。
- 从部署入口验证完整应用与真实后端协作的流程属于 Playwright E2E。当前 CI 尚未提供隔离的后端和测试数据，因此没有加入 E2E 用例；使用 MSW 的页面集成测试不能代替它。

共享控件的 Story 应表达一个有业务意义的状态。代表性键盘交互写在 Story 的 `play` 中；错误、边界和领域规则仍放在普通 Vitest 测试中。Storybook Preview 加载生产使用的 Tailwind 与 HeroUI 样式，并将 a11y 违规设为错误。

## 常用命令

首次运行浏览器测试前执行 `pnpm exec playwright install chromium`；Linux 环境缺少系统库时使用 `pnpm exec playwright install --with-deps chromium`。

```bash
# 单次运行全部 Vitest Project（兼容 CI）
pnpm test
pnpm test:run

# 只运行 Node/jsdom 普通测试
pnpm test:unit

# 普通测试与 Storybook 测试的覆盖率报告
pnpm test:coverage

# 只运行 Storybook Chromium 测试；追加 --run 执行一次后退出
pnpm test:storybook --run

# 查看或构建 Storybook
pnpm storybook
pnpm storybook:build
```

覆盖率使用 V8，显式统计 `src` 业务源码，并排除类型定义、测试设施、测试文件、生成目录、配置目录和入口文件。覆盖率用于发现遗漏分支，不设置脱离风险的统一百分比门槛。

CI 需要使用 `pnpm install --frozen-lockfile`，安装 Chromium 后运行 lint、TypeScript/生产构建、全部 Vitest Project 和静态 Storybook 构建。Playwright 浏览器组件测试与 E2E 的职责不同：前者验证组件真实浏览器行为，后者应在具备稳定部署入口和测试数据时单独加入。

## 当前重点覆盖

- 领域测试验证计价、数量归一化、订单状态、稳定排序、表单数据隔离和上海业务日边界。
- HTTP 契约测试验证并发刷新、写请求的一次认证重放、失败不重复写入、请求取消及无效会话清理。
- 页面集成测试复用生产路由，覆盖登录、会话恢复、无工作区、退出、订单加载与空状态、失败重试、创建和乐观更新回滚。服务端校验失败目前展示表单级错误；当前接口没有字段错误映射契约。
- ToggleButtonGroup 和 MeatSelector 的 Story 使用真实控件验证选择、禁用和键盘操作，并执行 axe 检查。自动检查不代替完整的屏幕阅读器和视觉回归测试。
