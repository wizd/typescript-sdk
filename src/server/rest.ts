import { randomUUID } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  JSONRPCMessage,
  JSONRPCMessageSchema,
} from "@modelcontextprotocol/sdk/types.js";
import getRawBody from "raw-body";
import contentType from "content-type";
import express from "express";

const MAXIMUM_MESSAGE_SIZE = "4mb";

/**
 * Configuration options for RestServerTransport
 */
export interface RestServerTransportOptions {
  endpoint?: string;
  port?: string | number;
  supportTenantId?: boolean;
  apiKey?: string;
  apiKeyHeaderName?: string;
  bearerToken?: string;
}

/**
 * Server transport for Synchronous HTTP: a stateless implementation for direct HTTP responses.
 * It supports concurrent requests with no streaming, no SSE, and no persistent connections.
 *
 * Usage example:
 *
 * ```typescript
 * // Create basic synchronous transport
 * const transport = new RestServerTransport({ endpoint: '/rest', port: '9593' });
 * await server.connect(transport);
 * await transport.startServer();
 * 
 * // Transport with tenant ID support
 * const multitenantTransport = new RestServerTransport({ 
 *   endpoint: '/api', 
 *   port: 9593, 
 *   supportTenantId: true 
 * });
 * 
 * // Transport with API Key authentication
 * const secureTransport = new RestServerTransport({ 
 *   endpoint: '/secure', 
 *   port: 9593, 
 *   apiKey: 'your-secret-api-key',
 *   apiKeyHeaderName: 'X-API-Key' // Optional, defaults to 'X-API-Key'
 * });
 * 
 * // Transport with Bearer Token authentication
 * const secureTransport = new RestServerTransport({ 
 *   endpoint: '/secure', 
 *   port: 9593, 
 *   bearerToken: 'your-secret-bearer-token'
 * });
 * ```
 */
