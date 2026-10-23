# Product Feedback: WardOS Development

Honest reflections, developer experience evaluation, and concrete suggestions based on building WardOS end-to-end.

---

## 1. MCP SDK (`@modelcontextprotocol/sdk` v1.32.1)

### What I Used It For
- Built the core WardOS MCP server using `McpServer` and registered 15 administrative clinical tools with `zod` input schemas.
- Implemented the Streamable HTTP transport (`StreamableHTTPServerTransport`) on `/mcp` adhering to the MCP 2025-11-25 specification.
- Built an MCP client (`Client` + `StreamableHTTPClientTransport`) for automated end-to-end testing of every tool over HTTP.

### What Worked Well
- **Zod Schema Integration**: Registering tools with `server.tool(name, description, zodSchema, handler)` is clean, type-safe, and self-documenting.
- **Streamable HTTP Transport**: Modern HTTP transport eliminates the long-standing reconnection and buffering headaches associated with legacy Server-Sent Events (SSE).
- **Built-in Security Hooks**: Headers validation and DNS rebinding protections (`_enableDnsRebindingProtection`, `allowedHosts`, `allowedOrigins`) are thoughtfully implemented directly inside `WebStandardStreamableHTTPServerTransport`.

### What Was Hard
- **Stateless vs Session Transport Distinction**: Without a `sessionIdGenerator` callback, `StreamableHTTPServerTransport` throws if a transport is reused across sequential requests. Clearer error messaging in SDK docs on when to instantiate per-session transports versus sharing a stateful transport would save time.
- **Body Parsing Coupling in Express**: If Express's `express.json()` middleware parses the incoming request body, developers must know to pass `req.body` into `transport.handleRequest(req, res, req.body)`. Providing a native Express middleware helper like `mcpExpressMiddleware(mcpServer)` would be a welcome DX improvement.

### Concrete Suggestions
1. Export a first-class `createExpressMcpMiddleware({ server, path, authValidator })` from the SDK.
2. Provide pre-built TypeScript definitions for context forwarding (e.g. passing authenticated user identity into tool callbacks).

---

## 2. MCP Inspector

### What I Used It For
- Testing tool schema discoverability, validating JSON-RPC response formats, and verifying tool parameters.

### What Worked Well
- Interactive UI allowed rapid sanity checking of tool names, schemas, and descriptions.
- Testing schema edge cases (e.g., verifying that missing fields were rejected by Zod before reaching the handler).

### What Was Hard
- Connecting to Streamable HTTP endpoints that require Bearer tokens or specific Origin headers was non-trivial in default inspector CLI options.

### Concrete Suggestions
1. Add explicit CLI flags for custom authorization headers: `mcp-inspector --url http://127.0.0.1:3000/mcp --header "Authorization: Bearer <token>"`.

---

## 3. Amazon Bedrock (`@aws-sdk/client-bedrock-runtime`)

### What I Used It For
- Mode A natural language understanding: parsing multi-turn spoken clinician utterances into structured MCP tool parameters using Anthropic Claude models on AWS Bedrock.

### What Worked Well
- **Low Latency on Claude 3 Haiku**: `anthropic.claude-3-haiku-20240307-v1:0` returned parsed intent in under 400ms, suitable for near-real-time voice flows.
- **Strict Guardrail Compliance**: When supplied with negative constraints ("NEVER provide medical advice; NEVER infer unstated details"), the model complied reliably without hallucinations.

### What Was Hard
- Setting up IAM policies and handling credential expiry during local development without breaking offline workflows.
- Handling silent fallback when AWS credentials are not configured.

### Concrete Suggestions
1. Offer pre-packaged healthcare administrative prompt templates in AWS Bedrock Samples with built-in refusal hooks.

---

## 4. Google Antigravity

### What I Used It For
- Orchestrating the end-to-end full-stack architecture, writing TypeScript server code, designing the Echo Show UI, developing test suites, and verifying security controls.

### What Worked Well
- **Multi-Phase Execution**: Ability to break down the task into systematic phases (MCP tools, language testing, security hardening, web app, documentation) and self-correct across phases.
- **Strict Sandbox Management**: Cleanly differentiating between sandboxed commands and unsandboxed network/socket commands.
- **Deep Code Inspection**: Ability to inspect `node_modules` source directly to verify SDK internal APIs and avoid deprecated patterns.

### Concrete Suggestions
1. Enable native localhost socket binding in standard sandbox mode for in-process test runners so unit tests don't require external sandbox elevation.
