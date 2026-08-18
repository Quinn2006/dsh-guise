# dsh-guise · 人设衣橱

> 给 DSH 的 agent 穿上主人钦定的人设——多套人格随心换，全局或按工作区生效，没钱了还会懒洋洋地说句俏皮话再下线。

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**dsh-guise（人设衣橱）** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的人设系统插件：把 agent 的人格与说话风格变成随手可管理的东西——像衣橱一样，收藏多套人设，想穿哪套穿哪套。文件即配置、保存即生效、零依赖、热插拔。

---

## ✨ 功能一览

| 功能 | 说明 |
| --- | --- |
| 👗 **人设库** | 保存多套人设（家猫萝莉、技术专家、毒舌损友……），随时增删改、一键切换 |
| 🌐 **全局 / 局部** | 全局人设对所有会话生效；每个工作区可单独覆盖（存在即优先） |
| 🔘 **总开关** | 面板顶部一键启停人设注入，人设库内容保留 |
| 💰 **余额预警** | 可调阈值的余额监测（默认 1 元），低于阈值时新对话不再请求 API |
| 🔋 **没电模式** | 额度耗尽 / 上下文超限时，以「懒散·天然呆·爱 Tokens」的口吻替 agent 说随机俏皮话再结束对话 |
| 🎭 **话术主题包** | 没电模式 4 套风格可切换：混合慵懒 / 慵懒猫系 / 天然呆 / 沙雕 |
| 📊 **用量统计** | 按工作区 / 按对话统计消耗的余额与 tokens：对话框上方实时显示本对话消耗，工作区列表标注每个工作区的总消耗（面板可开关、可清零） |
| 🕘 **历史版本** | 每次编辑人设自动留档（最多 100 条），一键回滚任意历史版本 |

---

## 📦 安装

```bash
dsh plugin --profile web add github:Quinn2006/dsh-guise
```

（或本地目录 `dsh plugin --profile web add link:<本目录绝对路径>`。插件声明了 `dsh.bundle.patch`，纯 insert 补丁行支持免重启热挂载；客户端面板需重启一次进入启动图。安装后侧边栏出现「人设」入口。）

---

## 🎭 使用指南

### 人设文件约定

| 位置 | 路径 | 说明 |
| --- | --- | --- |
| 全局人设 | `~/.dsh/.persona/global.txt` | 对所有会话生效 |
| 人设库 | `~/.dsh/.persona/library/<id>.txt` | 每个文件一个人设；首行 `# 名称` 为显示名 |
| 局部人设 | `<工作区>/.persona.txt` | 存在时覆盖全局，只影响该工作区 |
| 总开关 | `~/.dsh/.persona/enabled.txt` | 内容 `0` / `off` = 关闭人设注入 |
| 预警阈值 | `~/.dsh/.persona/balance-min.txt` | 余额低于该金额（元）触发没电模式 |
| 话术主题 | `~/.dsh/.persona/tired-theme.txt` | 没电模式主题：`default` / `cat` / `daze` / `silly` |
| 没电话术 | `~/.dsh/.persona/tired-lines.txt` | 每行一条自定义话术（存在时优先于主题），首行 `off` 关闭 |
| 用量统计 | `~/.dsh/.persona/usage.json` | 按工作区 / 会话的 token 消耗与估算费用（自动写入） |
| 用量开关 | `~/.dsh/.persona/usage-enabled.txt` | 内容 `0` / `off` = 暂停用量统计（历史数据保留） |
| 历史版本 | `~/.dsh/.persona/history.json` | 自动留档（最多 100 条），面板可恢复 |

### 文件内容规则（全局与局部通用）

- **直接写人设文本**：人格、语言、语气、口癖、自称、句尾表情……写什么，agent 就变成什么样
- **引用人设库**：整文件只写一行 `@preset:<id>`
- **关闭**：首行写 `off` / `disabled`
- **生效时机**：修改后**下一次模型请求自动生效**，无需重启

### GUI 面板（侧边栏「人设」）

- **用量统计**：一键启停消耗统计 + 全部清零；工作区下拉里每个工作区标注 `名称(总余额/总tokens)`
- **余额预警**：阈值输入 + 保存 + 实时余额显示（每分钟刷新）
- **话术主题**：没电模式 4 套风格下拉切换，保存即生效
- **总开关**：一键启停人设注入
- **全局人设**：自定义文本 / 使用人设库的人设 / 关闭
- **工作区人设**：从 DSH 工作区列表下拉选择（或手动路径），每个工作区单独设置
- **人设库**：新建（名称+内容）、编辑、删除、预览
- **历史版本**：最近 15 条编辑记录，一键恢复任意版本

### 用量统计（Usage Accounting）

- **对话框上方横幅**：实时显示**本对话**消耗的余额与 tokens（每次模型响应后自动累计，15 秒轮询刷新）
- **工作区总消耗**：面板的工作区下拉中，每个工作区标注该工作区**所有任务**的累计消耗，如 `插件(0.42/34,567)`
- **统计口径**：宿主监听 `session/event`，每个带 usage 的模型响应按 `prompt_tokens × 输入单价 + completion_tokens × 输出单价` 估算金额（DeepSeek 官方默认 2 / 8 元每百万 tokens，`usage.prices` 可调）
- **开关**：面板「用量统计」区块（余额预警上方）一键启停；关闭时停止统计，历史数据保留
- **清零**：面板「清零统计」按钮重置全部工作区数据

---

## 🔋 没电模式（Tired Mode）

### 触发条件

模型请求失败且失败码为以下之一：

- `QUOTA`（额度/余额耗尽）
- `CONTEXT_WINDOW_EXCEEDED`（上下文超限）
- 任何含 `BALANCE` / `CREDIT` / `INSUFFICIENT` 的失败码

