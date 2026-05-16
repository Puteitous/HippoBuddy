const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let requestIdCounter = 1;

function sendResponse(id, result) {
    const response = {
        jsonrpc: "2.0",
        id: id,
        result: result
    };
    process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id, code, message) {
    const response = {
        jsonrpc: "2.0",
        id: id,
        error: {
            code: code,
            message: message
        }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
}

const testResources = {
    "file:///README.md": {
        name: "README.md",
        description: "项目说明文档",
        mimeType: "text/markdown",
        content: "# MCP Echo Test Server\n\n这是一个用于测试 MCP 协议的 Echo 服务器。\n\n## 功能\n\n- echo: 回显消息\n- add: 计算两个数字的和\n- resources: 提供示例文件内容\n- prompts: 提供示例提示词模板\n"
    },
    "file:///config.example.yaml": {
        name: "配置示例",
        description: "MCP 服务器配置示例",
        mimeType: "text/yaml",
        content: "mcp:\n  enabled: true\n  auto_connect: true\n  servers:\n    - id: echo\n      name: Echo Test Server\n      type: stdio\n      command: node\n      args: [\"mcp-test-server.cjs\"]\n"
    },
    "test:///server-status": {
        name: "服务器状态",
        description: "当前服务器运行状态",
        mimeType: "text/plain",
        content: `服务器状态: 运行中\n启动时间: ${new Date().toISOString()}\n版本: 1.0.0\n协议: 2024-11-05\n`
    }
};

const testPrompts = {
    "code-review": {
        name: "code-review",
        description: "代码审查专家提示词",
        arguments: [
            {
                name: "language",
                description: "编程语言",
                required: true
            },
            {
                name: "code",
                description: "待审查的代码",
                required: true
            }
        ],
        render: (args) => ({
            description: "专业代码审查提示词",
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `请作为一名资深的 ${args.language || 'software'} 开发专家，对以下代码进行全面审查：

\`\`\`${args.language || 'java'}
${args.code || '// 请提供代码'}
\`\`\`

请重点关注：
1. 代码逻辑正确性
2. 潜在的 bug 和边界情况
3. 性能优化建议
4. 代码风格和可读性
5. 安全隐患（如有）

请给出具体的改进建议和示例。`
                    }
                }
            ]
        })
    },
    "summarize": {
        name: "summarize",
        description: "文本摘要生成器",
        arguments: [
            {
                name: "text",
                description: "待摘要的文本",
                required: true
            },
            {
                name: "style",
                description: "摘要风格 (bullet/paragraph/technical)",
                required: false
            }
        ],
        render: (args) => ({
            description: "智能文本摘要提示词",
            messages: [
                {
                    role: "system",
                    content: {
                        type: "text",
                        text: "你是一名专业的内容摘要专家，擅长从长文本中提取核心信息。"
                    }
                },
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `请对以下文本进行${args.style === 'bullet' ? '要点式' : args.style === 'technical' ? '技术性' : '简洁的'}摘要：

${args.text}

要求：
- 准确提取关键信息
- 保持原意
- ${args.style === 'bullet' ? '- 使用项目符号列出要点' : '- 语言流畅简洁'}
- 不超过原文 30% 的长度`
                    }
                }
            ]
        })
    },
    "explain-term": {
        name: "explain-term",
        description: "技术术语解释器",
        arguments: [
            {
                name: "term",
                description: "要解释的技术术语",
                required: true
            }
        ],
        render: (args) => ({
            description: "技术术语解释提示词",
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `请用通俗易懂的方式解释以下技术术语：「${args.term || 'MCP'}」

解释结构：
1. 简单定义（一句话）
2. 核心概念
3. 主要用途/应用场景
4. 简单类比（帮助理解）`
                    }
                }
            ]
        })
    }
};

console.error("MCP Echo Server 启动...");

