# dsh-guise · 人设衣橱

## 一句话介绍

**给 DSH 的 agent 穿上主人钦定的人设**——多套人格随心换，全局或按工作区生效，没钱了还会懒洋洋地说句俏皮话再下线。

## 完整介绍

dsh-guise（人设衣橱）是 DeepSeek Harness 的「人设系统」插件：它把 agent 的**人格与说话风格**变成主人可以随手管理的东西——像衣橱一样，收藏多套人设，想穿哪套穿哪套。

### 它解决什么问题

默认情况下，agent 只有一套固定的系统人设，想换风格要么改配置、要么复制粘贴一大段提示词，而且每个工作区都只能将就同一个性格。人设衣橱把这些全部变成**文件即配置、面板点一点**的事：

- **人设库**：把「家猫萝莉」「技术专家」「毒舌损友」……每个人设保存成一个文件，随时增删改，还能一键切换
- **全局 vs 局部**：全局人设对所有会话生效；某个工作区可以单独指定人设（比如在贪吃蛇项目里就变成「游戏策划」语气），存在即覆盖
- **总开关**：面板顶部一键启停整个人设系统，人设库内容保留，随时再开
- **余额预警**：可调阈值的余额监测——API 余额低于主人设定的金额（默认 1 元）时，新对话不再请求 API
- **没电模式**：额度耗尽或上下文超限时，插件会以「懒散·天然呆·爱 Tokens」的口吻替 agent 说一句随机俏皮话（80 句随机组合，绝不固定），然后体面地结束对话，等余额充足再恢复正常

### 设计理念

| 原则 | 做法 |
| --- | --- |
| 文件即配置 | 所有人设都是纯文本文件，看得见、改得着，git 友好 |
| 热生效 | 改完保存，下一次模型请求自动生效，无需重启 |
| 零依赖 | 插件本体不依赖任何第三方包，link 安装即用 |
| 安全 | 管理接口仅接受本机 loopback 请求 |
| 可扩展 | 没电话术支持自定义文件，失败码、阈值全部可调 |

### 适用场景

- 想要 agent 说话「有人味」、带口癖、符合自己审美的主人
- 多个项目/工作区需要不同 agent 性格的开发者
- 担心 API 余额悄悄跑光的用户（预警+自动停聊）
- 喜欢折腾、想自己写人设和话术的玩家

### 快速上手

1. `dsh plugin --profile web add link:<插件目录>`
2. 侧边栏点「人设」→ 存入第一个人设 → 选为全局
3. 余额预警填好阈值，完事

人设文本随便写：人格、语言、语气、口癖、自称、句尾表情……写什么，agent 就变成什么样。

---

## English Introduction

### One-liner

**Dress your DSH agent in the persona you choose** — switch between multiple characters, apply them globally or per workspace, and let it say a sleepy, snack-loving goodbye when the API balance runs out.

### Full Description

dsh-guise turns the agent's personality and speaking style into something you can manage like a wardrobe. Keep multiple personas (a cat girl, a tech expert, a snarky friend…), switch them anytime, scope them globally or to a single workspace, and control everything from a sidebar panel or plain text files.

**Features**

- **Persona library** — save, edit and delete named personas in `~/.dsh/.persona/library/`
- **Global & per-workspace** — a workspace-level `.persona.txt` overrides the global persona for that workspace only
- **Master switch** — one toggle in the panel disables all persona injection (your library stays intact)
- **Balance guard** — an adjustable threshold (default 1 CNY) checked before every new conversation; when the balance drops below it, the agent stops calling the API
- **Tired mode** — when quota is exhausted or the context window is exceeded, the plugin speaks on the agent's behalf with a lazy, airheaded, token-loving line (80 randomized variants, never repeated), then closes the conversation until the balance recovers

**Principles**: files-as-config, hot reload on save, zero dependencies, loopback-only management APIs, fully customizable vocabulary.
