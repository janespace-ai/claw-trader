# sandbox-execution Specification

## Purpose

TBD — created by archiving change backtest-engine. Update Purpose after archive.

## Requirements

### Requirement: Docker 沙箱容器创建

系统 SHALL 为每次回测/选币任务创建一个独立的 Docker 容器执行用户 Python 代码。容器使用预构建的沙箱镜像（含 Python 3.11 + numpy + pandas + ta-lib + 回测框架）。

#### Scenario: 创建回测沙箱容器

- **WHEN** 收到一个新的回测任务
- **THEN** 系统创建 Docker 容器，配置如下：
  - 基础镜像: `claw-sandbox:latest`（预构建）
  - 文件系统: `--read-only`，用户代码通过 tmpfs 挂载到 `/workspace`
  - CPU: `--cpus=2`
  - 内存: `--memory=2g`
  - 进程数: `--pids-limit=100`
- **THEN** 容器启动后执行 `/workspace/runner.py`

#### Scenario: 容器执行超时强杀

- **WHEN** 沙箱容器运行时间超过配置的 `sandbox_timeout`（默认 30 分钟）
- **THEN** 系统 SHALL 强制停止并删除容器
- **THEN** 将任务状态标记为 `failed`，error 信息为 "execution timeout"

#### Scenario: 容器正常结束后清理

- **WHEN** 沙箱容器执行完成（无论成功或失败）
- **THEN** 系统 SHALL 在 10 秒内删除容器，释放资源

### Requirement: 网络隔离策略

系统 SHALL 确保沙箱容器无法访问外部网络，仅能连接 TimescaleDB（只读）和 backtest-engine 的 callback endpoint。

#### Scenario: 沙箱网络访问控制

- **WHEN** 沙箱容器被创建
- **THEN** 容器连接到专用 Docker network（`claw-sandbox-net`）
- **THEN** 容器可以通过该网络连接 TimescaleDB 5432 端口（只读用户）
- **THEN** 容器可以通过该网络连接 backtest-engine 的 `/internal/cb/*` endpoint
- **THEN** 容器无法访问任何其他网络地址（包括外网）

#### Scenario: 沙箱尝试访问外网

- **WHEN** 沙箱内 Python 代码尝试 `requests.get('https://example.com')`
- **THEN** 连接被拒绝或超时
- **THEN** 不影响任务执行，Python 代码自行处理异常

### Requirement: 代码合规检查（AST 静态分析）

系统 SHALL 在创建沙箱容器之前对用户提交的 Python 代码执行静态安全分析，拒绝包含危险操作的代码。

#### Scenario: 禁止危险 import

- **WHEN** 用户代码包含 `import os`、`import sys`、`import subprocess`、`import socket`、`import shutil`
- **THEN** 合规检查失败，返回错误 "forbidden import: os"
- **THEN** 不创建沙箱容器

#### Scenario: 禁止动态执行

- **WHEN** 用户代码包含 `exec()`、`eval()`、`compile()`、`__import__()`
- **THEN** 合规检查失败，返回错误 "forbidden function: exec"

#### Scenario: 禁止文件系统操作

- **WHEN** 用户代码包含 `open()`（文件操作）、`os.path`、`pathlib`
- **THEN** 合规检查失败

#### Scenario: 允许白名单模块

- **WHEN** 用户代码仅 import 白名单模块：`numpy`, `pandas`, `talib`, `math`, `datetime`, `collections`, `typing`, `dataclasses`, `decimal`, `json`（仅序列化用）
- **THEN** 合规检查通过

#### Scenario: 允许回测框架导入

- **WHEN** 用户代码包含 `from claw.strategy import Strategy` 或 `from claw.screener import Screener`
- **THEN** 合规检查通过（回测框架属于白名单）

### Requirement: 沙箱与主服务 HTTP Callback

系统 SHALL 通过 HTTP callback 机制让沙箱容器向 backtest-engine 报告执行进度和结果。

#### Scenario: 报告回测进度

- **WHEN** 回测引擎处理完一部分K线数据
- **THEN** 沙箱内框架代码调用 `POST /internal/cb/progress` 报告进度
  ```json
  {"task_id": "xxx", "phase": "backtesting", "current_bar": 5000, "total_bars": 10000}
  ```

#### Scenario: 报告回测完成

- **WHEN** 回测执行完成
- **THEN** 沙箱内框架代码调用 `POST /internal/cb/complete` 提交结果
  ```json
  {"task_id": "xxx", "metrics": {...}, "equity_curve": [...], "trades": [...]}
  ```

#### Scenario: 报告执行错误

- **WHEN** Python 代码运行时异常
- **THEN** 沙箱内框架代码调用 `POST /internal/cb/error` 报告错误
  ```json
  {"task_id": "xxx", "error": "ZeroDivisionError: division by zero", "traceback": "..."}
  ```

### Requirement: 数据库只读用户

系统 SHALL 创建 TimescaleDB 只读用户供沙箱容器使用，确保沙箱无法修改任何数据。

#### Scenario: 只读用户权限

- **WHEN** 系统初始化数据库
- **THEN** 创建 `claw_readonly` 用户
- **THEN** 授予 `claw` schema 下所有表的 SELECT 权限
- **THEN** 不授予 INSERT、UPDATE、DELETE、CREATE、DROP 权限

#### Scenario: 沙箱尝试写入数据

- **WHEN** 沙箱内代码尝试执行 `INSERT INTO claw.futures_5m ...`
- **THEN** 数据库返回权限错误
- **THEN** 已有数据不受影响
