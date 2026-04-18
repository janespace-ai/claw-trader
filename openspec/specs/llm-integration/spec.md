# llm-integration Specification

## Purpose

TBD — created by archiving change desktop-client. Update Purpose after archive.

## Requirements

### Requirement: 多 LLM 供应商支持

系统 SHALL 支持以下 5 家 LLM 供应商，通过统一适配层调用：
- OpenAI（GPT-4o 等）
- Anthropic（Claude Sonnet/Opus 等）
- DeepSeek（deepseek-chat 等）
- Google（Gemini 2.0 Flash 等）
- Kimi / Moonshot（moonshot-v1-128k 等）

#### Scenario: 使用 OpenAI 模型对话

- **WHEN** 用户配置了 OpenAI API Key 并选择 GPT-4o
- **THEN** 系统通过 OpenAI Chat Completions API 发送请求
- **THEN** 流式返回响应内容

#### Scenario: 使用 DeepSeek 模型对话

- **WHEN** 用户配置了 DeepSeek API Key
- **THEN** 系统使用 OpenAI 兼容格式，baseURL 设为 `api.deepseek.com`
- **THEN** 功能与 OpenAI 适配器一致

#### Scenario: 使用 Kimi 模型对话

- **WHEN** 用户配置了 Kimi API Key
- **THEN** 系统使用 OpenAI 兼容格式，baseURL 设为 `api.moonshot.cn`

### Requirement: 流式输出

系统 SHALL 支持所有 LLM 的流式响应（streaming），实时逐字展示 AI 回复。

#### Scenario: 流式展示 AI 回复

- **WHEN** 用户发送消息后 AI 开始生成回复
- **THEN** 对话面板实时逐字显示回复内容（不等待完整响应）
- **THEN** 显示打字指示器（typing indicator）

#### Scenario: 流式响应中断

- **WHEN** 用户在 AI 生成过程中点击「停止」
- **THEN** 立即中断流式请求
- **THEN** 保留已生成的部分内容

### Requirement: API Key 本地管理

系统 SHALL 在本地存储用户的 LLM API Key，支持多个供应商同时配置。

#### Scenario: 配置 API Key

- **WHEN** 用户在设置页面填入 OpenAI API Key
- **THEN** Key 存储到本地 SQLite settings 表
- **THEN** 下次启动自动加载

#### Scenario: 切换默认模型

- **WHEN** 用户在设置中将默认模型从 GPT-4o 切换为 Claude
- **THEN** 后续所有 AI 对话使用 Claude API
- **THEN** 已有对话历史不受影响

#### Scenario: API Key 无效

- **WHEN** 用户配置的 API Key 无效或过期
- **THEN** 系统在首次调用时显示明确错误提示："API Key 无效，请检查设置"
- **THEN** 不重试，等待用户修正