### 话术主题包

| 主题 id | 风格 | 特点 |
| --- | --- | --- |
| `default` | 混合慵懒 | 懒散+天然呆+爱 Tokens 混合（默认） |
| `cat` | 慵懒猫系 | 喵喵口癖、摊成猫饼、晒太阳 |
| `daze` | 天然呆 | 歪头、发呆、思路被猫叼走 |
| `silly` | 沙雕 | 表情包语气、螺旋升天、私奔 |

每套主题 25 条独立句式（共 100 条，零重复）× 5 种 Tokens 说法随机组合；自定义话术文件存在时优先于主题。

### 行为

- 宿主**替 agent** 追加一条消息，以所选主题的口吻说话，同一失败回合只说一次
- 触发后停止继续请求 API 并结束对话

### 余额预检（Balance Guard）

- 每次新对话开始前查询 DeepSeek 账户余额（约每分钟一次缓存）
- 余额 **≤ 阈值**（默认 1 元，面板可调）：不请求 API，说随机话术并结束对话，直到余额超过阈值
- 余额查询失败或没有 API Key：**不拦截，正常放行**

### 自定义话术

`~/.dsh/.persona/tired-lines.txt`，每行一条（`#` 注释）；模板里可写 `{{food}}` 槽位自动随机填 Tokens 说法；首行 `off` 关闭。完整内置话术见 [`examples/tired-lines-all.txt`](examples/tired-lines-all.txt)。

---

## 🕘 历史版本

- 每次保存人设（人设库 / 全局 / 工作区）且内容有变化时，自动把**旧内容**写入 `~/.dsh/.persona/history.json`（最多 100 条）
- 面板「历史版本」区块显示最近 15 条（类型 + 时间 + 首行预览），点「恢复」即回滚
- 文件 `history.json` 是纯 JSON，也可以手工翻阅或删除

---

## ⚙️ 配置（cordis 行 config）

```yaml
- id: guise
  name: 'dsh-guise'
  config:
    enabled: true            # 插件总开关
    announceToAgent: true    # 是否向 agent 通告插件机制
    order: -50               # 人设段注入顺序（负数 = 在部署 persona 之前）
    announceOrder: 150       # 通告段顺序
    localFile: .persona.txt  # 局部人设文件名
    wrapper: true            # 是否加身份设定前缀
    tired:
      enabled: true          # 没电模式开关
      balanceCheck: true     # 余额预检开关
      balanceMin: 1          # 预警阈值（元），面板修改优先
      codes: []              # 额外触发失败码，如 [RATE_LIMIT]
    usage:
      enabled: true          # 用量统计开关（面板开关优先）
      prices:
        input: 2             # 输入单价（元 / 百万 tokens）
        output: 8            # 输出单价（元 / 百万 tokens）
```

---

## 🔌 API（仅本机 loopback）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-persona/state?cwd=<路径>` | 人设库 + 全局 + 局部 + 总开关 + 阈值 + 生效状态 |
| GET | `/api/dsh-persona/workspaces` | DSH 工作区列表 |
| GET | `/api/dsh-persona/balance` | 当前余额 + 阈值 + 是否充足 |
| POST | `/api/dsh-persona/balance-min` | `{value}` 保存预警阈值 |
| GET | `/api/dsh-persona/tired-theme` | 当前主题 + 全部主题 |
| POST | `/api/dsh-persona/tired-theme/save` | `{theme}` 切换话术主题 |
| GET | `/api/dsh-persona/history` | 历史版本列表 |
| POST | `/api/dsh-persona/history/restore` | `{type, key, at}` 恢复历史版本 |
| POST | `/api/dsh-persona/library/save` | `{id?, name, text}` 存人设 |
| POST | `/api/dsh-persona/library/delete` | `{id}` 删人设 |
| POST | `/api/dsh-persona/global/save` | `{text}` 保存全局人设 |
| POST | `/api/dsh-persona/local/save` | `{cwd, text}` 保存工作区人设 |
| POST | `/api/dsh-persona/switch` | `{enabled}` 总开关 |
| GET | `/api/dsh-persona/usage` | 用量统计：开关状态 + 各工作区 / 会话的 tokens 与估算费用 |
| POST | `/api/dsh-persona/usage/switch` | `{enabled}` 用量统计开关 |
| POST | `/api/dsh-persona/usage/reset` | `{cwd?}` 清零用量（缺省全部，可指定工作区） |

---

## 🗂️ 目录结构

```
dsh-guise/
├── lib/
│   ├── index.js      # 宿主插件：人设段注入 + 通告 + 路由 + 没电模式 + 余额预检 + 用量统计
│   ├── store.js      # 人设库 / 全局 / 局部 / 总开关 / 阈值 / 历史 / 主题 的文件存取
│   ├── balance.js    # DeepSeek 余额查询（缓存 60s，失败放行）
│   ├── tired.js      # 话术主题池（4 套 × 随机组合 + 自定义文件）
│   ├── usage.js      # 用量统计：按工作区/会话记账 + 单价估算 + 持久化
│   ├── home.js       # DSH 主目录解析
│   └── client.js     # 浏览器面板（侧边栏「人设」入口 + 抽屉面板 + 对话框上方消耗横幅）
├── cordis.patch.yml  # bundle 补丁（纯 insert，可热挂载）
├── examples/
│   ├── global.txt            # 人设示例（家猫萝莉）
│   └── tired-lines-all.txt   # 没电话术全集（80 句）
├── README.md         # 本说明书
├── USAGE.md          # 详细使用手册
├── INTRO.md          # 插件介绍（中英双语）
└── MARKET-SUBMISSION.md  # dsh-market 上架指南
```

---

## 📄 许可证

MIT
