# 上架 dsh-market 指南

## 为什么市场里看不到 dsh-guise？

dshmarket 的插件列表**不是自动扫描 GitHub**，而是来自官方精选目录：

> **awesome-dsh-plugin**（https://awesome-dsh-plugin.com/plugins.json，仓库：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin ）

插件被收录进这个目录后，站点和市场会自动显示（通常一天内生效）。dsh-guise 刚建仓，还没提交收录，所以市场里看不到。

另外注意：**市场 UI 只允许安装目录内收录的来源**，其它一律拒绝——所以收录前，本机自用请走 CLI。

## 自用安装（不用等收录）

```bash
dsh plugin --profile web add github:Quinn2006/dsh-guise
```

## 上架方法：给 awesome-dsh-plugin 提 PR

打开 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin ，在其插件列表文件里加一条（找到同格式的现有条目照着加），然后提 Pull Request。

### 建议条目（JSON）

```json
{
  "name": "dsh-guise",
  "owner": "Quinn2006",
  "url": "https://github.com/Quinn2006/dsh-guise",
  "category": "fun",
  "description": {
    "en": "Persona wardrobe for DeepSeek Harness: save multiple personas, apply them globally or per workspace, one-click master switch, adjustable API balance guard, and a lazy token-loving tired mode that speaks on the agent's behalf when quota runs out. Files-as-config, hot reload, zero dependencies.",
    "zh": "给 DSH 的 agent 穿上主人钦定的人设——多套人格随心换，全局或按工作区生效，没钱了还会懒洋洋地说句俏皮话再下线。内置人设库、总开关、余额预警（可调阈值）与没电模式（80 句随机话术）。文件即配置、保存即生效、零依赖。"
  },
  "npm": null,
  "install": "dsh plugin --profile web add github:Quinn2006/dsh-guise"
}
```

> `page` / `stars` / `added` 由目录维护方自动生成，不需要自己写。

### 提示

- `category` 用目录现有的分类（如 `dev` / `fun` / `market`），以仓库实际分类为准
- PR 合并后通常一天内出现在市场里
