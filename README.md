# 整点新闻节目单工作台

为编导制作的节目单编排/核对工具：边改草稿边即时看到后续段的开始时间变化；
硬整点新闻锚定整点，**不会因为前序音乐转场算错而晚播**（前序段被硬切并标出"超时侵入"）。
不接真实播控设备，播出侧用模拟事件代替。

## 技术栈

- **前端** Vue 3 + Vite（`web/`）：节目轨道表格、计划时间 vs 实际进度对照
- **后端** NestJS（`server/`）：接收模拟播出事件、重算时间账、版本发布
- **数据库** PostgreSQL（`embedded-postgres`，首次启动自动下载二进制并初始化集群，
  数据落盘 `./pgdata`，无需 root / 外部数据库服务）
- **共享时间账** `shared/timeline.ts`：前后端共用同一份计算，保证算的是同一本账

## 运行

```bash
npm install
npm run server     # 编译并启动 API（:3000，前缀 /api；首次启动初始化 PG 集群）
npm run dev:web    # 另开终端，前端开发服务器（:5173，/api 代理到 3000）
# 或 npm run build:web 产出静态文件
```

打开 http://localhost:5173 ，内置样例「上午板块节目单」（09:30 开播，14 段）。

## 核心规则（shared/timeline.ts）

- 普通段：`开始 = 上一段结束 - 上一段的转场重叠秒数`（音乐/台标的转场叠加）
- 硬整点段：开始锚定 `fixedStartSec`；前序超时部分记为 `prevOverrunSec`（被切），
  前序不足则留空档 `slackBeforeSec` —— 整点新闻绝不顺延
- 素材缺口：`gapSec = 计划时长 - 素材时长`（素材不足或未挂素材时显示）
- 草稿可反复改；**发布 = 复制为只读新版本**，草稿修改不会覆盖已发布版本

## 样例数据覆盖的三类核对场景

| 场景 | 样例 |
|---|---|
| 短台标插播 | 5s / 8s 的「台标短插播」ident 段 |
| 转场叠加 | 「音乐时光→整点新闻」叠加 15s、「音乐桥→剧场」叠加 10s |
| 缺少素材 | 「早间资讯杂志」缺 20s、「午间剧场·上」缺 80s，显示缺口 |

## 计划 vs 模拟播出对照

「发布与对照」页可对已发布版本生成模拟事件：

- **模拟播出·正常**：按计划的转场重叠执行，全部准点（漂移 0）
- **模拟播出·音乐转场算错**：音乐段之后的段不再提前切入（重叠被算成 0），
  误差向后累积（午间剧场·下晚 20s），但 10:00 / 12:00 两档新闻漂移仍为 0，
  前序音乐段被硬切（如「音乐时光」结束漂移 -8s）

也可逐条上报事件：`POST /api/rundowns/:id/events`，body `{"segmentId":1,"type":"start","atSec":34200}`。

## API 一览

```
GET    /api/materials
GET    /api/rundowns                     列表（草稿 + 各已发布版本）
GET    /api/rundowns/:id                 详情（含重算后的计划时间线）
POST   /api/rundowns                     新建草稿 {name, broadcastDate, dayStartSec}
PUT    /api/rundowns/:id/segments        整体替换草稿段，返回 affectedPositions（仅 draft）
POST   /api/rundowns/:id/publish         草稿 → 新的只读发布版本
POST   /api/rundowns/:id/events          记录模拟播出事件（仅 published）
DELETE /api/rundowns/:id/events          清空事件
POST   /api/rundowns/:id/simulate        生成一轮模拟事件 {musicOverlapFault?: bool}
GET    /api/rundowns/:id/compare         计划 vs 实际对照（含漂移秒数）
```

## 时间账核对示例（内置样例）

```
09:30:00 早间资讯杂志(20:00, 素材19:40 → 缺口20s)
09:50:00 台标短插播(8s)
09:50:08 音乐时光(10:00, 与下段叠加15s) → 10:00:08 结束
10:00:00 整点新闻(硬整点, 前空档7s)      ← 音乐跨过整点也不影响新闻
...
11:57:50 午间音乐桥(2:00)
12:00:00 正午新闻(硬整点, 前空档10s)
```

若把「早间资讯杂志」加长 60s：第 2、3 段开始时间顺延（界面黄底标出），
整点新闻仍 10:00:00 开播，并标出「前序超时 53s 被切」。
