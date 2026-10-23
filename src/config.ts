import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('WARNING: SESSION_SECRET is not set in environment. Using default hackathon secret.');
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  sessionSecret: sessionSecret || 'wardos_hackathon_demo_secret_2026_change_in_production',
  allowedOrigins: (process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:3000,http://localhost:3000')
    .split(',')
    .map(o => o.trim()),
  bedrock: {
    enabled: process.env.BEDROCK_ENABLED === 'true',
    region: process.env.AWS_REGION || 'us-east-1',
    modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0',
  },
  paths: {
    root: projectRoot,
    dataDir: path.resolve(projectRoot, 'data'),
    wardDataFile: path.resolve(projectRoot, 'data', 'ward.json'),
    staffDataFile: path.resolve(projectRoot, 'data', 'staff.json'),
    publicDir: path.resolve(projectRoot, 'public'),
  },
};