export class RestServerTransport implements Transport {
  private _started: boolean = false;
  private _endpoint: string;
  private _port: number;
  private _supportTenantId: boolean;
  private _apiKey?: string;
  private _apiKeyHeaderName: string;
  private _bearerToken?: string;
  private _server: ReturnType<typeof express> | null = null;
  private _httpServer: ReturnType<typeof express.application.listen> | null =
    null;
  private _pendingRequests: Map<
    string,
    {
      resolve: (responses: JSONRPCMessage[]) => void;
      responseMessages: JSONRPCMessage[];
      requestIds: string[];
    }
  > = new Map();

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: RestServerTransportOptions = {}) {
    this._endpoint = options.endpoint || "/rest";
    this._port = Number(options.port) || 9593;
    this._supportTenantId = options.supportTenantId || false;
    this._apiKey = options.apiKey;
    this._apiKeyHeaderName = options.apiKeyHeaderName || "X-API-Key";
    this._bearerToken = options.bearerToken;
  }

  /**
   * Start the HTTP server
   */
  async startServer(): Promise<void> {
    if (this._server) {
      throw new Error("Server is already running");
    }

    this._server = express();
    
    // 添加必要的中间件，确保能够正确解析headers
    this._server.use(express.json());
    
    if (this._supportTenantId) {
      // Add route with tenant ID
      this._server.post(`${this._endpoint}/:tenantId`, (req, res) => {
        const tenantId = req.params.tenantId;
        this.handleRequest(req, res, req.body, tenantId);
      });
    } else {
      // Keep original route
      this._server.post(this._endpoint, (req, res) => {
        this.handleRequest(req, res, req.body);
      });
    }

    return new Promise((resolve, reject) => {
      try {
        this._httpServer = this._server!.listen(this._port, () => {
          console.log(
            `Server is running on http://localhost:${this._port}${this._endpoint}`
          );
          resolve();
        });

        this._httpServer.on("error", (error) => {
          console.error("Server error:", error);
          this.onerror?.(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server
   */
  async stopServer(): Promise<void> {
    if (this._httpServer) {
      return new Promise((resolve, reject) => {
        this._httpServer!.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          this._server = null;
          this._httpServer = null;
          resolve();
        });
      });
    }
  }

  /**
   * Starts the transport. This is required by the Transport interface but is a no-op
   * for the Synchronous HTTP transport as connections are managed per-request.
   */
  async start(): Promise<void> {
    if (this._started) {
      throw new Error("Transport already started");
    }
    this._started = true;
  }

  /**
   * Handles an incoming HTTP request
   */
  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
    tenantId?: string
  ): Promise<void> {
    if (req.method === "POST") {
      await this.handlePostRequest(req, res, parsedBody, tenantId);
    } else {
      res.writeHead(405).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed",
          },
          id: null,
        })
      );
    }
  }

  /**
   * Validates API Key from the request header
   */
  private validateApiKey(req: IncomingMessage): boolean {
    // If no authentication is required, return true
    if (!this._apiKey && !this._bearerToken) {
      return true;
    }

    // 记录所有请求头信息，用于调试
    console.log("Request headers:", req.headers);

    // Check for Bearer token authentication (prioritized over API key)
    if (this._bearerToken) {
      const authHeader = req.headers.authorization;
      console.log("Authorization header:", authHeader);
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        console.log("Extracted token:", token.substring(0, 3) + "..." + (token.length > 6 ? token.substring(token.length - 3) : ""));
        return token === this._bearerToken;
      } else {
        console.log("Bearer token not found in Authorization header");
      }
    }

    // Fall back to API Key validation if not authenticated with Bearer token
    if (this._apiKey) {
      const providedApiKey = req.headers[this._apiKeyHeaderName.toLowerCase()];
      console.log(`API Key header (${this._apiKeyHeaderName}):`, providedApiKey ? "Present" : "Not present");
      return providedApiKey === this._apiKey;
    }

    console.log("Authentication failed: No valid credentials provided");
    return false;
  }

  /**
   * Handles POST requests containing JSON-RPC messages
   */
  private async handlePostRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
    tenantId?: string
  ): Promise<void> {
    try {
      // Validate API Key
      if (!this.validateApiKey(req)) {
        res.writeHead(401).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: "Unauthorized: Invalid authentication credentials",
            },
            id: null,
          })
        );
        return;
      }

      // validate the Accept header
      const acceptHeader = req.headers.accept;
      if (
        acceptHeader &&
        acceptHeader !== "*/*" &&
        !acceptHeader.includes("application/json")
      ) {
        res.writeHead(406).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Not Acceptable: Client must accept application/json",
            },
            id: null,
          })
        );
        return;
      }

      const ct = req.headers["content-type"];
      if (!ct || !ct.includes("application/json")) {
        res.writeHead(415).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message:
                "Unsupported Media Type: Content-Type must be application/json",
            },
            id: null,
          })
        );
        return;
      }

      let rawMessage;
      if (parsedBody !== undefined) {
        rawMessage = parsedBody;
      } else {
        const parsedCt = contentType.parse(ct);
        const body = await getRawBody(req, {
          limit: MAXIMUM_MESSAGE_SIZE,
          encoding: parsedCt.parameters.charset ?? "utf-8",
        });
        rawMessage = JSON.parse(body.toString());
      }

      let messages: JSONRPCMessage[];

      // handle batch and single messages
      if (Array.isArray(rawMessage)) {
        messages = rawMessage.map((msg) => JSONRPCMessageSchema.parse(msg));
      } else {
        messages = [JSONRPCMessageSchema.parse(rawMessage)];
      }

      // check if it contains requests
      const hasRequests = messages.some(
        (msg) => "method" in msg && "id" in msg
      );
      const hasOnlyNotifications = messages.every(
        (msg) => "method" in msg && !("id" in msg)
      );

      if (hasOnlyNotifications) {
        // if it only contains notifications, return 202
        res.writeHead(202).end();

        // handle each message
        for (const message of messages) {
          if (tenantId && "method" in message) {
            // Add tenant ID to each message
            const messageWithTenant = {
              ...message,
              params: {
                ...message.params,
                _tenantId: tenantId // Add tenant ID as implicit parameter
              }
            };
            this.onmessage?.(messageWithTenant);
          } else {
            this.onmessage?.(message);
          }
        }
      } else if (hasRequests) {
        // Create a unique identifier for this request batch
        const requestBatchId = randomUUID();

        // Extract the request IDs that we need to collect responses for
        const requestIds = messages
          .filter((msg) => "method" in msg && "id" in msg)
          .map((msg) => String(msg.id));

        // Set up a promise that will be resolved with all the responses
        const responsePromise = new Promise<JSONRPCMessage[]>((resolve) => {
          this._pendingRequests.set(requestBatchId, {
            resolve,
            responseMessages: [],
            requestIds,
          });
        });

        // Process all messages
        for (const message of messages) {
          if (tenantId && "method" in message) {
            // Add tenant ID to each message
            const messageWithTenant = {
              ...message,
              params: {
                ...message.params,
                _tenantId: tenantId // Add tenant ID as implicit parameter
              }
            };
            this.onmessage?.(messageWithTenant);
          } else {
            this.onmessage?.(message);
          }
        }

        // Wait for responses and send them
        const responses = await Promise.race([
          responsePromise,
          // 30 second timeout
          new Promise<JSONRPCMessage[]>((resolve) =>
            setTimeout(() => resolve([]), 30000)
          ),
        ]);

        // Clean up the pending request
        this._pendingRequests.delete(requestBatchId);

        // Set response headers
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        res.writeHead(200, headers);

        // Format the response according to JSON-RPC spec
        const responseBody = responses.length === 1 ? responses[0] : responses;
        res.end(JSON.stringify(responseBody));
      }
    } catch (error) {
      // return JSON-RPC formatted error
      res.writeHead(400).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: String(error),
          },
          id: null,
        })
      );
      this.onerror?.(error as Error);
    }
  }

  async close(): Promise<void> {
    await this.stopServer();
    // Clear any pending requests
    this._pendingRequests.clear();
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Only process response messages
    if (!("id" in message) || !("result" in message || "error" in message)) {
      return;
    }

    const messageId = String(message.id);

    // Find the pending request that is waiting for this response
    for (const [batchId, pendingRequest] of this._pendingRequests.entries()) {
      if (pendingRequest.requestIds.includes(messageId)) {
        // Add this response to the collection
        pendingRequest.responseMessages.push(message);

        // If we've collected all responses for this batch, resolve the promise
        if (
          pendingRequest.responseMessages.length ===
          pendingRequest.requestIds.length
        ) {
          pendingRequest.resolve(pendingRequest.responseMessages);
        }

        break;
      }
    }
  }

  /**
   * 注册自定义路由，可用于文件下载等扩展功能。
   * 必须在 startServer() 之前调用。
   * @param method HTTP方法，如 'get' | 'post' | 'put' | 'delete' | 'patch'
   * @param path 路由路径，如 '/download'
   * @param handler Express风格的处理函数 (req, res, next)
   */
  public registerRoute(
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    path: string,
    handler: import('express').RequestHandler
  ): void {
    // 如果还未初始化express实例，则先初始化（但不listen）
    if (!this._server) {
      this._server = express();
      // 保证和startServer一致，添加必要的中间件
      this._server.use(express.json());
    }
    // 注册自定义路由
    this._server[method](path, handler);
  }
}
