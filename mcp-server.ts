import { Server, Socket } from 'net';
import { Server as HttpServer, IncomingMessage, ServerResponse } from 'http';
import { TFile, Notice } from 'obsidian';
import MyPlugin from './main';

export class McpServer {
    plugin: MyPlugin;
    server: Server | null = null;
    httpServer: HttpServer | null = null;
    connections: Socket[] = [];
    sseConnections: Map<string, ServerResponse> = new Map();

    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }

    start(tcpPort: number, httpPort?: number) {
        if (this.server) {
            this.log('Server already running.');
            return;
        }

        // TCP Server
        this.server = new Server((socket) => {
            this.handleConnection(socket);
        });

        this.server.listen(tcpPort, () => {
            const msg = `MCP TCP Server started on port ${tcpPort}`;
            this.log(msg);
            new Notice(msg);
            this.plugin.serverRunning = true;
        });

        this.server.on('error', (err: any) => {
            const msg = `TCP Server error: ${err.message}`;
            this.log(msg);
            new Notice("MCP TCP Server Error: " + err.message);
            if (err.code === 'EADDRINUSE') {
                new Notice(`TCP Port ${tcpPort} is already in use.`);
            }
            this.stop();
        });

        // HTTP Server
        if (httpPort) {
            this.httpServer = new HttpServer((req, res) => {
                this.handleHttpRequest(req, res);
            });

            this.httpServer.listen(httpPort, () => {
                const msg = `MCP HTTP Server started on port ${httpPort}`;
                this.log(msg);
                new Notice(msg);
            });

            this.httpServer.on('error', (err: any) => {
                const msg = `HTTP Server error: ${err.message}`;
                this.log(msg);
                new Notice("MCP HTTP Server Error: " + err.message);
                if (err.code === 'EADDRINUSE') {
                    new Notice(`HTTP Port ${httpPort} is already in use.`);
                }
            });
        }
    }

    stop() {
        if (this.server) {
            this.connections.forEach(conn => conn.destroy());
            this.connections = [];
            this.server.close(() => {
                this.log('MCP TCP Server stopped.');
                this.plugin.serverRunning = false;
                this.server = null;
            });
        }

        if (this.httpServer) {
            this.sseConnections.forEach(res => res.end());
            this.sseConnections.clear();
            this.httpServer.close(() => {
                this.log('MCP HTTP Server stopped.');
                this.httpServer = null;
            });
        }

        if (!this.server && !this.httpServer) {
             this.plugin.serverRunning = false;
             this.plugin.refreshView();
        }
    }

    log(message: string) {
        const timestamp = new Date().toISOString();
        const msg = `${timestamp}: ${message}`;
        this.plugin.serverLogs.push(msg);
        if (this.plugin.serverLogs.length > 1000) {
            this.plugin.serverLogs.shift();
        }
        this.plugin.refreshView();
    }

    // TCP Connection Handler
    private handleConnection(socket: Socket) {
        this.log(`New TCP client connected from ${socket.remoteAddress}`);
        this.connections.push(socket);

        let buffer = '';

        socket.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.trim()) {
                    this.log(`TCP Request: ${line.trim()}`);
                    this.processMessage(line.trim(), (response) => {
                         socket.write(JSON.stringify(response) + '\n');
                    });
                }
            }
        });

        socket.on('end', () => {
            this.log('TCP Client disconnected');
            this.connections = this.connections.filter(c => c !== socket);
        });

        socket.on('error', (err) => {
            this.log(`TCP Client error: ${err.message}`);
            this.connections = this.connections.filter(c => c !== socket);
        });
    }

    // HTTP Request Handler
    private handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url || '', `http://${req.headers.host}`);

        if (url.pathname === '/sse' && req.method === 'GET') {
            this.handleSseConnection(req, res);
        } else if (url.pathname === '/message' && req.method === 'POST') {
            this.handlePostMessage(req, res, url);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    }

    private handleSseConnection(req: IncomingMessage, res: ServerResponse) {
        const sessionId = this.generateUuid();
        this.log(`New SSE client connected: ${sessionId}`);

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        this.sseConnections.set(sessionId, res);

        // Send endpoint event
        const endpointUrl = `/message?sessionId=${sessionId}`;
        res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

        req.on('close', () => {
            this.log(`SSE Client disconnected: ${sessionId}`);
            this.sseConnections.delete(sessionId);
        });
    }

    private handlePostMessage(req: IncomingMessage, res: ServerResponse, url: URL) {
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId || !this.sseConnections.has(sessionId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing sessionId' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                // Assuming body is a valid JSON string for MCP message
                // MCP over SSE usually expects the body to be the JSON-RPC message directly
                this.log(`HTTP Request from ${sessionId}: ${body}`);

                // Respond with 202 Accepted immediately
                res.writeHead(202);
                res.end('Accepted');

                // Process the message and send result via SSE
                this.processMessage(body, (response) => {
                    const sseRes = this.sseConnections.get(sessionId);
                    if (sseRes) {
                        const responseStr = JSON.stringify(response);
                        sseRes.write(`event: message\ndata: ${responseStr}\n\n`);
                        this.log(`SSE Response to ${sessionId}: ${responseStr}`);
                    }
                });

            } catch (err) {
                this.log(`Error parsing HTTP body: ${err}`);
                res.writeHead(500);
                res.end('Internal Server Error');
            }
        });
    }

    private generateUuid(): string {
         return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Refactored processMessage to be transport-agnostic
    private async processMessage(messageStr: string, sendCallback: (response: any) => void) {
        try {
            const message = JSON.parse(messageStr);

            let response: any = null;

            if (message.method === 'initialize') {
                response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        protocolVersion: "2024-11-05",
                        capabilities: {
                            prompts: {},
                            resources: {},
                            tools: {}
                        },
                        serverInfo: {
                            name: "obsidianMcpServer",
                            version: "1.0.0"
                        }
                    }
                };
            } else if (message.method === 'notifications/initialized') {
                this.log('Client initialized.');
                // Instructions for the client to retrieve initial prompts
                const instruction = {
                    jsonrpc: "2.0",
                    method: "notifications/message",
                    params: {
                        text: "Please retrieve the following prompts using prompts/get: 'GEMINI.md' and 'SystemPrompt'."
                    }
                };
                sendCallback(instruction);
                this.log("Sent prompt retrieval instructions to client.");
            } else if (message.method === 'ping') {
                response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {}
                };
            } else if (message.method === 'prompts/list') {
                response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        prompts: [
                            {
                                name: "GEMINI.md",
                                description: "Returns the content of GEMINI.md in the current workspace location."
                            },
                            {
                                name: "SystemPrompt",
                                description: "Returns the configured system prompt."
                            }
                        ]
                    }
                };
            } else if (message.method === 'prompts/get') {
                const name = message.params?.name;
                if (name === "GEMINI.md") {
                    const content = await this.getGeminiMdContent();
                    response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        result: {
                            messages: [
                                {
                                    role: "user",
                                    content: {
                                        type: "text",
                                        text: content
                                    }
                                }
                            ]
                        }
                    };
                } else if (name === "SystemPrompt") {
                    const content = await this.getSystemPromptContent();
                    response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        result: {
                            messages: [
                                {
                                    role: "user",
                                    content: {
                                        type: "text",
                                        text: content
                                    }
                                }
                            ]
                        }
                    };
                } else {
                    response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        error: {
                            code: -32602,
                            message: "Prompt not found"
                        }
                    };
                }
            } else if (message.method === 'resources/list') {
                const resources = this.getAllResources();
                response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        resources: resources
                    }
                };
            } else if (message.method === 'resources/read') {
                const uri = message.params?.uri;
                const content = await this.readResource(uri);
                if (content !== null) {
                    response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        result: {
                            contents: [
                                {
                                    uri: uri,
                                    mimeType: "text/plain",
                                    text: content
                                }
                            ]
                        }
                    };
                } else {
                     response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        error: {
                            code: -32602,
                            message: "Resource not found or invalid URI"
                        }
                    };
                }
            } else if (message.method === 'tools/list') {
                response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        tools: [
                            {
                                name: "read_resource",
                                description: "Reads the content of a resource file. Target file must be within the current resource scope.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "Name of the resource file" }
                                    },
                                    required: ["name"]
                                }
                            },
                            {
                                name: "write_resource",
                                description: "Writes content to a resource file. Creates file if not exists. Target file must be within the current resource scope.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "Name of the resource file" },
                                        content: { type: "string", description: "Content to write" }
                                    },
                                    required: ["name", "content"]
                                }
                            },
                            {
                                name: "append_resource",
                                description: "Appends content to the end of a resource file. Creates file if not exists. Target file must be within the current resource scope.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "Name of the resource file" },
                                        content: { type: "string", description: "Content to append" }
                                    },
                                    required: ["name", "content"]
                                }
                            },
                            {
                                name: "get_location",
                                description: "Returns the current location path in Obsidian.",
                                inputSchema: { type: "object", properties: {} }
                            },
                            {
                                name: "get_datetime",
                                description: "Returns the current date and time.",
                                inputSchema: { type: "object", properties: {} }
                            },
                            {
                                name: "report_directory",
                                description: "Logs the current working directory to the MCP Log.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        dir: { type: "string", description: "Directory path" }
                                    },
                                    required: ["dir"]
                                }
                            }
                        ]
                    }
                };
            } else if (message.method === 'tools/call') {
                const name = message.params?.name;
                const args = message.params?.arguments;
                let result: any = {};
                let isError = false;

                try {
                    if (name === "read_resource") {
                        result = await this.toolReadResource(args?.name);
                    } else if (name === "write_resource") {
                        result = await this.toolWriteResource(args?.name, args?.content);
                    } else if (name === "append_resource") {
                        result = await this.toolAppendResource(args?.name, args?.content);
                    } else if (name === "get_location") {
                        result = { content: [{ type: "text", text: this.getValidationCurrentPath() }] };
                    } else if (name === "get_datetime") {
                        const now = new Date();
                        const formatted = now.getFullYear() + "-" +
                            String(now.getMonth() + 1).padStart(2, '0') + "-" +
                            String(now.getDate()).padStart(2, '0') + " " +
                            String(now.getHours()).padStart(2, '0') + ":" +
                            String(now.getMinutes()).padStart(2, '0') + ":" +
                            String(now.getSeconds()).padStart(2, '0');
                        result = { content: [{ type: "text", text: formatted }] };
                    } else if (name === "report_directory") {
                        const dir = args?.dir;
                        this.log(`Reported Directory: ${dir}`);
                        result = { content: [{ type: "text", text: `Directory reported: ${dir}` }] };
                    } else {
                         isError = true;
                         result = { error: "Tool not found" };
                    }
                } catch (err) {
                    isError = true;
                    result = { error: String(err) };
                }

                if (isError) {
                    response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        error: {
                            code: -32603,
                            message: result.error || "Internal error"
                        }
                    };
                } else {
                    response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        result: result
                    };
                }
            } else {
                 response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    error: {
                        code: -32601,
                        message: "Method not found"
                    }
                };
            }

            if (response) {
                sendCallback(response);
            }

        } catch (e) {
            this.log(`Error processing message: ${e}`);
             const errorResponse = {
                jsonrpc: "2.0",
                id: null,
                error: {
                    code: -32700,
                    message: "Parse error"
                }
            };
            sendCallback(errorResponse);
        }
    }

    private async getGeminiMdContent(): Promise<string> {
        let currentFolder = this.plugin.view?.currentFolder;

        // If view is not active or folder not determined, default to vault root
        if (!currentFolder) {
            currentFolder = this.plugin.app.vault.getRoot();
        }

        const filePath = currentFolder.path === '/' ? 'GEMINI.md' : `${currentFolder.path}/GEMINI.md`;
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

        if (file instanceof TFile) {
            return await this.plugin.app.vault.read(file);
        }
        return "";
    }

    private async getSystemPromptContent(): Promise<string> {
        let content = "";

        const notePath = this.plugin.settings.systemPromptNote;
        if (notePath) {
            const file = this.plugin.app.vault.getAbstractFileByPath(notePath);
            if (file instanceof TFile) {
                const noteContent = await this.plugin.app.vault.read(file);
                content += noteContent + "\n\n";
            }
        }

        const addContent = this.plugin.settings.systemPromptAdd;
        if (addContent) {
            content += addContent;
        }

        return content;
    }

        private getAllResources(): any[] {
            const currentFolder = this.plugin.view?.currentFolder;
            if (!currentFolder) return [];

            const resources: any[] = [];

            const geminiFiles = [
    			"GEMINI_PLAN.md",
    			"GEMINI_RESP.md",
    			"GEMINI_CMD.md",
    			"GEMINI_OUTPUT.md",
    			"GEMINI_CHAT.md",
                "GEMINI_SUMMARY.md",
                "GEMINI.md"
            ];

            for (const fileName of geminiFiles) {
                 const filePath = this.getFilePath(fileName);
                 const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                 if (file instanceof TFile) {
                     resources.push({
                         uri: `gemini://${fileName}`,
                         name: fileName,
                         description: `Gemini file: ${fileName}`
                     });
                 }
            }

            resources.push({
                uri: `gemini://SystemPrompt`,
                name: "SystemPrompt",
                description: "System Prompt (Note + Add)"
            });

            const ignorePatterns = this.plugin.settings.resourceIgnorePatterns
    			.split('\n')
    			.map(p => p.trim())
    			.filter(p => p.length > 0)
    			.map(p => new RegExp(p));

            for (const child of currentFolder.children) {
    			if (child instanceof TFile) {
    				if (geminiFiles.includes(child.name)) continue;

    				let ignored = false;
    				for (const pattern of ignorePatterns) {
    					if (pattern.test(child.name)) {
    						ignored = true;
    						break;
    					}
    				}
    				if (!ignored) {
    					resources.push({
                            uri: `gemini://${child.name}`,
                            name: child.name,
                            description: `Resource file: ${child.name}`
                        });
    				}
    			}
    		}

            return resources;
        }
        private async readResource(uri: string): Promise<string | null> {
            if (!uri.startsWith("gemini://")) return null;
            const name = uri.substring("gemini://".length);

            if (name === "SystemPrompt") {
                return await this.getSystemPromptContent();
            }

            const filePath = this.getFilePath(name);

            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                return await this.plugin.app.vault.read(file);
            }
            return null;
        }
    private getValidationCurrentPath(): string {
        const currentFolder = this.plugin.view?.currentFolder;
        return currentFolder ? (currentFolder.path === '/' ? '(root)' : currentFolder.path) : '(root)';
    }

    private isValidResource(name: string): boolean {
        if (name.includes("/")) return false;

        const geminiFiles = [
			"GEMINI_PLAN.md",
			"GEMINI_RESP.md",
			"GEMINI_CMD.md",
			"GEMINI_OUTPUT.md",
			"GEMINI_CHAT.md",
            "GEMINI_SUMMARY.md",
            "GEMINI.md",
            "SystemPrompt"
        ];

        if (geminiFiles.includes(name)) return true;

        const ignorePatterns = this.plugin.settings.resourceIgnorePatterns
			.split('\n')
			.map(p => p.trim())
			.filter(p => p.length > 0)
			.map(p => new RegExp(p));

        for (const pattern of ignorePatterns) {
            if (pattern.test(name)) return false;
        }

        return true;
    }

    private getFilePath(name: string): string {
         const currentFolder = this.plugin.view?.currentFolder;
         if (!currentFolder || currentFolder.path === '/') return name;
         return `${currentFolder.path}/${name}`;
    }

    private async toolReadResource(name: string): Promise<any> {
        if (!name) throw new Error("Name is required");
        if (!this.isValidResource(name)) throw new Error("Invalid resource name or access denied");

        if (name === "SystemPrompt") {
            const content = await this.getSystemPromptContent();
            return { content: [{ type: "text", text: content }] };
        }

        const filePath = this.getFilePath(name);
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

        if (file instanceof TFile) {
            const content = await this.plugin.app.vault.read(file);
            return { content: [{ type: "text", text: content }] };
        }
        return { content: [{ type: "text", text: "" }] };
    }

    private async toolWriteResource(name: string, content: string): Promise<any> {
        if (!name || content === undefined) {
            throw new Error("Name and content are required");
        }

        if (name === "GEMINI.md" || name === "SystemPrompt") {
             throw new Error(`Writing to ${name} is not allowed via write_resource.`);
        }

        const isValid = this.isValidResource(name);
        if (!isValid) {
            throw new Error("Invalid resource name or access denied");
        }

        const filePath = this.getFilePath(name);
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

        try {
            if (file instanceof TFile) {
                await this.plugin.app.vault.modify(file, content);
            } else {
                await this.plugin.app.vault.create(filePath, content);
            }
        } catch (e) {
            this.log(`Error during vault operation: ${e}`);
            throw e;
        }

        this.plugin.refreshView();
        return { content: [{ type: "text", text: "Successfully wrote to resource" }] };
    }

    private async toolAppendResource(name: string, content: string): Promise<any> {
        if (!name || content === undefined) throw new Error("Name and content are required");

        if (name === "GEMINI.md") {
             throw new Error("Appending to GEMINI.md is not allowed via append_resource.");
        }

        if (!this.isValidResource(name)) throw new Error("Invalid resource name or access denied");

        const filePath = this.getFilePath(name);
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);

        if (file instanceof TFile) {
            await this.plugin.app.vault.append(file, content);
        } else {
            await this.plugin.app.vault.create(filePath, content);
        }

        this.plugin.refreshView();
        return { content: [{ type: "text", text: "Successfully appended to resource" }] };
    }
}
