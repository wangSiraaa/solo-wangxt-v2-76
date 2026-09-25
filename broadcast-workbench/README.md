# 整点新闻播出工作台

为编导制作的节目单编排工作台：**边改节目单边看时间影响**，确保硬整点新闻绝不因前序音乐转场算错而晚播。

- 前端：Vue 3 + Vite —— 节目轨道、计划/实际进度对照、草稿编辑即时重算
- 后端：NestJS —— 接收模拟播出事件（不接真实播控设备）
- 数据库：PostgreSQL —— 保存素材与节目单（草稿/已发布/归档版本）

## 快速开始

```bash
docker compose up -d db          # 1. 起 PostgreSQL（端口 5432，库/账号/密码均为 broadcast）

cd server && npm install
npm run build && npm start       # 2. 后端 http://localhost:3000/api（首次启动自动写入演示数据）

cd ../web && npm install
npm run dev                      # 3. 前端 http://localhost:5173（/api 已代理到 3000）
```

打开 http://localhost:5173 即可看到当天 08:00–09:00 的「早间节目带」（已发布 v1 + 草稿）。

## 时间账规则（前后端同一份算法）

代码：`server/src/common/timeline.ts`（后端权威）与 `web/src/timeline.ts`（前端即时预览），修改需两边同步。

1. **普通节目段**：`计划开始 = 上一段计划结束 − 本段转场重叠`，重叠被钳制在上一段时长内。
2. **硬整点段**（⏰ 单独标识）：计划开始钉死在设定时刻，**不吸收重叠、不被前序超时推迟**。
   - 前序结束时距整点有富余 → 记**缺口**（素材不足，需补片）；
   - 前序结束冲过整点 → 记**冲突**（前序将被硬切，整点照常开播）。
3. **偏差** = 模拟播出事件时刻 − 计划时刻（正=晚播，负=早播，容差 ±2s 内算准点）。

## 内置样例（种子数据）与核对结果

| 样例 | 数据 | 时间账 |
|---|---|---|
| 短台标插播 | 08:08:00 插入 10s 台标 | 后续段开始时间整体 +10s |
| 转场叠加 | 民谣音乐与台标重叠 5s | 音乐 08:08:05 开播（回叠 5s），净影响 +5s |
| 缺少素材 | 09:00 新闻前只有 08:55:15 的素材尾 | 显示 285s 缺口；09:00 新闻仍准点 |

以上样例由 `server/test/timeline.spec.ts`（纯函数单测）与 `server/test/app.e2e.spec.ts`（pg-mem 内存库全链路）自动核对：

```bash
cd server && npm test
```

## 典型操作流

1. **改草稿看影响**：在「草稿节目单」表格里改时长/重叠/硬整点、增删段、上下移动 —— 右侧「影响」列即时显示每段与已发布版的开始时间差（+35s / 新增 / —），缺口与冲突即时亮出；松开输入 600ms 后自动保存草稿。
2. **发布**：点「发布草稿」→ 生成 v(n+1) 已发布版，旧版归档（archived）。**草稿的日常修改不会触碰已发布版本**（接口层强制：PUT items 仅接受草稿）。
3. **模拟播出**：点「模拟播出」注入演示场景（晨间音乐 +20s、专题 +35s），对照表与实际轨道显示偏差如何沿软段累积、**09:00 硬整点新闻依旧准点**；「清除事件」可复位。

## API 一览（前缀 /api）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/schedules/board?date=YYYY-MM-DD` | 主面板：已发布 + 草稿（各带时间账） |
| POST | `/schedules/:id/draft` | 从某节目单生成草稿（同日已有草稿则复用） |
| PUT | `/schedules/:id/items` | 整体替换**草稿**节目段（已发布返回 400） |
| POST | `/schedules/:id/publish` | 发布草稿：旧版归档，生成 version+1 |
| GET | `/schedules/:id/comparison` | 计划 vs 模拟播出事件对照 + 汇总 |
| POST | `/schedules/:id/simulate` | 生成模拟事件，body：`{ overrides: [{ itemId, extraDurationSec?, startDelaySec? }] }` |
| POST | `/events` | 注入单条事件：`{ scheduleId, itemId, type: start\|end, occurredAt }` |
| GET/DELETE | `/events?scheduleId=` | 查询 / 清空某节目单事件 |
| GET/POST | `/materials` | 素材列表 / 新增素材 |

## 版本与血缘设计

- 节目段带 `sourceItemId`：草稿从已发布复制时指向源段，发布时延续。前端用 `sourceItemId ?? id` 作为对照键，精确标出「受影响的后续开始时间」，新增/移除的段也能识别。
- 同一播出日：一个 `published` + 一个 `draft` + 若干 `archived`。发布在事务内完成「归档旧版 + 写入新版」。

## 环境变量（后端）

`PGHOST`（默认 localhost）、`PGPORT`（5432）、`PGUSER`/`PGPASSWORD`/`PGDATABASE`（默认 broadcast）、`PORT`（3000）。
