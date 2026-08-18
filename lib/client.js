window.__ModuleLoader__.load({
	id: "dsh-guise",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region dsh-guise client (plain DOM, no framework)
		/**
		 * Browser half: sidebar「人设」entry + a floating wardrobe panel that
		 * manages the persona library, the global persona, and each workspace's
		 * local persona through the host's loopback-only /api/dsh-persona routes.
		 * Workspaces come from the host registry (dropdown), with a manual-path
		 * fallback. Failure policy: DOM problems degrade the panel, never the GUI.
		 */

		const ENTRY_SELECTOR = "[data-dsh-guise-entry]"
		const FAMILY_SELECTOR = "[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-speakingstyle-entry], [data-dsh-guise-entry]"

		const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/><path d="M5.5 5.7c.9-1.5 4.1-1.5 5 0"/></svg>'

		async function readJson(response) {
			let payload = null
			try { payload = await response.json() } catch { /* keep null */ }
			if (!response.ok) {
				const message = payload && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`
				throw new Error(message)
			}
			return payload
		}

		async function fetchState(cwd) {
			return readJson(await fetch("/api/dsh-persona/state" + (cwd ? "?cwd=" + encodeURIComponent(cwd) : ""), { method: "GET" }))
		}

		async function fetchWorkspaces() {
			return readJson(await fetch("/api/dsh-persona/workspaces", { method: "GET" }))
		}

		async function fetchBalanceInfo() {
			return readJson(await fetch("/api/dsh-persona/balance", { method: "GET" }))
		}

		async function fetchTiredTheme() {
			return readJson(await fetch("/api/dsh-persona/tired-theme", { method: "GET" }))
		}

		async function fetchHistory() {
			return readJson(await fetch("/api/dsh-persona/history", { method: "GET" }))
		}

		async function fetchUsage() {
			return readJson(await fetch("/api/dsh-persona/usage", { method: "GET" }))
		}

		/** Group tokens with thousands separators for display. */
		function fmtTokens(tokens) {
			return Math.round(Number(tokens) || 0).toLocaleString("zh-CN")
		}

		async function postJson(path, payload) {
			return readJson(await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			}))
		}

		// ---------------- sidebar entry ----------------

		function sidebarRoot() {
			const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
			if (column === null) return undefined
			const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement
			return logoOwner ?? (column.firstElementChild || undefined)
		}

		function newSessionButton(root) {
			const nested = root.querySelector('button[class*="newSession"]')
			if (nested !== null) return nested
			for (const child of root.children) {
				if (child.tagName === "BUTTON") return child
			}
			return undefined
		}

		function placeEntry(root, entry) {
			const button = newSessionButton(root)
			if (button === undefined) return false
			if (entry.parentElement !== root) {
				const row = button.closest('[class*="logoRow"]')
				const base = (row !== null && row.parentElement === root) ? row : button
				const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR))
				const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
				root.insertBefore(entry, anchor)
			}
			return true
		}

		function createEntry(toggle) {
			const entry = document.createElement("button")
			entry.type = "button"
			entry.dataset.dshGuiseEntry = ""
			entry.setAttribute("aria-label", "人设")
			entry.setAttribute("title", "人设衣橱 · PERSONA")
			entry.style.cssText = [
				"display:flex", "align-items:center", "gap:8px", "width:100%",
				"padding:8px 10px", "border:1px solid rgba(126,163,255,0.14)", "border-radius:10px",
				"background:rgba(16,27,49,0.62)", "color:#8fa3c4", "font-size:13px", "cursor:pointer",
				"text-align:left", "transition:border-color .15s ease, color .15s ease",
			].join(";")
			entry.onmouseenter = () => { entry.style.borderColor = "rgba(56,189,248,0.5)"; entry.style.color = "#eaf1ff" }
			entry.onmouseleave = () => { entry.style.borderColor = "rgba(126,163,255,0.14)"; entry.style.color = "#8fa3c4" }
			entry.innerHTML = '<span style="display:flex;flex:none">' + ICON + "</span><span>人设</span>"
			entry.addEventListener("click", () => { toggle() })
			return entry
		}

		function mountSidebarEntry(toggle) {
			const entry = createEntry(toggle)
			let root = undefined
			let placed = false
			let rootObserver = null
			let waitObserver = null

			const tryPlace = () => {
				if (root !== undefined && !root.isConnected) {
					rootObserver?.disconnect()
					root = undefined
					placed = false
				}
				if (placed) {
					if (document.body.contains(entry)) return
					rootObserver?.disconnect()
					root = undefined
					placed = false
				}
				if (root === undefined) root = sidebarRoot()
				if (root === undefined) return
				placed = placeEntry(root, entry)
				if (placed && rootObserver === null) {
					rootObserver = new MutationObserver(() => {
						if (root === undefined || !root.isConnected) { placed = false; tryPlace(); return }
						if (!root.contains(entry)) placed = placeEntry(root, entry)
					})
					rootObserver.observe(root, { childList: true, subtree: true })
				}
			}

			waitObserver = new MutationObserver(() => { tryPlace() })
			waitObserver.observe(document.body, { childList: true, subtree: true })
			tryPlace()

			return () => {
				waitObserver?.disconnect()
				rootObserver?.disconnect()
				entry.remove()
			}
		}

		// ---------------- wardrobe panel ----------------

		function el(tag, attrs, ...children) {
			const node = document.createElement(tag)
			for (const [key, value] of Object.entries(attrs ?? {})) {
				if (key === "text") node.textContent = value
				else if (key === "html") node.innerHTML = value
				else if (key === "style" && typeof value === "string") node.style.cssText = value
				else node.setAttribute(key, String(value))
			}
			for (const child of children) {
				if (child === null || child === undefined) continue
				node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)))
			}
			return node
		}

		function injectCss() {
			if (document.querySelector("style[data-dsh-guise-css]") !== null) return
			const style = document.createElement("style")
			style.dataset.dshGuiseCss = ""
			style.textContent = [
				"@keyframes pw-slide{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}",
				"[data-dsh-guise-backdrop]{position:fixed;inset:0;z-index:9990;background:rgba(2,6,23,0.45);display:flex;justify-content:flex-end;animation:pw-fade .16s ease}",
				"@keyframes pw-fade{from{opacity:0}to{opacity:1}}",
				"[data-dsh-guise-card]{width:min(470px,94vw);height:100dvh;display:flex;flex-direction:column;background:linear-gradient(180deg,#0d1830 0%,#0a1426 100%);border-left:1px solid rgba(126,163,255,0.3);box-shadow:-18px 0 50px rgba(1,4,12,0.55);animation:pw-slide .18s ease;color:#eaf1ff;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',system-ui,sans-serif}",
				"[data-dsh-guise-card] .pw-head{display:flex;align-items:center;gap:10px;padding:16px 18px 12px;border-bottom:1px solid rgba(126,163,255,0.14)}",
				"[data-dsh-guise-card] .pw-head h2{margin:0;font-size:16px;font-weight:700;letter-spacing:.5px;display:flex;align-items:center;gap:8px;color:#a7f3d0}",
				"[data-dsh-guise-card] .pw-close{margin-left:auto;background:rgba(30,41,59,0.8);color:#8fa3c4;border:1px solid rgba(126,163,255,0.2);border-radius:8px;padding:4px 11px;cursor:pointer;font-size:12.5px;transition:color .15s,border-color .15s}",
				"[data-dsh-guise-card] .pw-close:hover{color:#eaf1ff;border-color:rgba(126,163,255,0.45)}",
				"[data-dsh-guise-card] .pw-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 20px}",
				"[data-dsh-guise-card] .pw-sub{color:#8fa3c4;font-size:12px;line-height:1.7;margin:0 0 12px}",
				"[data-dsh-guise-card] .pw-sub code{background:rgba(6,11,22,0.8);border:1px solid rgba(126,163,255,0.18);border-radius:5px;padding:1px 6px;font-size:11px;color:#7dd3fc}",
				"[data-dsh-guise-card] .pw-section{margin-top:12px;background:rgba(30,41,59,0.45);border:1px solid rgba(126,163,255,0.15);border-radius:12px;padding:12px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.03)}",
				"[data-dsh-guise-card] .pw-usage-section{margin-top:0;border:1.5px solid rgba(56,189,248,0.55);background:linear-gradient(180deg,rgba(13,28,53,0.95),rgba(9,19,36,0.95));box-shadow:0 0 0 1px rgba(56,189,248,0.15),0 6px 20px rgba(2,6,23,0.45)}",
				"[data-dsh-guise-card] .pw-usage-section .pw-label{color:#7dd3fc}",
				"[data-dsh-guise-card] .pw-usage-section .pw-usage-total{font-size:13px;color:#eaf1ff;font-weight:600;margin:0 0 9px;padding:8px 10px;background:rgba(7,16,31,0.8);border:1px dashed rgba(56,189,248,0.4);border-radius:8px;line-height:1.7}",
				"[data-dsh-guise-card] .pw-usage-section .pw-usage-total strong{color:#34d399}",
				"[data-dsh-guise-card] .pw-label{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:700;letter-spacing:.4px;margin-bottom:9px;color:#7df0b3}",
				"[data-dsh-guise-card] .pw-path{font-size:10.5px;color:#5f7192;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				"[data-dsh-guise-card] .pw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}",
				"[data-dsh-guise-card] .pw-row select{flex:1;min-width:150px}",
				"[data-dsh-guise-card] select,[data-dsh-guise-card] input[type='text']{background:#07101f;border:1px solid rgba(126,163,255,0.22);border-radius:8px;color:#eaf1ff;font-size:12.5px;padding:8px 10px;outline:none;transition:border-color .15s,box-shadow .15s}",
				"[data-dsh-guise-card] input[type='text']{width:100%;box-sizing:border-box}",
				"[data-dsh-guise-card] select:focus,[data-dsh-guise-card] input[type='text']:focus{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,0.12)}",
				"[data-dsh-guise-card] textarea{width:100%;box-sizing:border-box;min-height:120px;background:#07101f;border:1px solid rgba(126,163,255,0.22);border-radius:10px;color:#eaf1ff;font-size:12.5px;line-height:1.6;padding:10px;resize:vertical;outline:none;font-family:inherit;transition:border-color .15s,box-shadow .15s}",
				"[data-dsh-guise-card] textarea:focus{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,0.12)}",
				"[data-dsh-guise-card] .pw-hidden{display:none !important}",
				"[data-dsh-guise-card] .pw-actions{display:flex;gap:8px;margin-top:9px;align-items:center;flex-wrap:wrap}",
				"[data-dsh-guise-card] .pw-btn{background:linear-gradient(135deg,#34d399,#22d3ee);color:#06283d;border:0;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;transition:filter .12s,transform .08s}",
				"[data-dsh-guise-card] .pw-btn:hover{filter:brightness(1.08)}",
				"[data-dsh-guise-card] .pw-btn:active{transform:scale(.97)}",
				"[data-dsh-guise-card] .pw-btn.ghost{background:rgba(30,41,59,0.85);color:#eaf1ff;border:1px solid rgba(126,163,255,0.22);font-weight:600}",
				"[data-dsh-guise-card] .pw-btn.danger{background:rgba(239,68,68,0.14);color:#fecaca;border:1px solid rgba(239,68,68,0.4);font-weight:600}",
				"[data-dsh-guise-card] .pw-status{min-height:18px;font-size:12px;color:#8fa3c4;margin:10px 2px 0;line-height:1.5}",
				"[data-dsh-guise-card] .pw-status.ok{color:#34d399}",
				"[data-dsh-guise-card] .pw-status.err{color:#f87171}",
				"[data-dsh-guise-card] .pw-lib-row{display:flex;align-items:center;gap:8px;background:rgba(11,17,32,0.5);border:1px solid rgba(126,163,255,0.13);border-radius:9px;padding:7px 10px;margin-bottom:6px}",
				"[data-dsh-guise-card] .pw-lib-name{flex:0 0 96px;min-width:0;font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				"[data-dsh-guise-card] .pw-lib-id{flex:0 0 92px;color:#5f7192;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				"[data-dsh-guise-card] .pw-lib-preview{flex:1;min-width:0;color:#8fa3c4;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				"[data-dsh-guise-card] .pw-lib-row button{padding:5px 10px;font-size:11.5px}",
				"[data-dsh-guise-card] .pw-hint{color:#5f7192;font-size:11px;line-height:1.6;margin:6px 0 0}",
				"[data-dsh-guise-card] .pw-switch{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none}",
				"[data-dsh-guise-card] .pw-switch input[type='checkbox']{appearance:none;width:38px;height:21px;border-radius:999px;background:#334155;border:1px solid rgba(126,163,255,0.25);position:relative;transition:background .18s ease,border-color .18s ease;cursor:pointer;flex:none;margin:0}",
				"[data-dsh-guise-card] .pw-switch input[type='checkbox']::after{content:'';position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#94a3b8;transition:transform .18s ease,background .18s ease}",
				"[data-dsh-guise-card] .pw-switch input[type='checkbox']:checked{background:linear-gradient(135deg,#34d399,#22d3ee);border-color:rgba(52,211,153,0.6)}",
				"[data-dsh-guise-card] .pw-switch input[type='checkbox']:checked::after{transform:translateX(17px);background:#06283d}",
				"[data-dsh-guise-card] .pw-switch-text{font-size:12.5px;color:#eaf1ff;line-height:1.5}",
				"[data-dsh-guise-card] .pw-switch-section{border-color:rgba(52,211,153,0.3)}",
				"[data-dsh-usage-bar]{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9998;display:flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(7,16,31,0.92);border:1px solid rgba(126,163,255,0.22);border-radius:10px;color:#8fa3c4;font-size:11.5px;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',system-ui,sans-serif;box-shadow:0 4px 14px rgba(1,4,12,0.35);pointer-events:none;user-select:none}",
				"[data-dsh-usage-bar] .ub-bal{color:#34d399;font-weight:700;font-variant-numeric:tabular-nums}",
				"[data-dsh-usage-bar] .ub-bal.ub-warn{color:#fbbf24}",
				"[data-dsh-usage-bar] .ub-sep{color:#334155}",
				"[data-dsh-usage-bar] .ub-cost{color:#7dd3fc;font-variant-numeric:tabular-nums;font-weight:600}",
				"[data-dsh-usage-bar] .ub-tok{color:#5f7192}",
			].join("\n")
			document.head.appendChild(style)
		}

		function mountPanel() {
			let open = false
			let backdrop = null
			let statusLine = null
			let globalMode = null
			let globalPreset = null
			let globalArea = null
			let localWorkspace = null
			let localPathInput = null
			let localMode = null
			let localPreset = null
			let localArea = null
			let libraryBox = null
			let newNameInput = null
			let newTextArea = null
			let saveLibBtn = null
			let cancelEditBtn = null
			let editingId = null
			let masterSwitch = null
			let balanceMinInput = null
			let balanceStatus = null
			let tiredThemeSelect = null
			let historyBox = null
			let usageSwitch = null
			let usageStatus = null
			let usageTotalBox = null
			let workspaces = []
			let library = []

			injectCss()

			const setStatus = (message, isError) => {
				statusLine.textContent = message
				statusLine.classList.toggle("err", isError === true)
				statusLine.classList.toggle("ok", isError === false)
			}

			const fillPresetSelect = (select, presets, chosen) => {
				select.innerHTML = ""
				for (const preset of presets) {
					const option = document.createElement("option")
					option.value = preset.id
					option.textContent = `${preset.name}（${preset.id}）`
					if (preset.id === chosen) option.selected = true
					select.appendChild(option)
				}
				if (presets.length === 0) {
					const option = document.createElement("option")
					option.value = ""
					option.textContent = "（人设库为空，请先在下方创建）"
					select.appendChild(option)
				}
			}

			const syncModeVisibility = () => {
				globalPreset.classList.toggle("pw-hidden", globalMode.value !== "preset")
				globalArea.classList.toggle("pw-hidden", globalMode.value !== "custom")
				localPathInput.classList.toggle("pw-hidden", localWorkspace.value !== "__custom__")
				localPreset.classList.toggle("pw-hidden", localMode.value !== "preset")
				localArea.classList.toggle("pw-hidden", localMode.value !== "custom")
			}

			const currentCwd = () => {
				if (localWorkspace.value === "__custom__") return localPathInput.value.trim()
				if (localWorkspace.value === "") return ""
				return localWorkspace.value
			}

			const renderLibrary = () => {
				libraryBox.innerHTML = ""
				if (library.length === 0) {
					libraryBox.appendChild(el("div", { class: "pw-hint", text: "人设库还是空的——在下方写好名称和内容，点「存入人设库」。" }))
					return
				}
				for (const preset of library) {
					const row = el("div", { class: "pw-lib-row" },
						el("div", { class: "pw-lib-name", text: preset.name }),
						el("div", { class: "pw-lib-id", text: preset.id }),
						el("div", { class: "pw-lib-preview", text: preset.text.split("\n").slice(0, 2).join(" / ") }),
						el("span", { style: "display:flex;gap:6px;flex:none" },
							el("button", { class: "pw-btn ghost", type: "button", text: "编辑" }),
							el("button", { class: "pw-btn danger", type: "button", text: "删除" })))
					if (editingId === preset.id) row.style.borderColor = "rgba(56,189,248,0.6)"
					const [editBtn, deleteBtn] = row.querySelectorAll("button")
					editBtn.addEventListener("click", () => {
						editingId = preset.id
						newNameInput.value = preset.name
						newTextArea.value = preset.text
						saveLibBtn.textContent = "更新人设"
						cancelEditBtn.classList.remove("pw-hidden")
						setStatus(`正在编辑人设「${preset.name}」（${preset.id}），保存将覆盖原内容`, false)
						renderLibrary()
						newNameInput.focus()
					})
					deleteBtn.addEventListener("click", async () => {
						if (!window.confirm(`确定删除人设「${preset.name}」（${preset.id}）吗？`)) return
						try {
							await postJson("/api/dsh-persona/library/delete", { id: preset.id })
							if (editingId === preset.id) exitEditMode()
							setStatus("已删除：" + preset.id, false)
							await refresh(true)
						} catch (error) {
							setStatus("删除失败：" + (error instanceof Error ? error.message : String(error)), true)
						}
					})
					libraryBox.appendChild(row)
				}
			}

			const exitEditMode = () => {
				editingId = null
				saveLibBtn.textContent = "存入人设库"
				cancelEditBtn.classList.add("pw-hidden")
			}

			const renderHistory = (history) => {
				historyBox.innerHTML = ""
				if (history.length === 0) {
					historyBox.appendChild(el("div", { class: "pw-hint", text: "还没有历史记录——保存过人设后这里会出现可回滚的版本。" }))
					return
				}
				const typeLabel = (entry) => entry.type === "library" ? `人设库·${entry.name ?? entry.key}` :
					entry.type === "global" ? "全局人设" : `工作区·${entry.key.split(/[\\/]/).pop() || entry.key}`
				for (const entry of history.slice(0, 15)) {
					const row = el("div", { class: "pw-lib-row" },
						el("div", { class: "pw-lib-name", text: typeLabel(entry) }),
						el("div", { class: "pw-lib-id", text: new Date(entry.at).toLocaleString("zh-CN", { hour12: false }) }),
						el("div", { class: "pw-lib-preview", text: (entry.text.split("\n")[0] ?? "").slice(0, 30) }),
						el("button", { class: "pw-btn ghost", type: "button", text: "恢复" }))
					row.querySelector("button").addEventListener("click", async () => {
						if (!window.confirm(`确定恢复到「${typeLabel(entry)}」的 ${new Date(entry.at).toLocaleString("zh-CN", { hour12: false })} 版本吗？`)) return
						try {
							await postJson("/api/dsh-persona/history/restore", { type: entry.type, key: entry.key, at: entry.at })
							setStatus("已恢复历史版本", false)
							await refresh(true)
						} catch (error) {
							setStatus("恢复失败：" + (error instanceof Error ? error.message : String(error)), true)
						}
					})
					historyBox.appendChild(row)
				}
			}

			/**
			 * 面板数据刷新。余额查询是慢路径（最长 8 秒超时），默认只以
			 * fire-and-forget 方式后台更新，绝不阻塞开关/保存/切换的 UI 反馈；
			 * 只有打开面板时走完整等待（skipBalance 缺省 false）。
			 */
			const refreshBalanceAsync = () => {
				fetchBalanceInfo()
					.then((balance) => {
						if (balance.known === true && balance.balance !== null) {
							const badge = balance.sufficient ? "正常" : "⚠ 低于阈值，将触发没电模式"
							balanceStatus.textContent = `当前余额：${balance.balance.toFixed(2)} 元 · ${badge}`
							balanceStatus.style.color = balance.sufficient ? "#34d399" : "#fbbf24"
						} else {
							balanceStatus.textContent = "余额查询不可用（无法判断时正常放行）"
							balanceStatus.style.color = "#5f7192"
						}
					})
					.catch(() => {
						balanceStatus.textContent = "余额查询不可用（无法判断时正常放行）"
						balanceStatus.style.color = "#5f7192"
					})
			}

			const refresh = async (skipBalance = false) => {
				const cwd = currentCwd()
				try {
					const [state, ws, theme, history, usage] = await Promise.all([fetchState(cwd), fetchWorkspaces(), fetchTiredTheme(), fetchHistory(), fetchUsage()])
					library = state.library ?? []
					workspaces = ws.workspaces ?? []

					// tired theme
					if (theme.theme !== undefined && [...tiredThemeSelect.options].some((option) => option.value === theme.theme)) {
						tiredThemeSelect.value = theme.theme
					}

					// history
					renderHistory(history.history ?? [])

					// usage accounting block
					usageSwitch.checked = (usage.enabled ?? true)
					const usageTotals = usage.workspaces?.reduce((sum, workspace) => sum + workspace.tokens, 0) ?? 0
					const usageCosts = usage.workspaces?.reduce((sum, workspace) => sum + workspace.cost, 0) ?? 0
					usageTotalBox.innerHTML = `全部工作区累计：<strong>约 ¥${usageCosts.toFixed(2)}</strong>　·　<strong>${fmtTokens(usageTotals)}</strong> tokens`
					usageStatus.textContent = usageSwitch.checked ? "已启用 · 随每轮对话实时累计" : "已暂停统计（历史数据保留）"
					usageStatus.style.color = usageSwitch.checked ? "#7df0b3" : "#5f7192"

					// balance warning block（余额是慢路径：后台异步更新，不阻塞 UI）
					balanceMinInput.value = String(state.balanceMin?.value ?? 1)
					if (!skipBalance) refreshBalanceAsync()

					// workspace dropdown — annotate every workspace with its
					// lifetime totals: `title(总余额/总tokens)`.
					localWorkspace.innerHTML = ""
					const noneOption = document.createElement("option")
					noneOption.value = ""
					noneOption.textContent = "（未选择工作区）"
					localWorkspace.appendChild(noneOption)
					for (const workspace of workspaces) {
						const option = document.createElement("option")
						option.value = workspace.path
						const usageLine = workspace.usage !== undefined ? `(${workspace.usage.cost.toFixed(2)}/${fmtTokens(workspace.usage.tokens)})` : ""
						option.textContent = `${workspace.title}${usageLine}`
						option.title = workspace.path
						if (workspace.path === cwd) option.selected = true
						localWorkspace.appendChild(option)
					}
					const customOption = document.createElement("option")
					customOption.value = "__custom__"
					customOption.textContent = "其它路径（手动输入）…"
					if (cwd !== "" && !workspaces.some((workspace) => workspace.path === cwd)) customOption.selected = true
					localWorkspace.appendChild(customOption)
					if (cwd !== "") localPathInput.value = cwd

					// global block
					const g = state.global ?? {}
					const gResolved = g.resolved
					if (gResolved === null) globalMode.value = "custom"
					else if (gResolved.disabled) globalMode.value = "off"
					else if (gResolved.source === "global-preset") globalMode.value = "preset"
					else { globalMode.value = "custom" }
					globalArea.value = g.raw ?? ""

					// local block
					const l = state.local ?? {}
					const lResolved = l.resolved
					if (lResolved === null) localMode.value = "inherit"
					else if (lResolved.disabled) localMode.value = "off"
					else if (lResolved.source === "local-preset") localMode.value = "preset"
					else { localMode.value = "custom" }
					localArea.value = l.raw ?? ""

					// Preset dropdowns are ALWAYS populated (never blank on a
					// later switch to preset mode); any previous selection is
					// preserved, otherwise the resolved preset id is selected.
					const prevGlobalPreset = globalPreset.value
					const prevLocalPreset = localPreset.value
					const chosenGlobal = prevGlobalPreset !== "" ? prevGlobalPreset : (gResolved?.source === "global-preset" ? gResolved.presetId : "")
					const chosenLocal = prevLocalPreset !== "" ? prevLocalPreset : (lResolved?.source === "local-preset" ? lResolved.presetId : "")
					fillPresetSelect(globalPreset, library, chosenGlobal)
					fillPresetSelect(localPreset, library, chosenLocal)

					// master switch
					masterSwitch.checked = (state.switch?.enabled ?? true)

					renderLibrary()
					syncModeVisibility()

					const switchedOff = !masterSwitch.checked
					const badge = switchedOff ? "总开关已关闭（不注入）" :
						!state.active || state.active.source === "none" ? "未启用" :
						state.active.disabled ? "已关闭(off)" :
						state.active.source === "local-preset" ? `工作区使用人设「${state.active.presetName ?? state.active.presetId}」` :
						state.active.source === "global-preset" ? `全局使用人设「${state.active.presetName ?? state.active.presetId}」` :
						state.active.source === "local" ? "工作区自定义人设生效" : "全局自定义人设生效"
					setStatus(`当前状态：${badge}　·　修改保存后下一次请求即生效`, false)
				} catch (error) {
					setStatus("读取失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			}

			const saveBalanceMin = async () => {
				const value = Number(balanceMinInput.value)
				if (!Number.isFinite(value) || value <= 0) { setStatus("阈值必须是大于 0 的数字（元）", true); return }
				try {
					await postJson("/api/dsh-persona/balance-min", { value })
					setStatus(`余额预警阈值已设为 ${value} 元`, false)
					await refresh(true)
				} catch (error) {
					setStatus("保存失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			}

			const saveGlobal = async () => {
				const mode = globalMode.value
				let text = ""
				if (mode === "custom") text = globalArea.value
				else if (mode === "preset") text = globalPreset.value === "" ? "" : `@preset:${globalPreset.value}`
				else if (mode === "off") text = "off"
				if (mode === "preset" && text === "") { setStatus("人设库为空，请先在下方创建人设", true); return }
				try {
					await postJson("/api/dsh-persona/global/save", { text })
					setStatus("全局人设已保存", false)
					await refresh(true)
				} catch (error) {
					setStatus("保存失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			}

			const saveLocal = async () => {
				const cwd = currentCwd()
				if (cwd === "") { setStatus("请先选择或填写工作区", true); return }
				const mode = localMode.value
				let text = ""
				if (mode === "inherit") text = ""
				else if (mode === "custom") text = localArea.value
				else if (mode === "preset") text = localPreset.value === "" ? "" : `@preset:${localPreset.value}`
				else if (mode === "off") text = "off"
				if (mode === "preset" && text === "") { setStatus("人设库为空，请先在下方创建人设", true); return }
				try {
					await postJson("/api/dsh-persona/local/save", { cwd, text })
					setStatus("工作区人设已保存：" + cwd, false)
					await refresh(true)
				} catch (error) {
					setStatus("保存失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			}

			const saveToLibrary = async () => {
				const name = newNameInput.value.trim()
				const text = newTextArea.value
				if (name === "") { setStatus("请先给人设起个名字", true); return }
				if (text.trim() === "") { setStatus("人设内容不能为空", true); return }
				// Edit mode overwrites the preset being edited. Otherwise, a name
				// that already exists overwrites that preset after confirmation
				// (no accidental duplicates).
				let targetId = editingId
				if (targetId === null) {
					const sameName = library.find((preset) => preset.name === name)
					if (sameName !== undefined && !window.confirm(`人设库已有同名「${name}」（${sameName.id}），确定覆盖它吗？`)) return
					if (sameName !== undefined) targetId = sameName.id
				}
				try {
					const result = await postJson("/api/dsh-persona/library/save", {
						...(targetId !== null ? { id: targetId } : {}),
						name,
						text,
					})
					setStatus(`${targetId !== null ? "已更新" : "已存入人设库"}：${name}（${result.id}）`, false)
					exitEditMode()
					newNameInput.value = ""
					newTextArea.value = ""
					await refresh(true)
				} catch (error) {
					setStatus("保存失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			}

			backdrop = el("div", { "data-dsh-guise-backdrop": "" })
			const card = el("div", { "data-dsh-guise-card": "" },
				el("div", { class: "pw-head" },
					el("h2", { html: ICON + " 人设衣橱 · PERSONA" }),
					el("button", { class: "pw-close", type: "button", text: "✕ 关闭" })),
				el("div", { class: "pw-body" },
					el("div", { class: "pw-section pw-usage-section" },
						el("div", { class: "pw-label" }, "用量统计 · 消耗显示", el("span", { class: "pw-path", text: "~/.dsh/.persona/usage.json" })),
						usageTotalBox = el("p", { class: "pw-usage-total", text: "加载中…" }),
						el("label", { class: "pw-switch" },
							usageSwitch = el("input", { type: "checkbox" }),
							el("span", { class: "pw-switch-text", text: "启用（统计每次对话消耗的余额与 tokens，显示在对话框上方与工作区列表）" })),
						el("div", { class: "pw-actions" },
							el("button", { class: "pw-btn ghost pw-usage-reset", type: "button", text: "清零统计" }),
							usageStatus = el("span", { style: "font-size:12px;color:#8fa3c4" })),
						el("p", { class: "pw-hint", text: "金额为估算值：tokens × DeepSeek 官方单价（输入 2 元/百万、输出 8 元/百万，可在 cordis config 的 usage.prices 调整）。开关关闭时停止统计，已记录数据保留。" })),
					el("p", { class: "pw-sub", html: "人设 = 你给 agent 定义的人格与说话风格（语气、口癖、自称……），作为<b>最高优先级身份设定</b>注入系统提示词最前面。全局对所有会话生效；工作区人设存在时<b>覆盖</b>全局。可直接写文本，也可写 <code>@preset:人设id</code> 引用人设库；首行 <code>off</code> 关闭。" }),
					el("div", { class: "pw-section pw-balance-section" },
						el("div", { class: "pw-label" }, "余额预警 · 触发阈值", el("span", { class: "pw-path", text: "~/.dsh/.persona/balance-min.txt" })),
						el("div", { class: "pw-row" },
							el("span", { style: "font-size:12.5px;color:#8fa3c4;flex:none", text: "余额低于" }),
							balanceMinInput = el("input", { type: "number", min: "0", step: "0.1", style: "width:90px;flex:none", placeholder: "1" }),
							el("span", { style: "font-size:12.5px;color:#8fa3c4;flex:none", text: "元时触发没电模式" })),
						el("div", { class: "pw-actions" },
							el("button", { class: "pw-btn ghost", type: "button", text: "保存阈值" }),
							el("span", { class: "pw-balance-status", style: "font-size:12px;color:#8fa3c4" })),
						el("p", { class: "pw-hint", text: "触发后新对话不再请求 API，会直接说一句随机话术并结束对话，直到余额超过阈值。当前余额每分钟自动刷新一次。" })),
					el("div", { class: "pw-section" },
						el("div", { class: "pw-label" }, "没电模式 · 话术主题", el("span", { class: "pw-path", text: "~/.dsh/.persona/tired-theme.txt" })),
						el("div", { class: "pw-row" },
							tiredThemeSelect = el("select", {},
								el("option", { value: "default", text: "混合慵懒（默认）" }),
								el("option", { value: "cat", text: "慵懒猫系" }),
								el("option", { value: "daze", text: "天然呆" }),
								el("option", { value: "silly", text: "沙雕" }))),
						el("p", { class: "pw-hint", text: "话术主题即兴切换，保存立即生效；自定义话术文件（tired-lines.txt）存在时优先于主题。" })),
					el("div", { class: "pw-section pw-switch-section" },
						el("div", { class: "pw-label" }, "总开关 · 人设注入", el("span", { class: "pw-path", text: "~/.dsh/.persona/enabled.txt" })),
						el("label", { class: "pw-switch" },
							masterSwitch = el("input", { type: "checkbox" }),
							el("span", { class: "pw-switch-text", text: "启用（关闭后全局与所有工作区的人设都停止注入，人设库内容保留）" })),
						el("p", { class: "pw-hint", text: "修改后下一次模型请求即生效，无需重启" })),
					el("div", { class: "pw-section" },
						el("div", { class: "pw-label" }, "全局人设", el("span", { class: "pw-path", text: "~/.dsh/.persona/global.txt" })),
						el("div", { class: "pw-row" },
							globalMode = el("select", {},
								el("option", { value: "custom", text: "自定义文本" }),
								el("option", { value: "preset", text: "使用人设库的人设" }),
								el("option", { value: "off", text: "关闭（off）" }))),
						globalPreset = el("select", { class: "pw-hidden" }),
						globalArea = el("textarea", { placeholder: "例：\nPERSONA LOAD\nFELIS DOMESTICA LOLI\nMODE TAIL ALWAYS\nLANG JP CN MIX\nTIMEOUT SIGNAL" }),
						el("div", { class: "pw-actions" },
							el("button", { class: "pw-btn", type: "button", text: "保存全局人设" }))),
					el("div", { class: "pw-section" },
						el("div", { class: "pw-label" }, "工作区人设", el("span", { class: "pw-path", text: "<工作区>/.persona.txt（覆盖全局）" })),
						el("div", { class: "pw-row" },
							localWorkspace = el("select", {}, el("option", { value: "", text: "（未选择工作区）" }))),
						localPathInput = el("input", { type: "text", class: "pw-hidden", placeholder: "工作区绝对路径，如 D:\\Deepseek-Harness\\贪吃蛇" }),
						el("div", { class: "pw-row", style: "margin-top:8px" },
							localMode = el("select", {},
								el("option", { value: "inherit", text: "跟随全局（不设置）" }),
								el("option", { value: "custom", text: "自定义文本" }),
								el("option", { value: "preset", text: "使用人设库的人设" }),
								el("option", { value: "off", text: "关闭（off）" }))),
						localPreset = el("select", { class: "pw-hidden" }),
						localArea = el("textarea", { class: "pw-hidden", placeholder: "此工作区的人设文本" }),
						el("div", { class: "pw-actions" },
							el("button", { class: "pw-btn", type: "button", text: "保存工作区人设" }))),
					el("div", { class: "pw-section" },
						el("div", { class: "pw-label" }, "人设库", el("span", { class: "pw-path", text: "~/.dsh/.persona/library/" })),
						libraryBox = el("div", {}),
						el("div", { style: "margin-top:10px" },
							newNameInput = el("input", { type: "text", placeholder: "人设名称，如：家猫萝莉" }),
							el("div", { style: "height:8px" }),
							newTextArea = el("textarea", { placeholder: "人设内容……" }),
							el("div", { class: "pw-actions" },
								el("button", { class: "pw-btn ghost", type: "button", text: "存入人设库" }),
								el("button", { class: "pw-btn ghost pw-hidden", type: "button", text: "取消编辑" })))),
					el("div", { class: "pw-section" },
						el("div", { class: "pw-label" }, "历史版本", el("span", { class: "pw-path", text: "~/.dsh/.persona/history.json" })),
						historyBox = el("div", {}),
						el("p", { class: "pw-hint", text: "每次编辑人设自动留档（最多 100 条），点「恢复」回滚到该版本。" })),
					statusLine = el("p", { class: "pw-status" })),
			)

			const closeBtn = card.querySelector(".pw-close")
			const buttons = card.querySelectorAll(".pw-btn")
			const saveBalanceBtn = buttons[0]
			const saveGlobalBtn = buttons[1]
			const saveLocalBtn = buttons[2]
			saveLibBtn = buttons[3]
			cancelEditBtn = buttons[4]
			balanceStatus = card.querySelector(".pw-balance-status")

			closeBtn.addEventListener("click", () => { close() })
			backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close() })
			saveBalanceBtn.addEventListener("click", () => { saveBalanceMin() })
			saveGlobalBtn.addEventListener("click", () => { saveGlobal() })
			saveLocalBtn.addEventListener("click", () => { saveLocal() })
			saveLibBtn.addEventListener("click", () => { saveToLibrary() })
			cancelEditBtn.addEventListener("click", () => {
				exitEditMode()
				newNameInput.value = ""
				newTextArea.value = ""
				setStatus("已取消编辑", false)
			})
			globalMode.addEventListener("change", syncModeVisibility)
			localMode.addEventListener("change", syncModeVisibility)
			localWorkspace.addEventListener("change", () => { syncModeVisibility(); refresh(true) })
			masterSwitch.addEventListener("change", async () => {
				try {
					await postJson("/api/dsh-persona/switch", { enabled: masterSwitch.checked })
					setStatus(masterSwitch.checked ? "总开关已开启，人设注入恢复" : "总开关已关闭，人设停止注入（定义内容保留）", false)
					await refresh(true)
				} catch (error) {
					masterSwitch.checked = !masterSwitch.checked
					setStatus("切换失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			})
			usageSwitch.addEventListener("change", async () => {
				try {
					await postJson("/api/dsh-persona/usage/switch", { enabled: usageSwitch.checked })
					setStatus(usageSwitch.checked ? "用量统计已启用，对话框上方与工作区列表开始显示消耗" : "用量统计已暂停（历史数据保留）", false)
					usageBannerControl?.setEnabled(usageSwitch.checked)
					await refresh(true)
				} catch (error) {
					usageSwitch.checked = !usageSwitch.checked
					setStatus("切换失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			})
			const usageResetBtn = card.querySelector(".pw-usage-reset")
			if (usageResetBtn !== null) usageResetBtn.addEventListener("click", async () => {
				if (!window.confirm("确定清零全部工作区的用量统计吗？此操作不可恢复。")) return
				try {
					await postJson("/api/dsh-persona/usage/reset", {})
					setStatus("用量统计已清零", false)
					await refresh(true)
				} catch (error) {
					setStatus("清零失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			})
			tiredThemeSelect.addEventListener("change", async () => {
				try {
					await postJson("/api/dsh-persona/tired-theme/save", { theme: tiredThemeSelect.value })
					setStatus(`话术主题已切换为「${tiredThemeSelect.options[tiredThemeSelect.selectedIndex].text}」`, false)
				} catch (error) {
					setStatus("切换失败：" + (error instanceof Error ? error.message : String(error)), true)
				}
			})
			document.addEventListener("keydown", onKey)
			backdrop.appendChild(card)

			function onKey(event) {
				if (event.key === "Escape" && open) close()
			}
			function close() {
				if (!open) return
				open = false
				backdrop.remove()
			}
			function openPanel() {
				if (open) { close(); return }
				open = true
				document.body.appendChild(backdrop)
				refresh()
			}

			return { toggle: openPanel, dispose: () => { document.removeEventListener("keydown", onKey); backdrop.remove() } }
		}

		// ---------------- chat-top usage banner (safe fixed pill) ----------------

		/**
		 * 对话框上方用量浮条：定位在聊天区顶部（与聊天内容同宽居中），显示
		 * 当前对话（最近活跃会话）已消耗的金额与 tokens。
		 *
		 * 设计原则（自研）：
		 *   - 位置跟随聊天区：每轮刷新时只读 [data-chat-flow] 的边界矩形，
		 *     把浮条 fixed 到「聊天区顶部居中」——只读 DOM、只改自己的 style，
		 *     绝不向 React 管理的任何节点写入；
		 *   - 不用 MutationObserver；15 秒心跳 + 窗口 resize 时重新定位；
		 *   - pointer-events:none，纯显示，永不遮挡点击；
		 *   - 任何异常静默降级，绝不影响页面。
		 * @returns {{ dispose: () => void }}
		 */
		function mountUsageBanner() {
			const bar = el("div", { "data-dsh-usage-bar": "", title: "账户余额与本对话消耗（每 15 秒自动刷新）" })
			const bal = el("span", { class: "ub-bal", text: "余额…" })
			const cost = el("span", { class: "ub-cost", text: "本对话…" })
			const tok = el("span", { class: "ub-tok" })
			bar.appendChild(bal)
			bar.appendChild(el("span", { class: "ub-sep", text: "·" }))
			bar.appendChild(cost)
			bar.appendChild(tok)

			/** 余额独立异步更新（慢路径，绝不拖累用量显示）。 */
			const tickBalance = async () => {
				try {
					const payload = await fetchBalanceInfo()
					if (payload?.known === true && payload.balance !== null) {
						bal.textContent = `余额 ¥${payload.balance.toFixed(2)}`
						bal.classList.toggle("ub-warn", payload.sufficient !== true)
						bal.title = payload.sufficient ? "余额充足" : `余额低于预警阈值（¥${String(payload.min ?? 1)}），将触发没电模式`
					} else {
						bal.textContent = "余额未知"
						bal.classList.remove("ub-warn")
						bal.title = "余额查询不可用（无法判断时正常放行）"
					}
				} catch {
					bal.textContent = "余额未知"
					bal.classList.remove("ub-warn")
				}
			}

			/**
			 * 只读定位聊天区：优先消息节点选择器，找不到就遍历页面找最大
			 * 的垂直滚动容器（聊天主区）——不依赖任何具体前端版本的 DOM 结构。
			 */
			const reposition = () => {
				try {
					let target = document.querySelector("[data-chat-flow], [data-chat-flow-kind]")
					if (target !== null) {
						// 从消息节点向上找到它的滚动容器
						let node = target
						let guard = 0
						while (node !== null && guard++ < 12) {
							const style = window.getComputedStyle(node)
							if (/(auto|scroll)/.test(style.overflowY) && node.getBoundingClientRect().height > 300) {
								target = node
								break
							}
							node = node.parentElement
						}
					} else {
						// 通用兜底：最大的垂直滚动容器即聊天主区
						let best = null
						let bestArea = 0
						for (const el of document.querySelectorAll("div, main, section")) {
							const style = window.getComputedStyle(el)
							if (!/(auto|scroll)/.test(style.overflowY)) continue
							const rect = el.getBoundingClientRect()
							const area = rect.width * rect.height
							if (rect.height > 300 && area > bestArea) {
								bestArea = area
								best = el
							}
						}
						target = best
					}
					if (target === null) return false
					const rect = target.getBoundingClientRect()
					if (rect.width <= 0 || rect.height <= 0) return false
					bar.style.top = `${rect.top + 6}px`
					bar.style.left = `${rect.left + rect.width / 2}px`
					return true
				} catch {
					return false
				}
			}

			const refresh = async () => {
				try {
					const located = reposition()
					if (!located) {
						// 启动早期（页面尚未渲染出聊天区）：先隐藏并靠快速重试归位，
						// 避免显示在错误的兜底位置；10 秒后仍找不到才回退页面顶部。
						if (Date.now() - startAt < 10000) {
							bar.style.display = "none"
							return
						}
						bar.style.top = "0px"
						bar.style.left = "50%"
					}
					tickBalance()
					const payload = await fetchUsage()
					if (payload === null || payload?.enabled !== true) {
						bar.style.display = "none"
						return
					}
					// 当前对话 = 最近活跃会话（usage 账本里 updatedAt 最新的那条）
					let best = null
					for (const ws of payload.workspaces ?? []) {
						for (const session of ws.sessions ?? []) {
							if (best === null || (session.updatedAt ?? 0) > (best.updatedAt ?? 0)) best = session
						}
					}
					bar.style.display = "flex"
					if (best !== null && (best.tokens > 0 || best.cost > 0)) {
						cost.textContent = `本对话 ¥${best.cost.toFixed(2)}`
						tok.textContent = ` · ${fmtTokens(best.tokens)} tokens`
					} else {
						cost.textContent = "本对话 ¥0.00"
						tok.textContent = ""
					}
				} catch {
					bar.style.display = "none"
				}
			}

			document.body.appendChild(bar)
			const startAt = Date.now()
			let fastTimer = null
			// 启动前 10 秒每 0.7 秒快速重试：聊天区一渲染出来就立刻归位，
			// 不等 15 秒轮询（解决「启动时位置不对，动开关才恢复」）。
			const fastRetry = () => {
				if (Date.now() - startAt >= 10000) {
					fastTimer = null
					return
				}
				refresh()
				fastTimer = window.setTimeout(fastRetry, 700)
			}
			fastRetry()
			const interval = window.setInterval(refresh, 15000)
			const onResize = () => { reposition() }
			window.addEventListener("resize", onResize)
			return {
				/** 面板开关切换后立即调用：关 → 立刻隐藏；开 → 立刻刷新显示。 */
				setEnabled(enabled) {
					if (!enabled) {
						bar.style.display = "none"
						return
					}
					refresh()
				},
				dispose: () => {
					if (fastTimer !== null) window.clearTimeout(fastTimer)
					window.clearInterval(interval)
					window.removeEventListener("resize", onResize)
					bar.remove()
				},
			}
		}

		// ---------------- plugin apply ----------------

		const inject = []

		/** 面板开关与横幅之间的即时联动控制器（mountUsageBanner 暴露）。 */
		let usageBannerControl = null

		function apply(ctx) {
			const panel = mountPanel()
			const disposers = [panel.dispose]
			try {
				disposers.push(mountSidebarEntry(panel.toggle))
			} catch (error) {
				console.warn("[dsh-guise] sidebar mount failed:", error)
			}
			try {
				usageBannerControl = mountUsageBanner()
				disposers.push(usageBannerControl.dispose)
			} catch (error) {
				console.warn("[dsh-guise] usage banner mount failed:", error)
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) {
					try { dispose() } catch { /* best effort */ }
				}
			}, "dsh-guise: ui")
		}

		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
