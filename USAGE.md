# dsh-guise · 使用手册

## 一、人设（Persona）—— 定义 agent 的人格与说话风格

### 1.1 全局人设（所有会话生效）
文件：`~/.dsh/.persona/global.txt`

| 内容 | 效果 |
| --- | --- |
| 直接写人设文本（纯文本，写什么就是什么） | 全局生效 |
| `@preset:<id>`（整文件只有这一行） | 引用人设库中的人设 |
| 首行 `off` / `disabled` | 关闭全局人设 |
| 文件缺失或为空 | 视为未定义 |

### 1.2 人设库（保存多个人设，随时切换）
目录：`~/.dsh/.persona/library/<id>.txt`，每个文件一个人设
- 文件名 = id（小写字母/数字/`-`/`_`，如 `cat-loli`）
- 首行 `# 名称` 为显示名（面板里显示的名字；缺省用 id）
- 面板操作：新建（名称+内容→存入人设库）、编辑（载入表单→更新人设）、删除
- 同名人设再次保存会先确认再覆盖，不会产生重复

### 1.3 局部人设（按工作区覆盖）
文件：`<工作区根目录>/.persona.txt`
- 存在时**覆盖**全局，只影响该工作区的会话
- 内容规则与全局相同（文本 / `@preset:<id>` / `off`）
- 空文件 = 跟随全局；`off` = 该工作区关闭人设
- 选择方式：面板里从 **DSH 工作区列表**下拉选（或手动输入路径）

### 1.4 总开关（一键启停）
文件：`~/.dsh/.persona/enabled.txt`（缺失 = 开启）
- 内容 `0` / `false` / `off` / `关` = 关闭（全局+局部全部停止注入，人设库内容保留）
- 面板顶部滑块一键切换；保存即生效

### 1.5 GUI 面板（侧边栏「人设」）
- 顶部总开关
- 全局人设：自定义文本 / 使用人设库的人设 / 关闭
- 工作区人设：选工作区 → 跟随全局 / 自定义 / 选人设 / 关闭
- 人设库：增删改 + 列表预览

### 1.6 生效时机
- **文件保存/面板保存后，下一次模型请求自动生效**（mtime 缓存，无需重启）
- 注入位置：系统提示词最前面，`guise:persona` 段（order -50，在部署 persona 之前）
- 注入格式：【人设 · PERSONA】+ 最高优先级身份设定前缀 + 人设文本

## 二、没电模式（Tired Mode）—— API 调不动时的代打

### 2.1 触发条件
模型请求失败且失败码为以下之一：
- `QUOTA` —— 额度/余额耗尽（必触发）
- `CONTEXT_WINDOW_EXCEEDED` —— 上下文超限（必触发）
- 任何含 `BALANCE` / `CREDIT` / `INSUFFICIENT` 的码（必触发）
- `RATE_LIMIT` 等瞬时限流**默认不触发**（可重试）；想触发可在配置 `tired.codes` 里追加

### 2.2 行为
- 宿主**替 agent** 追加一条 assistant 消息到会话，以「懒散·天然呆·爱 Tokens」口吻说话
- 话语**随机不固定**：12 条模板 × 5 种 Tokens 说法（Tokens / 小 Tokens / 香喷喷的 Tokens / 热乎的 Tokens / token 大餐）
- 同一失败的回合只说一次，不会刷屏

### 2.3 自定义话术
文件：`~/.dsh/.persona/tired-lines.txt`
- 每行一条话术，`#` 开头是注释
- 模板里可写 `{{food}}` 槽位，自动随机填入 Tokens 说法
- 首行 `off` = 关闭没电模式（退回内置话术池）
- 文件被删/为空 = 使用内置话术池

## 三、配置文件（cordis 行 config）

```yaml
- id: guise
  name: 'dsh-guise'
  config:
    enabled: true            # 插件总开关
    announceToAgent: true    # 是否向 agent 通告插件机制
    order: -50               # 人设段注入顺序（负数=在部署 persona 之前）
    announceOrder: 150       # 通告段顺序
    localFile: .persona.txt  # 局部人设文件名
    wrapper: true            # 是否加身份设定前缀
    tired:
      enabled: true          # 没电模式开关
      codes: []              # 额外触发失败码，如 [RATE_LIMIT]
```

## 四、API 路由（仅 loopback 访问）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-persona/state?cwd=<路径>` | 人设库+全局+局部+总开关+当前生效状态 |
| GET | `/api/dsh-persona/workspaces` | DSH 工作区列表（id/title/path） |
| POST | `/api/dsh-persona/library/save` | `{id?, name, text}` 存人设 |
| POST | `/api/dsh-persona/library/delete` | `{id}` 删人设 |
| POST | `/api/dsh-persona/global/save` | `{text}` 保存全局人设 |
| POST | `/api/dsh-persona/local/save` | `{cwd, text}` 保存工作区人设 |
| POST | `/api/dsh-persona/switch` | `{enabled}` 总开关 |

## 五、文件一览

| 路径 | 作用 |
| --- | --- |
| `~/.dsh/.persona/global.txt` | 全局人设（文本 / @preset / off） |
| `~/.dsh/.persona/library/<id>.txt` | 人设库（首行 # 名称） |
| `~/.dsh/.persona/enabled.txt` | 总开关（0/off=关） |
| `~/.dsh/.persona/tired-lines.txt` | 没电模式自定义话术 |
| `<工作区>/.persona.txt` | 工作区局部人设 |

## 六、局限性

- 使用 `complete: true` 段替换整份系统提示词的预设（如 Minimal 系）会剥离人设段——这是该预设的设计
- 管理路由仅接受 loopback 请求（安全）
- 宿主端新功能（总开关/没电模式）需要一次重启后完整生效；面板纯前端改动刷新页面即可
