import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder, ItemView, WorkspaceLeaf } from 'obsidian';
import { McpServer } from './mcp-server';

interface PluginSettings {
	tcpPort: number;
	httpPort: number;
	systemPromptNote: string;
	systemPromptAdd: string;
	commandText: string;
	resourceIgnorePatterns: string;
}

const VIEW_TYPE_GEMINI = "gemini-workspace-view";

const DEFAULT_COMMAND_TEXT = `Retrieve prompt from Obsidian (SystemPrompt)
Retrieve GEMINI.md from Obsidian (GEMINI.md)
Output plan to Obsidian (GEMINI_PLAN.md)
Output session response to Obsidian (GEMINI_RESP.md)
Output session summary to Obsidian (GEMINI_SUMMARY.md)
Output generated file list to Obsidian (GEMINI_OUTPUT.md)
Output conversation history to Obsidian in /chat share format (GEMINI_CHAT.md)
Retrieve plan from Obsidian (GEMINI_PLAN.md)
Retrieve session response/summary from Obsidian (GEMINI_RESP.md, GEMINI_SUMMARY.md)
Retrieve generated file list from Obsidian (GEMINI_OUTPUT.md)
Check GEMINI files from Obsidian (GEMINI.md, GEMINI_PLAN.md, GEMINI_RESP.md, GEMINI_SUMMARY.md, GEMINI_OUTPUT.md)
Retrieve location from Obsidian
Retrieve current time from Obsidian
Output working directory to Obsidian`;

const DEFAULT_IGNORE_PATTERNS = `^[_.].+$
^.+(?<!(.md))$`;

const DEFAULT_SETTINGS: PluginSettings = {
	tcpPort: 28088,
	httpPort: 28089,
	systemPromptNote: '',
	systemPromptAdd: '',
	commandText: DEFAULT_COMMAND_TEXT,
	resourceIgnorePatterns: DEFAULT_IGNORE_PATTERNS
}

export default class MyPlugin extends Plugin {
	settings: PluginSettings;
	serverRunning: boolean = false;
	serverLogs: string[] = [];
	view: GeminiWorkspaceView | null = null;
    mcpServer: McpServer;

	async onload() {
		await this.loadSettings();

        this.mcpServer = new McpServer(this);

		this.registerView(
			VIEW_TYPE_GEMINI,
			(leaf) => {
				this.view = new GeminiWorkspaceView(leaf, this);
				return this.view;
			}
		);

		this.addRibbonIcon('dice', 'Gemini Workspace', () => {
			this.activateView();
		});

		this.addSettingTab(new GeminiSettingsTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GEMINI);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_GEMINI, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		this.mcpServer?.stop();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

    refreshView() {
        if (this.view) {
            this.view.refresh();
        }
    }
}

class GeminiWorkspaceView extends ItemView {
	plugin: MyPlugin;
	currentFolder: TFolder | null = null;
    isRefreshing: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_GEMINI;
	}

	getDisplayText() {
		return "Gemini Workspace";
	}

	async onOpen() {
		this.refresh();
	}

	async onClose() {
		// Nothing to clean up.
	}

	async refresh() {
        if (this.isRefreshing) return;
        this.isRefreshing = true;

        console.log("Gemini: Refreshing view...");
		const container = this.contentEl;
		container.empty();
		container.createEl("h2", { text: "Gemini Workspace" });

        try {
            this.determineCurrentFolder();
            console.log("Gemini: Current folder determined:", this.currentFolder?.path);
            this.buildLocationArea(container);
            console.log("Gemini: Location area built");
            await this.buildGeminiFilesArea(container);
            console.log("Gemini: Files area built");
            await this.buildResourceFilesArea(container);
            this.buildMcpServerArea(container);
            this.buildMcpClientCommandArea(container);
            this.buildMcpLogArea(container);
            this.buildMcpClientConfigArea(container);
        } catch (err) {
            console.error("Gemini: Error refreshing view", err);
            container.createEl("div", { text: "Error loading view: " + err });
        } finally {
            this.isRefreshing = false;
        }
	}

