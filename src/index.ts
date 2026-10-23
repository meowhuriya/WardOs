import cookieParser from 'cookie-parser';
import cors from 'cors';
import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { verifySessionToken } from './auth.js';
import { config } from './config.js';
import { RequestContext, runWithContext } from './context.js';
import { createWardMcpServer } from './mcp/server.js';
import authRoutes, { isSessionLocked } from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import healthRoutes from './routes/health.js';
import wardRoutes from './routes/ward.js';
import { loadStaff } from './auth.js';
import { loadWardData } from './store.js';

const app = express();

// Ensure synthetic data and staff exist
loadStaff();
loadWardData();

// Security Hardening: Helmet with Content Security Policy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null, // Allow HTTP for local testing
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS restricted to app's own origin
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        const corsErr = new Error(`CORS blocked for origin: ${origin}`);
        (corsErr as any).status = 403;
        callback(corsErr);
      }
    },
    credentials: true,
  })
);

// Standard body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Sanitized Server Request Logging: NEVER log patient names, notes, or PINs!
app.use((req, res, next) => {
  const start = Date.now();
  const safePath = req.path;
  const method = req.method;

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Only log metadata: method, path, status, duration - NEVER body contents or headers
    if (safePath !== '/api/health') {
      console.log(`[HTTP] ${method} ${safePath} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Setup MCP Server and Streamable HTTP Transport
const mcpServer = createWardMcpServer();
const mcpTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});

let isMcpConnected = false;
export async function ensureMcpConnected() {
  if (!isMcpConnected) {
    await mcpServer.connect(mcpTransport);
    isMcpConnected = true;
  }
}
ensureMcpConnected().catch(err => console.error('Failed to connect MCP server:', err));

// MCP Rate Limiting
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 120 calls per minute
  message: { error: 'Rate limit exceeded for MCP endpoint' },
  standardHeaders: true,
  legacyHeaders: false,
});

// MCP Endpoint with Bearer Token and Origin validation
app.all('/mcp', mcpLimiter, async (req, res) => {
  // 1. Origin header validation for DNS rebinding protection
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) {
    res.status(403).json({ error: `Forbidden: Disallowed Origin header '${origin}'` });
    return;
  }

  // 2. Bearer token validation
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Bearer token required for /mcp endpoint' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired Bearer token' });
    return;
  }

  // 3. Check if session is locked
  if (isSessionLocked(session.staff_id)) {
    res.status(423).json({ error: 'Session is locked. Please unlock with your PIN.' });
    return;
  }

  // 4. Attach request context and execute MCP request
  await ensureMcpConnected();
  const context: RequestContext = {
    staffId: session.staff_id,
    staffName: session.name,
    role: session.role,
    lastStepUpAt: session.lastStepUpAt,
  };

  await runWithContext(context, async () => {
    await mcpTransport.handleRequest(req, res, req.body);
  });
});

// Application API routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ward', wardRoutes);
app.use('/api/health', healthRoutes);

// Serve static frontend
app.use(express.static(config.paths.publicDir));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(config.paths.publicDir, 'index.html'));
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

// Start listening bound to configured host (default 127.0.0.1)
const server = app.listen(config.port, config.host, () => {
  console.log(`=======================================================`);
  console.log(` WardOS Server active at http://${config.host}:${config.port}`);
  console.log(` Streamable HTTP MCP Endpoint: http://${config.host}:${config.port}/mcp`);
  console.log(` Spec: MCP 2025-11-25 | Bedrock Mode: ${config.bedrock.enabled ? 'ENABLED' : 'DISABLED (Mode B active)'}`);
  console.log(` Fictional synthetic patient data initialized`);
  console.log(`=======================================================`);
});

export { app, server };