rl.on('line', (line) => {
    try {
        const msg = JSON.parse(line);
        console.error("收到请求:", JSON.stringify(msg, null, 2));

        if (msg.method === 'initialize') {
            sendResponse(msg.id, {
                protocolVersion: "2024-11-05",
                serverInfo: {
                    name: "echo-server",
                    version: "1.0.0"
                },
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {}
                }
            });
            console.error("✅ 初始化完成 (支持: tools, resources, prompts)");
        }
        else if (msg.method === 'initialized') {
            console.error("✅ 客户端已确认初始化");
        }
        else if (msg.method === 'tools/list') {
            sendResponse(msg.id, {
                tools: [
                    {
                        name: "echo",
                        description: "回显输入的消息内容 - 测试用工具",
                        inputSchema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    description: "要回显的消息内容"
                                }
                            },
                            required: ["message"]
                        }
                    },
                    {
                        name: "add",
                        description: "计算两个数字的和 - 测试用工具",
                        inputSchema: {
                            type: "object",
                            properties: {
                                a: {
                                    type: "number",
                                    description: "第一个数字"
                                },
                                b: {
                                    type: "number",
                                    description: "第二个数字"
                                }
                            },
                            required: ["a", "b"]
                        }
                    },
                    {
                        name: "get_server_info",
                        description: "获取MCP服务器信息 - 测试用工具",
                        inputSchema: {
                            type: "object",
                            properties: {}
                        }
                    }
                ]
            });
            console.error("✅ 返回工具列表: 3个工具");
        }
        else if (msg.method === 'resources/list') {
            const resources = Object.entries(testResources).map(([uri, info]) => ({
                uri: uri,
                name: info.name,
                description: info.description,
                mimeType: info.mimeType
            }));
            sendResponse(msg.id, { resources: resources });
            console.error("✅ 返回资源列表: " + resources.length + " 个资源");
        }
        else if (msg.method === 'resources/read') {
            const uri = msg.params.uri;
            const resource = testResources[uri];
            if (resource) {
                sendResponse(msg.id, {
                    contents: [{
                        uri: uri,
                        mimeType: resource.mimeType,
                        text: resource.content
                    }]
                });
                console.error("✅ 返回资源内容: " + uri);
            } else {
                sendError(msg.id, -32602, "Resource not found: " + uri);
                console.error("❌ 资源未找到: " + uri);
            }
        }
        else if (msg.method === 'prompts/list') {
            const prompts = Object.entries(testPrompts).map(([name, info]) => ({
                name: info.name,
                description: info.description,
                arguments: info.arguments
            }));
            sendResponse(msg.id, { prompts: prompts });
            console.error("✅ 返回提示词列表: " + prompts.length + " 个提示词");
        }
        else if (msg.method === 'prompts/get') {
            const name = msg.params.name;
            const prompt = testPrompts[name];
            if (prompt) {
                const rendered = prompt.render(msg.params.arguments || {});
                sendResponse(msg.id, {
                    description: rendered.description,
                    messages: rendered.messages
                });
                console.error("✅ 返回提示词: " + name);
            } else {
                sendError(msg.id, -32602, "Prompt not found: " + name);
                console.error("❌ 提示词未找到: " + name);
            }
        }
        else if (msg.method === 'tools/call') {
            const toolName = msg.params.name;
            const args = msg.params.arguments || {};

            if (toolName === 'echo') {
                sendResponse(msg.id, {
                    content: [{
                        type: "text",
                        text: `Echo: ${args.message || '(空消息)'}`
                    }]
                });
                console.error("✅ 执行工具: echo");
            }
            else if (toolName === 'add') {
                const result = (parseInt(args.a) || 0) + (parseInt(args.b) || 0);
                sendResponse(msg.id, {
                    content: [{
                        type: "text",
                        text: `${args.a} + ${args.b} = ${result}`
                    }]
                });
                console.error("✅ 执行工具: add => " + result);
            }
            else if (toolName === 'get_server_info') {
                sendResponse(msg.id, {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            name: "Echo Test Server",
                            version: "1.0.0",
                            protocolVersion: "2024-11-05",
                            tools: 3,
                            resources: Object.keys(testResources).length,
                            prompts: Object.keys(testPrompts).length,
                            uptime: process.uptime().toFixed(2) + "s"
                        }, null, 2)
                    }]
                });
                console.error("✅ 执行工具: get_server_info");
            }
            else {
                sendError(msg.id, -32602, "Unknown tool: " + toolName);
                console.error("❌ 未知工具: " + toolName);
            }
        }
        else {
            sendError(msg.id, -32601, "Method not found: " + msg.method);
            console.error("❌ 未知方法: " + msg.method);
        }
    } catch (e) {
        console.error("解析错误:", e.message);
    }
});

rl.on('close', () => {
    console.error("MCP Echo Server 关闭");
    process.exit(0);
});
