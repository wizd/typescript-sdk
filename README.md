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
