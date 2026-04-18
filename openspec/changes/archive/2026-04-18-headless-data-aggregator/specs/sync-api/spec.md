## REMOVED Requirements

### Requirement: 同步触发 API

**Reason**: `data-aggregator` 改为启动即自动执行同步管线,不再对外提供触发接口。触发语义迁移到 `aggregator-bootstrap` 能力。
**Migration**: 运维想要"再跑一次"时,直接重启 aggregator 进程。桌面端和前端 SHALL NOT 调用 aggregator 的任何接口。

### Requirement: 同步进度查询 API

**Reason**: aggregator 不再对外暴露业务 HTTP 接口。进度只通过日志观察。
**Migration**: 观察 aggregator 容器日志。若未来需要 UI 化进度展示,应作为单独 change,将状态写入 DB 后由 `backtest-engine` 暴露只读接口。

### Requirement: 币种列表查询 API

**Reason**: 查询接口迁移到 `backtest-engine`,以实现"aggregator 只写、backtest-engine 只读"的分离。
**Migration**: 调用方改用 `backtest-data-gateway` 能力下的 `GET /api/symbols`(由 `backtest-engine` 提供,路径与返回格式 1:1 兼容)。

### Requirement: Gap 查询 API

**Reason**: 同上,迁移至 `backtest-engine`。
**Migration**: 调用方改用 `backtest-data-gateway` 能力下的 `GET /api/gaps`。

### Requirement: Gap 修复触发 API

**Reason**: aggregator 不再提供任何触发接口。gap 检测与修复作为 boot 管线的一部分自动执行。
**Migration**: 若需强制再次修复,重启 aggregator 进程。本次 change 不提供其他手动触发机制。

### Requirement: K线数据查询 API

**Reason**: 查询接口迁移到 `backtest-engine`。
**Migration**: 调用方改用 `backtest-data-gateway` 能力下的 `GET /api/klines`(路径与返回格式 1:1 兼容)。