	determineCurrentFolder() {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			this.currentFolder = activeFile.parent;
		} else {
			// Try to get selected folder from file explorer
            let found = false;
            const fileExplorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
            if (fileExplorerLeaf) {
                const view = fileExplorerLeaf.view as any;
                // Check for selected item in File Explorer
                const selectedEl = view.containerEl.querySelector('.tree-item-self.is-selected');
                if (selectedEl) {
                    const itemEl = selectedEl.closest('.tree-item');
                    if (itemEl && itemEl.hasAttribute('data-path')) {
                        const path = itemEl.getAttribute('data-path');
                        if (path) {
                            const file = this.app.vault.getAbstractFileByPath(path);
                            if (file instanceof TFile) {
                                this.currentFolder = file.parent;
                                found = true;
                            } else if (file instanceof TFolder) {
                                this.currentFolder = file;
                                found = true;
                            }
                        }
                    }
                }
            }

            if (!found) {
			    this.currentFolder = this.app.vault.getRoot();
            }
		}
	}

	buildLocationArea(container: Element) {
		const locationEl = container.createEl("div", { cls: "gemini-location-area" });
		locationEl.createEl("h3", { text: "Location" });

        const folderPath = this.currentFolder ? (this.currentFolder.path === '/' ? '(root)' : this.currentFolder.path) : '(root)';
		locationEl.createEl("div", { text: folderPath, cls: "gemini-location-path" });
	}

	async buildGeminiFilesArea(container: Element) {
		const area = container.createEl("div", { cls: "gemini-files-area" });
		const header = area.createEl("div", { cls: "gemini-area-header" });
		header.createEl("h3", { text: "GEMINI files" });

		const refreshBtn = header.createEl("button", { text: "Refresh" });
		refreshBtn.onclick = () => this.refresh();

		const fileList = [
			"GEMINI.md",
			"GEMINI_PLAN.md",
			"GEMINI_RESP.md",
			"GEMINI_CMD.md",
			"GEMINI_OUTPUT.md",
			"GEMINI_CHAT.md",
            "GEMINI_SUMMARY.md"
		];

		const table = area.createEl("table", { cls: "gemini-file-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "File" });
		headerRow.createEl("th", { text: "Modified / Action" });

		const tbody = table.createEl("tbody");

		for (const fileName of fileList) {
			const row = tbody.createEl("tr");
			const nameCell = row.createEl("td");
			const statusCell = row.createEl("td");

			const filePath = this.currentFolder && this.currentFolder.path !== '/'
				? `${this.currentFolder.path}/${fileName}`
				: fileName;

			const file = this.app.vault.getAbstractFileByPath(filePath);

			if (file instanceof TFile) {
				const link = nameCell.createEl("a", { text: fileName, href: "#" });
				link.onclick = (e) => {
                    e.preventDefault();
					this.app.workspace.getLeaf().openFile(file);
				};

				// Format timestamp: YYYY-MM-DD HH:mm:ss
                const date = new Date(file.stat.mtime);
                const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
				statusCell.setText(dateStr);
			} else {
				nameCell.setText(fileName);
				const createBtn = statusCell.createEl("button", { text: "CREATE" });
				createBtn.onclick = async () => {
                    try {
                        const newFile = await this.app.vault.create(filePath, "");
                        this.app.workspace.getLeaf().openFile(newFile);
                        this.refresh();
                    } catch (err) {
                        console.error("Failed to create file", err);
                    }
				};
			}
		}
	}

	async buildResourceFilesArea(container: Element) {
		const area = container.createEl("div", { cls: "gemini-files-area" });
		const header = area.createEl("div", { cls: "gemini-area-header" });
		header.createEl("h3", { text: "Resource files" });

		if (!this.currentFolder) return;

		const ignorePatterns = this.plugin.settings.resourceIgnorePatterns
			.split('\n')
			.map(p => p.trim())
			.filter(p => p.length > 0)
			.map(p => new RegExp(p));

		const geminiFiles = [
			"GEMINI.md",
			"GEMINI_PLAN.md",
			"GEMINI_RESP.md",
			"GEMINI_CMD.md",
			"GEMINI_OUTPUT.md",
			"GEMINI_CHAT.md",
            "GEMINI_SUMMARY.md"
		];

		const files: TFile[] = [];
		for (const child of this.currentFolder.children) {
			if (child instanceof TFile) {
				// Exclude GEMINI files
				if (geminiFiles.includes(child.name)) continue;

				// Check ignore patterns
				let ignored = false;
				for (const pattern of ignorePatterns) {
					if (pattern.test(child.name)) {
						ignored = true;
						break;
					}
				}
				if (!ignored) {
					files.push(child);
				}
			}
		}

		// Sort files by name (or modified time if preferred)
		files.sort((a, b) => a.name.localeCompare(b.name));

		const table = area.createEl("table", { cls: "gemini-file-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "File" });
		headerRow.createEl("th", { text: "Modified" });

		const tbody = table.createEl("tbody");

		if (files.length === 0) {
			const row = tbody.createEl("tr");
			const cell = row.createEl("td", { text: "No resources found." });
			cell.colSpan = 2;
		} else {
			for (const file of files) {
				const row = tbody.createEl("tr");
				const nameCell = row.createEl("td");
				const statusCell = row.createEl("td");

				const link = nameCell.createEl("a", { text: file.name, href: "#" });
				link.onclick = (e) => {
					e.preventDefault();
					this.app.workspace.getLeaf().openFile(file);
				};

				const date = new Date(file.stat.mtime);
				const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
				statusCell.setText(dateStr);
			}
		}
	}

	buildMcpServerArea(container: Element) {
		const area = container.createEl("div", { cls: "gemini-section-area" });
		area.createEl("h3", { text: "MCP Server" });

		const statusContainer = area.createEl("div", { cls: "gemini-status-container" });
		const statusText = statusContainer.createEl("span", {
			text: this.plugin.serverRunning ? "Status: RUNNING" : "Status: STOPPED",
			cls: this.plugin.serverRunning ? "gemini-status-running" : "gemini-status-stopped"
		});

		const toggleBtn = statusContainer.createEl("button", {
			text: this.plugin.serverRunning ? "STOP" : "START",
            cls: "gemini-status-button"
		});
		toggleBtn.onclick = () => {
            if (this.plugin.serverRunning) {
                this.plugin.mcpServer.stop();
            } else {
                this.plugin.mcpServer.start(this.plugin.settings.tcpPort, this.plugin.settings.httpPort);
            }
		};
	}

    buildMcpLogArea(container: Element) {
        const area = container.createEl("div", { cls: "gemini-section-area" });
        const logHeader = area.createEl("div", { cls: "gemini-area-header" });
        logHeader.createEl("h3", { text: "MCP Log" });
        const clearBtn = logHeader.createEl("button", { text: "Clear" });
        clearBtn.onclick = () => {
            this.plugin.serverLogs = [];
            this.refresh();
        };

		const logArea = area.createEl("textarea", { cls: "gemini-log-area" });
		logArea.readOnly = true;
		logArea.rows = 15;
		logArea.value = this.plugin.serverLogs.join('\n');
        logArea.scrollTop = logArea.scrollHeight;
    }

	buildMcpClientCommandArea(container: Element) {
		const area = container.createEl("div", { cls: "gemini-section-area" });
		area.createEl("h3", { text: "MCP Client Command" });

		const lines = this.plugin.settings.commandText.split('\n');
		const list = area.createEl("ul", { cls: "gemini-command-list" });

		lines.forEach(line => {
			if (line.trim().length === 0) return;
			const item = list.createEl("li");
			const link = item.createEl("a", { text: line, href: "#" });
			link.onclick = (e) => {
				e.preventDefault();
				navigator.clipboard.writeText(line).then(() => {
					// new Notice('Copied to clipboard'); // Notice is global, need import
                    console.log('Copied to clipboard:', line);
				});
			};
		});
	}

	buildMcpClientConfigArea(container: Element) {
		const area = container.createEl("div", { cls: "gemini-section-area" });
		area.createEl("h3", { text: "MCP Client Configuration" });

		const tabsContainer = area.createEl("div", { cls: "gemini-tabs" });
		const contentContainer = area.createEl("div", { cls: "gemini-tab-content" });

		const configs: Record<string, string> = {
			'nc': `gemini mcp add obsidianMcpServer nc "127.0.0.1" "${this.plugin.settings.tcpPort}"`,
			'wsl.exe': `gemini mcp add obsidianMcpServer "wsl.exe" "ncat.exe" "127.0.0.1" "${this.plugin.settings.tcpPort}"`,
			'ncat.exe': `gemini mcp add obsidianMcpServer ncat.exe "127.0.0.1" "${this.plugin.settings.tcpPort}"`
		};

		const tabNames = Object.keys(configs);
		let activeTab = tabNames[0];

        // Simple tab switching logic
        const renderTabs = () => {
            tabsContainer.empty();
            contentContainer.empty();

            tabNames.forEach(name => {
                const tab = tabsContainer.createEl("button", {
                    text: name,
                    cls: activeTab === name ? "gemini-tab-active" : "gemini-tab"
                });
                tab.onclick = () => {
                    activeTab = name;
                    renderTabs();
                };
            });

            const codeBlock = contentContainer.createEl("pre");
            codeBlock.createEl("code", { text: configs[activeTab] });

            const controls = contentContainer.createEl("div", { cls: "gemini-config-controls" });
            const copyBtn = controls.createEl("button", { text: "CopyToClipboard" });
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(configs[activeTab]);
            };
            controls.createEl("span", { text: " See .gemini/settings.json" });
        };

        renderTabs();
	}
}

class GeminiSettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'MCP Gemini 3 Settings'});

		new Setting(containerEl)
			.setName('TCP Port')
			.setDesc('Port number for the Worker TCP server.')
			.addText(text => text
				.setPlaceholder('8080')
				.setValue(String(this.plugin.settings.tcpPort))
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port)) {
						this.plugin.settings.tcpPort = port;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('HTTP Port')
			.setDesc('Port number for the Worker HTTP/SSE server.')
			.addText(text => text
				.setPlaceholder('8081')
				.setValue(String(this.plugin.settings.httpPort))
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port)) {
						this.plugin.settings.httpPort = port;
						await this.plugin.saveSettings();
					}
				}));

		// System Prompt Note: Dropdown with file list
		const files = this.app.vault.getFiles().filter(f => f.extension === 'md');
		const options: Record<string, string> = { '': 'Select a note...' };
		files.forEach(file => {
			options[file.path] = file.path;
		});

		new Setting(containerEl)
			.setName('System Prompt Note')
			.setDesc('Select a note to use as part of the system prompt.')
			.addDropdown(dropdown => dropdown
				.addOptions(options)
				.setValue(this.plugin.settings.systemPromptNote)
				.onChange(async (value) => {
					this.plugin.settings.systemPromptNote = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('System Prompt Add')
			.setDesc('Additional text for the system prompt.')
			.addTextArea(text => text
				.setPlaceholder('Enter additional system prompt here...')
				.setValue(this.plugin.settings.systemPromptAdd)
				.onChange(async (value) => {
					this.plugin.settings.systemPromptAdd = value;
					await this.plugin.saveSettings();
				}));
        // Style for System Prompt Add TextArea (15 lines, max width)
        const sysPromptAddEl = containerEl.lastElementChild?.querySelector('textarea');
        if (sysPromptAddEl) {
            sysPromptAddEl.rows = 15;
            sysPromptAddEl.style.width = '100%';
        }

		new Setting(containerEl)
			.setName('Command Text')
			.setDesc('Text to display in the MCP Client Command area.')
			.addTextArea(text => text
				.setValue(this.plugin.settings.commandText)
				.onChange(async (value) => {
					this.plugin.settings.commandText = value;
					await this.plugin.saveSettings();
				}));
        // Style for Command Text TextArea (15 lines, max width)
        const cmdTextEl = containerEl.lastElementChild?.querySelector('textarea');
        if (cmdTextEl) {
            cmdTextEl.rows = 15;
            cmdTextEl.style.width = '100%';
        }

		new Setting(containerEl)
			.setName('Resource ignore patterns')
			.setDesc('Regex patterns to ignore when listing resources.')
			.addTextArea(text => text
				.setValue(this.plugin.settings.resourceIgnorePatterns)
				.onChange(async (value) => {
					this.plugin.settings.resourceIgnorePatterns = value;
					await this.plugin.saveSettings();
				}));
        // Style for Resource ignore patterns TextArea (5 lines, max width)
        const ignorePatternsEl = containerEl.lastElementChild?.querySelector('textarea');
        if (ignorePatternsEl) {
            ignorePatternsEl.rows = 5;
            ignorePatternsEl.style.width = '100%';
        }
	}
}
