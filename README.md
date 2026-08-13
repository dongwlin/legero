# Legero 前端

Legero（Order Management System）是一个面向特定餐饮门店的订单管理系统前端，采用移动优先的响应式设计，可打包为 Android 应用。

## 功能特性

- **订单管理**：创建、编辑、批量下单并跟进当日订单，支持按完成状态筛选、主食/肉类步骤进度切换与上餐状态切换
- **统计报表**：按日期范围查看每日营业数据与趋势
- **多服务器支持**：可配置 API 服务器地址，保存常用服务器并在登录页快速切换
- **认证与会话**：手机号 + 密码登录，自动刷新 access token，支持工作区与权限控制
- **本地安全**：统计页可开启密码锁屏保护，防止他人查看营业数据
- **数据管理**：支持清空历史数据或全部订单（不可恢复操作带二次确认）
- **实时体验**：订单操作采用乐观更新，失败自动回滚
- **主题**：浅色 / 深色 / 跟随系统，切换即时生效

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | React 19, React Router 8 |
| 语言 | TypeScript |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS v4, HeroUI 3 |
| 状态管理 | Zustand 5 |
| 日期处理 | dayjs |
| 移动端 | Capacitor 8（Android） |
| 测试 | Vitest, Testing Library |
| 包管理 | pnpm |

## 项目结构

```
├── android/                 # Capacitor 生成的 Android 工程
├── public/                  # 静态资源（logo、应用图标源图）
├── src/
│   ├── components/          # 通用组件（Header、密码锁屏、图标等）
│   ├── hooks/               # 自定义 Hook（认证引导、Android 返回键等）
│   ├── routes/              # 路由与访问守卫
│   ├── services/            # API 客户端、认证、订单、统计等服务层
│   ├── store/               # Zustand 状态仓库
│   ├── types/               # 领域类型定义
│   └── views/               # 页面（Auth / Home / Order / Statistics / Settings）
├── capacitor.config.ts      # Capacitor 配置
└── vite.config.ts
```

## 快速开始

环境要求：Node.js ≥ 24、pnpm 11。

```bash
# 安装依赖
pnpm install

# 启动开发服务器（默认 http://localhost:5173）
pnpm dev

# 类型检查并构建生产包
pnpm build

# 本地预览生产构建
pnpm preview

# 运行单元测试
pnpm test

# 代码检查
pnpm lint
```

## Android 打包

```bash
# 1. 构建 Web 资源
pnpm build

# 2. 将产物同步到 Android 工程
pnpm sync

# 3. 构建 APK
cd android
./gradlew assembleRelease
```

签名后的 APK 位于 `android/app/build/outputs/apk/release/`。

### 应用图标

`public/` 下的 logo 是图标源图，改动后可通过以下命令重新生成各尺寸的 Android 图标：

```bash
pnpm gen-icon
```

## CI 与发布

GitHub Actions（`.github/workflows/build.yaml`）在每次 push / PR 时自动执行：

1. 安装依赖并构建 Web 资源
2. 通过 Capacitor 同步到 Android 工程
3. 使用 Gradle 构建 Release APK
4. 用 `apksigner` 手动签名（签名密钥通过 CI Secrets 注入）
5. 上传构建产物

当推送 `v*` 版本标签时，还会额外调用 `gh release create` 自动创建 GitHub Release 并附带通用 APK。

## 相关项目

- **[legero-backend](https://github.com/dongwlin/legero-backend)**：Go 编写的后端服务，提供认证、订单、统计等 REST API。
