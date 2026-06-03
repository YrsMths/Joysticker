# TieTie Frontend

这是一个以贴纸棋盘玩法为核心的小型游戏前端项目，基于 Vite、React、TypeScript 和 Tailwind CSS 构建。

## 当前结构

- `src/app`：应用入口与路由壳
- `src/game`：游戏页、游戏组件、游戏数据与游戏状态桥接层
- `src/shared`：通用 UI、通用 hooks 与通用工具桥接层
- `src/pages`：现有页面实现
- `src/components`：现有业务组件与 shadcn/ui 组件
- `public/assets`：本地静态资源
- `archive/workspace`：不影响运行的历史模板文件、中间文件和工作区文件

## 开发命令

```bash
pnpm i
pnpm run dev
pnpm run build
```

## GitHub Pages 部署

- 当前项目已配置为兼容本地开发与 GitHub Pages 普通项目仓库部署
- 本地开发使用根路径 `/`
- 生产构建自动使用仓库子路径 `/Joysticker/`
- GitHub Pages 目标地址：`https://yrsmths.github.io/Joysticker/`

### 自动部署方式

- 仓库根目录已提供工作流文件：`.github/workflows/deploy.yml`
- 推送到 `main` 分支后会自动执行依赖安装、构建，并将 `frontend/dist` 发布到 GitHub Pages

### 需要在 GitHub 仓库中开启的配置

- 进入仓库 `Settings`
- 打开 `Pages`
- 在 `Build and deployment` 中把 `Source` 设置为 `GitHub Actions`

### 常用命令

```bash
pnpm i
pnpm run dev
pnpm run build
pnpm run preview
```

### 说明

- 如果后续仓库名发生变化，需要同步修改 `frontend/vite.config.ts` 中的 `GITHUB_PAGES_REPO`
- 如果默认发布分支不是 `main`，需要同步修改 `.github/workflows/deploy.yml` 中的触发分支

## 说明

- 当前整理优先保证游戏可运行，因此对原有核心页面与业务组件保留兼容层。
- 后续如果继续重构，建议逐步把 `src/pages/Index.tsx` 中的规则、数据和 UI 进一步拆入 `src/game`。
