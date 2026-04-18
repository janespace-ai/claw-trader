## MODIFIED Requirements

### Requirement: 每次同步前自动刷新

系统 SHALL 在每次执行同步管线前自动刷新币种列表,确保使用最新的 top 300 排名。触发点 SHALL 为 `data-aggregator` 进程启动后 boot 管线的第一个阶段,不再依赖任何外部 HTTP 调用。

#### Scenario: 启动时自动刷新

- **WHEN** `data-aggregator` 进程启动并完成 DB migration
- **THEN** boot 管线首先刷新币种列表(调用 Gate.io tickers API)
- **THEN** 然后基于最新列表执行后续的 gap 检测、S3 下载和 API 补全

#### Scenario: 进程不重启期间币种列表不自动刷新

- **WHEN** aggregator 已经完成 boot 管线并处于空闲状态
- **THEN** 系统 SHALL NOT 自行触发币种列表刷新(周期性刷新属于后续 change 范围)
- **THEN** 运维若想获取最新排名,需要重启 aggregator 进程
