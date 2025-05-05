# MCP Typescript SDK by ChatMCP

## 如何使用

1. 安装SDK

```shell
npm i @chatmcp/sdk
```

2. 配置MCP服务器

### 基本配置

```typescript
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

async function main() {
  const port = 9593;
  const endpoint = "/rest";

  const transport = new RestServerTransport({ port, endpoint });
  await server.connect(transport);

  await transport.startServer();
}
```

### 多租户支持

```typescript
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

async function main() {
  const port = 9593;
  const endpoint = "/api";

  // 启用多租户支持
  const transport = new RestServerTransport({ 
    port, 
    endpoint,
    supportTenantId: true  // 启用多租户支持
  });
  
  await server.connect(transport);
  await transport.startServer();
  
  // 现在可以通过 /api/{tenantId} 访问，如 /api/tenant1, /api/tenant2
}
```

### API认证支持

```typescript
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

async function main() {
  const port = 9593;
  const endpoint = "/secure";

  // 启用API Key认证
  const transport = new RestServerTransport({ 
    port, 
    endpoint,
    apiKey: "your-secret-api-key",                // 设置API密钥
    apiKeyHeaderName: "X-API-Key"                 // 可选，默认为"X-API-Key"
    // 也可以使用标准的Authorization头
    // apiKeyHeaderName: "Authorization"
  });
  
  await server.connect(transport);
  await transport.startServer();
}
```

3. 请求API

### 基本请求

```curl
curl -X POST http://127.0.0.1:9593/rest \
-H "Content-Type: application/json" \
-d '{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "initialize",
  "params": {
    "protocolVersion": "1.0",
    "capabilities": {},
    "clientInfo": {
      "name": "your_client_name",
      "version": "your_version"
    }
  }
}'
```

### 多租户请求

```curl
curl -X POST http://127.0.0.1:9593/api/tenant1 \
-H "Content-Type: application/json" \
-d '{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "initialize",
  "params": {
    "protocolVersion": "1.0",
    "capabilities": {},
    "clientInfo": {
      "name": "your_client_name",
      "version": "your_version"
    }
  }
}'
```

### 带API认证的请求

```curl
curl -X POST http://127.0.0.1:9593/secure \
-H "Content-Type: application/json" \
-H "X-API-Key: your-secret-api-key" \
-d '{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "initialize",
  "params": {
    "protocolVersion": "1.0",
    "capabilities": {},
    "clientInfo": {
      "name": "your_client_name",
      "version": "your_version"
    }
  }
}'
```

### 使用Authorization头的API认证请求

```curl
curl -X POST http://127.0.0.1:9593/secure \
-H "Content-Type: application/json" \
-H "Authorization: Bearer your-secret-api-key" \
-d '{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "initialize",
  "params": {
    "protocolVersion": "1.0",
    "capabilities": {},
    "clientInfo": {
      "name": "your_client_name",
      "version": "your_version"
    }
  }
}'
```

### 在请求处理程序中获取租户ID

当您启用多租户支持（`supportTenantId: true`）时，租户ID会作为特殊参数`_tenantId`添加到每个请求的`params`对象中。下面是一个示例，展示如何在请求处理程序中获取租户ID：

```typescript
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

async function main() {
  // 创建支持多租户的传输
  const transport = new RestServerTransport({ 
    port: 9593, 
    endpoint: "/api",
    supportTenantId: true
  });
  
  await server.connect(transport);
  
  // 设置请求处理程序
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    // 获取租户ID
    const tenantId = request.params._tenantId;
    console.log(`处理来自租户 ${tenantId} 的请求`);
    
    // 可以根据租户ID返回不同的工具列表
    return {
      tools: tenantId === "admin" ? ADMIN_TOOLS : REGULAR_TOOLS
    };
  });
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // 获取租户ID
    const tenantId = request.params._tenantId;
    
    // 使用租户ID进行权限检查或租户隔离
    if (!hasPermission(tenantId, request.params.name)) {
      throw new Error(`租户 ${tenantId} 无权访问工具 ${request.params.name}`);
    }
    
    // 将租户ID传递给工具执行函数，以支持租户隔离
    return await executeToolAndHandleErrors(
      request.params.name,
      {
        ...request.params.arguments || {},
        _tenantId: tenantId  // 传递租户ID到工具执行上下文
      },
      taskManager
    );
  });
  
  await transport.startServer();
}

// 示例权限检查函数
function hasPermission(tenantId: string, toolName: string): boolean {
  // 实现您的权限检查逻辑
  return true;
}
```

通过这种方式，您可以在请求处理程序中获取租户ID，并用它来实现：

1. 租户隔离 - 确保每个租户只能访问其自己的数据
2. 租户特定的配置 - 为不同租户提供不同的工具或功能
3. 多租户认证和授权 - 结合API密钥实现更细粒度的访问控制
4. 审计日志 - 记录每个租户的访问和操作
