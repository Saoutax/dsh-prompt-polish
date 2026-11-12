# @saoutax/dsh-prompt-polish · 提示词优化

[English](README.md) | 简体中文

这是一个 DeepSeek Harness 插件，用 AI 优化输入框中的提示词。

按钮位于输入框工具栏中，紧邻模型选择器。点击按钮后，当前草稿会原地改写。改写后的 8 秒内，按钮会变为撤销控件。

## 安装

该包已发布到 npm。推荐使用 DSH CLI 将其安装到指定的 profile：

```sh
dsh plugin --profile web add @saoutax/dsh-prompt-polish
```

也可以使用已发布的 `.tgz`（见下方「发布」一节）或本地目录作为安装目标。这些方式适合离线安装和开发调试。

## 功能

- **原地改写**：草稿会被替换为优化后的文本。插件不会向会话提交内容，因此不会产生聊天消息。
- **支持撤销**：优化前的草稿会保留 8 秒。再次点击按钮即可恢复。
- **引用 chip 会保留**：`@文件` 和 `@会话` 引用会被重新定位到优化后的文本中。如果改写结果不再包含某个引用，插件会把它追加到末尾，而不是丢弃。
- **命令草稿同样可以优化**：以已认领的命令 chip 开头的草稿（例如计划模式的 `/plan`、从菜单中选中的斜杠命令）可以像普通草稿一样优化。插件只改写命令 token 之后的正文，命令认领保持不变。如果 `/plan` chip 后面没有任务正文，就没有可优化的内容，按钮会保持隐藏，直到你输入任务。
- **模型选择**：在插件行中设置 `provider` 和 `model`，也可以留空，跟随当前会话的路由（包括思考强度）。如果会话没有提供路由，插件会使用部署的默认模型。
- **键盘快捷键**：Windows 和 Linux 使用 `Ctrl+Shift+.`，macOS 使用 `Cmd+Shift+.`，对当前聚焦的会话执行按钮动作。
- **历史会话可用**：打开历史会话后可以直接优化。插件会先恢复该会话，因此不需要在第一次优化前发送消息。
- **临时错误提示**：插件会用自己的临时提示显示失败信息。提示会自动消失，切换会话后不会再次出现。

## 配置

| 字段              | 默认值                        | 含义                                       |
| ----------------- | ----------------------------- | ------------------------------------------ |
| `provider`        | `""`                          | 改写使用的 provider 路由。留空时跟随会话。 |
| `model`           | `""`                          | 改写使用的模型 ID。留空时跟随会话。        |
| `instructions`    | 空 → 读取 `prompts/polish.md` | 定义“优化”具体含义的系统指令。             |
| `maxInputChars`   | `8000`                        | 单次改写接受的最长草稿长度。               |
| `maxOutputTokens` | `2000`                        | 向模型请求的输出 token 上限。              |
| `temperature`     | `0.3`                         | 采样温度。                                 |

默认指令只存在于 `prompts/polish.md`。构建时，该文件会被复制到包中，Host 在插件激活时读取。插件没有内置副本，因此该文件是默认指令的唯一来源。如果文件缺失或为空，插件会拒绝激活并给出明确错误，而不会在缺少规则的情况下继续运行。需要按插件行覆盖默认指令时，设置 `instructions`。

## 目录结构

```
src/host/          Host 端：config / route / answer / instructions / service / http / index
src/client/        Client 端：contracts / bridge / locale / button / shortcut / styles / index
src/shared.ts      两端共用的结果类型
src/draft.ts       引用 chip 重新定位与草稿重建
src/icons.ts       Lucide 图标渲染
prompts/polish.md  默认优化指令（Markdown，可编辑）
locale/            元数据（en/zh.json）与 Client 词典（en-US/zh-CN.json）
scripts/build.mjs  构建产物
```

## 开发

```sh
pnpm install
pnpm run build     # 构建两端产物并刷新 icon.svg
pnpm run check     # oxfmt + oxlint（类型检查）+ tsc + build
pnpm run fmt       # 格式化
pnpm run lint      # 语法检查
```

- `src/host/` 构建为 `lib/index.js`（ESM）。Harness 包不会打包进产物，运行时会从 dsh 安装目录解析。
- `src/client/` 构建为 `lib/client.js`，并包装成 `window.__ModuleLoader__.load({ id, factory })` 注册调用。React 和 ReactDOM 由页面模块表提供，不会打包进本包。

通过 Harness 安装时，可以使用本目录作为安装目标，也可以使用已发布的 `.tgz`（见下）。

## 发布

每次推送到 `main` 都会运行测试和构建检查。合并后，[release-please](https://github.com/googleapis/release-please) 会自动计算版本号、更新 `CHANGELOG.md`，并发布到 npm 与 GitHub Release，无需手动操作。提交信息需要遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

## 图标

工具栏与插件图标在构建时由 [Lucide](https://lucide.dev) 的图标数据生成（`sparkles`、`undo-2`、`loader-circle`）。Lucide 采用 [ISC 许可](https://lucide.dev/license)。生成的 `icon.svg` 和应用内 SVG 会保留该署名。

## 许可

插件自身的代码采用 MIT 许可；捆绑的 Lucide 图形采用 ISC 许可（见上）。
