# MCP Typescript SDK by ChatMCP

## How to Use

1. Install SDK

```shell
npm i @chatmcp/sdk
```

2. Configure MCP Server

### Basic Configuration

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

### Multi-tenant Support

```typescript
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

async function main() {
  const port = 9593;
  const endpoint = "/api";

  // Enable multi-tenant support
  const transport = new RestServerTransport({ 
    port, 
    endpoint,
    supportTenantId: true  // Enable multi-tenant support
  });
  
  await server.connect(transport);
  await transport.startServer();
  
  // Now accessible via /api/{tenantId}, such as /api/tenant1, /api/tenant2
}
```

### API Authentication Support

```typescript
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

async function main() {
  const port = 9593;
  const endpoint = "/secure";

  // Enable API Key authentication
  const transport = new RestServerTransport({ 
    port, 
    endpoint,
    apiKey: "your-secret-api-key",                // Set API key
    apiKeyHeaderName: "X-API-Key"                 // Optional, defaults to "X-API-Key"
  });
  
  // OR use standard Bearer Token authentication (recommended)
  const bearerTransport = new RestServerTransport({ 
    port, 
    endpoint: "/secure-bearer",
    bearerToken: "your-secret-bearer-token"       // Set Bearer token value
  });
  
  await server.connect(transport);
  await transport.startServer();
  
  // Or if using Bearer token
  // await server.connect(bearerTransport);
  // await bearerTransport.startServer();
}
```

3. API Requests

### Basic Request

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

### Multi-tenant Request

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

### Request with API Authentication

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

### Request with API Authentication Using Authorization Header

```curl
curl -X POST http://127.0.0.1:9593/secure \
-H "Content-Type: application/json" \
-H "Authorization: Bearer your-secret-bearer-token" \
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

### Accessing Tenant ID in Request Handlers

When you enable multi-tenant support (`supportTenantId: true`), the tenant ID is added to each request's `params` object as a special parameter `_tenantId`. Here's an example showing how to access the tenant ID in request handlers:

```typescript
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";

async function main() {
  // Create transport with multi-tenant support
  const transport = new RestServerTransport({ 
    port: 9593, 
    endpoint: "/api",
    supportTenantId: true
  });
  
  await server.connect(transport);
  
  // Set up request handlers
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    // Get tenant ID
    const tenantId = request.params._tenantId;
    console.log(`Processing request from tenant ${tenantId}`);
    
    // Return different tool lists based on tenant ID
    return {
      tools: tenantId === "admin" ? ADMIN_TOOLS : REGULAR_TOOLS
    };
  });
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Get tenant ID
    const tenantId = request.params._tenantId;
    
    // Use tenant ID for permission checks or tenant isolation
    if (!hasPermission(tenantId, request.params.name)) {
      throw new Error(`Tenant ${tenantId} does not have permission to access tool ${request.params.name}`);
    }
    
    // Pass tenant ID to tool execution function for tenant isolation
    return await executeToolAndHandleErrors(
      request.params.name,
      {
        ...request.params.arguments || {},
        _tenantId: tenantId  // Pass tenant ID to tool execution context
      },
      taskManager
    );
  });
  
  await transport.startServer();
}

// Example permission check function
function hasPermission(tenantId: string, toolName: string): boolean {
  // Implement your permission check logic
  return true;
}
```

Using this approach, you can access the tenant ID in request handlers to implement:

1. Tenant Isolation - Ensure each tenant can only access their own data
2. Tenant-specific Configuration - Provide different tools or features for different tenants
3. Multi-tenant Authentication and Authorization - Combine with API keys for more granular access control
4. Audit Logging - Record access and operations for each tenant
