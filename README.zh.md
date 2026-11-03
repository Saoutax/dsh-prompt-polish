# @saoutax/dsh-prompt-polish · 提示词优化

[English](README.md) | 简体中文

一个 DeepSeek Harness 插件：用 AI 优化输入框中的提示词。

按钮位于输入框工具栏、模型选择器旁。点击后当前草稿被原地改写；按钮在 8 秒窗口内变为撤销控件。

## 安装

该包已发布到 npm，推荐直接用 DSH CLI 装进指定 profile：

```sh
dsh plugin --profile web add @saoutax/dsh-prompt-polish
```

也可以用已发布的 `.tgz`（见下方「发布」一节）或本地目录作为安装目标，适合离线安装或开发调试。

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

每次推送到 `main` 都会跑测试与构建校验；合并后由
[release-please](https://github.com/googleapis/release-please) 自动计算版本号、更新
`CHANGELOG.md` 并发布到 npm 与 GitHub Release，无需手动操作。提交信息需遵循
[Conventional Commits](https://www.conventionalcommits.org/)。

## 图标

工具栏与插件图标在构建期由 [Lucide](https://lucide.dev) 图标数据生成（`sparkles`、`undo-2`、`loader-circle`）。Lucide 采用 [ISC 许可](https://lucide.dev/license)；生成的 `icon.svg` 与应用内 SVG 保留该出处。

## 许可

插件自身代码为 MIT；捆绑的 Lucide 图形为 ISC（见上）。
