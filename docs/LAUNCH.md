# MaskDrop product introductions

Copy-ready descriptions for the project. These are drafts, not announcements posted to other services.

## English

### Short description

Review what leaves your clipboard. A local workspace for cleaning logs and configs before sharing, with a browser playground and a dependency-free Node CLI.

### Post-length introduction

MaskDrop: review logs and configs before sharing with AI or a public issue. Local browser + zero-dependency Node CLI. Keep or mask matches, add private terms, export text/Markdown. Detection is heuristic; review the output. https://github.com/kingsley506/maskdrop

### Longer introduction

A debug log can contain more than the error you meant to share. MaskDrop puts the source, detected findings, and a sharing preview in one local workspace. Check why each item was flagged, keep harmless occurrences, add private company names or internal hosts, then copy or download the processed result.

There is no account, AI API, analytics, or backend. The browser and dependency-free Node CLI use the same detection core. Try a fictional sample in the playground, or run a reviewed copy locally for sensitive work. Detection is heuristic and incomplete, so give the entire output a final read.

### GitHub release summary

**MaskDrop v0.1.0 — Review what leaves your clipboard.**

The first public release brings a local browser workspace and a dependency-free Node CLI for reviewing logs, configs, and support snippets before sharing.

- Review detected credentials and optional personal details alongside the source and preview.
- Keep or mask individual occurrences; add exact private terms.
- Preserve repeated-value placeholders within each detection category.
- Import local UTF-8 text files up to 1 MiB; copy or download text and Markdown.
- Use stdin or file input/output in the CLI, with secrets-only mode and a counts-only report.

[Try the playground](https://kingsley506.github.io/maskdrop/) · [Read the rules and limitations](https://github.com/kingsley506/maskdrop#what-it-detects)

Detection can miss sensitive content and produce false positives. Review the output before sharing; kept occurrences remain visible. Use a reviewed local copy for sensitive material.

## 中文

### 一句话简介

分享之前，看清剪贴板里有什么。MaskDrop 是本地运行的日志与配置检查工具，提供浏览器工作台和零依赖 Node 命令行。

### 短文案

做了一个分享前用的小工具 MaskDrop：日志、配置发给 AI 或公开 Issue 之前，先看一眼可能带出的密钥和个人信息。支持逐条保留/替换、自定义私密词、纯文本和 Markdown 导出。浏览器本地处理，另有零依赖 Node CLI。规则可能漏检，分享前仍需核对。

https://github.com/kingsley506/maskdrop

### 产品介绍

你想分享的可能只是一段报错，日志里却还带着令牌、邮箱或连接密码。MaskDrop 把原文、检测原因和分享预览放在同一个本地工作台里：逐条决定保留或替换，补充公司名、内部域名等私密词，再复制或下载处理结果。

它不需要账号、AI API 或后端，也没有统计分析。浏览器和零依赖 Node 命令行共用检测核心。可以先打开在线示例体验；处理敏感材料时，建议运行自己检查过源码的本地副本。检测基于启发式规则，不能保证找全，分享前请核对完整结果。

### GitHub Release 简介

**MaskDrop v0.1.0：分享之前，看清剪贴板里有什么。**

首个公开版本提供浏览器工作台与零依赖 Node 命令行，用于在分享日志、配置和工单片段前检查可能的敏感内容。

- 原文、检测结果、分享预览并排核对。
- 每次出现的内容可单独保留或替换，也能添加自定义私密词。
- 同一检测类别中的相同值使用一致占位符。
- 本地导入不超过 1 MiB 的 UTF-8 文本，支持复制或下载纯文本及 Markdown。
- 命令行支持标准输入、指定文件、仅检测密钥模式和不含原始值的数量摘要。

[在线体验](https://kingsley506.github.io/maskdrop/) · [中文说明](https://github.com/kingsley506/maskdrop/blob/main/README.zh-CN.md)

检测可能漏检或误判，主动保留的内容会出现在导出结果中。分享前请检查完整输出，处理敏感材料时建议使用审阅过的本地副本。
