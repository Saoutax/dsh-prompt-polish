# @saoutax/dsh-prompt-polish · 提示词优化

[English](README.md) | 简体中文

一个 DeepSeek Harness 插件：用 AI 优化输入框中的提示词。

按钮位于输入框工具栏、模型选择器旁。点击后当前草稿被原地改写；按钮在 8 秒窗口内变为撤销控件。

## 功能

- **原地改写** —— 草稿被替换为优化后的文本；不向会话提交任何内容，不产生聊天行。
- **一次撤销** —— 优化前的草稿保留 8 秒；再次点击按钮即恢复。
- **引用 chip 保留** —— `@文件` / `@会话` 引用被重新锚定进优化文本；改写后不再出现的引用会追加到末尾而不是被丢弃。
- **命令草稿同样可优化** —— 以已认领命令 chip 开头的草稿（计划模式的 `/plan`、菜单选中的斜杠命令）与普通草稿一样可以优化：只改写命令 token 之后的正文，命令认领原样保留。只有 `/plan` chip 而没有任务正文时无内容可优化，按钮保持隐藏，输入任务后出现。
- **模型可选** —— 在插件行配置 `provider` / `model`；留空则跟随当前会话的路由（含思考等级），再回落到部署默认模型。
- **快捷键** —— Windows/Linux 为 `Ctrl+Shift+.`，macOS 为 `Cmd+Shift+.`，作用于当前聚焦会话的按钮动作。

## 配置

| 字段              | 默认值                        | 含义                                     |
| ----------------- | ----------------------------- | ---------------------------------------- |
| `provider`        | `""`                          | 改写使用的 provider 路由；留空跟随会话。 |
| `model`           | `""`                          | 改写使用的模型 id；留空跟随会话。        |
| `instructions`    | 空 → 读取 `prompts/polish.md` | 定义"优化"含义的系统指令。               |
| `maxInputChars`   | `8000`                        | 单次改写接受的最长草稿。                 |
| `maxOutputTokens` | `2000`                        | 向模型请求的输出 token 数。              |
| `temperature`     | `0.3`                         | 采样温度。                               |

默认指令只存在于 `prompts/polish.md`：构建时该文件被复制进包内，Host 在激活时读取。
没有编译进代码的副本会与之漂移，因此指令文件缺失或为空时插件会带着明确的错误拒绝
激活，而不是悄悄丢掉规则继续跑。需要按插件行覆盖时设置 `instructions`。

## 目录结构

```
src/host/          Host 半：config / route / answer / instructions / service / http / index
src/client/        Client 半：contracts / bridge / locale / button / shortcut / styles / index
src/shared.ts      两半共用的结果契约
src/draft.ts       引用 chip 重锚定与草稿重建
src/icons.ts       Lucide 图标渲染
prompts/polish.md  默认优化指令（Markdown，可编辑）
locale/            元数据（en/zh.json）与 Client 词典（en-US/zh-CN.json）
scripts/build.mjs  esbuild 双产物构建
```

## 开发

```sh
pnpm install
pnpm run build     # 构建两半产物 + 刷新 icon.svg
pnpm run check     # oxfmt + oxlint(type-aware) + tsc + build
pnpm run fmt       # 格式化
pnpm run lint      # 语法 lint
```

- `src/host/` 构建为 `lib/index.js`（ESM；Harness 包保持 external，运行时经 dsh 的 peer 解析拦截路由到安装目录）。
- `src/client/` 构建为 `lib/client.js`，包装为 `window.__ModuleLoader__.load({ id, factory })` 注册调用；React 来自页面模块表，本包不内置。
- lint 强制三条风格约束：导出置于文件末尾（`import/exports-last`）、语句大括号（`curly`）、函数表达式（`func-style`）。

通过 harness 安装时以本目录为安装目标，或使用已发布的 `.tgz`（见下）。

## 发布

仓库在 `.github/workflows/` 下有两套工作流。

`ci.yml` 在每次发起 PR 和每次推送到 `main` 时校验：按已提交的 lockfile 以
`--frozen-lockfile` 安装，然后执行 `pnpm run check`（oxfmt、oxlint type-aware、
两个 `tsc` 项目、esbuild 打包）。它不做任何发布或写操作。

`release.yml` 在推送到 `main` 时触发，含两个 job：

1. **版本与打标** —— [release-please](https://github.com/googleapis/release-please)
   维持一个常驻的 release PR，累积自上个 tag 以来合入的 Conventional Commits，
   给出下一个版本号与 `CHANGELOG.md` 条目。合并该 PR 才会创建 `vX.Y.Z` tag 与
   GitHub Release。
2. **构建并挂载插件包** —— 仅在实际产生了新 release 时运行。它检出该 tag、重新
   构建产物（`lib/` 是生成物且被 git 忽略，检出后并不存在）、执行 `pnpm pack`，
   把得到的 `.tgz` 上传到该 Release。这个 tarball 就是 DSH bundle 的便携安装目标，
   可直接交给 harness 的插件管理器。

版本从 `0.1.0` 开始：`release-please-config.json` 里的 `initial-version` 钉住首次
版本，否则在没有历史 tag 的情况下 release-please 会默认以 `1.0.0` 起步。
`.release-please-manifest.json` 在首次发布前保持 `0.0.0` —— release-please 把这个
哨兵值当作"尚未发布"，转而采用 `initial-version`。此后主版本仍为 `0` 期间，`feat`
递增次版本、`fix` 递增补丁版本（`bump-minor-pre-major`）。

提交信息需遵循 [Conventional Commits](https://www.conventionalcommits.org/)，
release-please 才能识别；`ci`、`chore`、`test` 不进 changelog。

两套工作流默认使用 `GITHUB_TOKEN`，无需任何 secret。但用该 token 开出的 PR 不会
再触发其他工作流，因此 release PR 上不会出现 CI 运行记录。如需让 release PR 也跑
CI，添加 `RELEASE_PLEASE_TOKEN` 仓库 secret（一个 personal access token），工作流
会自动改用它。

## 图标

工具栏与插件图标在构建期由 [Lucide](https://lucide.dev) 图标数据生成（`sparkles`、`undo-2`、`loader-circle`）。Lucide 采用 [ISC 许可](https://lucide.dev/license)；生成的 `icon.svg` 与应用内 SVG 保留该出处。

## 许可

插件自身代码为 MIT；捆绑的 Lucide 图形为 ISC（见上）。
