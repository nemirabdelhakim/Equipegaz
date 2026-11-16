import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDataRepository, getGoogleSyncService } from './backend/src/repositories/repositoryInstance.js';
import { createApiRouter } from './backend/src/routes/apiRoutes.js';

dotenv.config();
process.env.TZ = process.env.TZ || 'Africa/Algiers';

async function ensureDailyAutomaticBackup(): Promise<void> {
  try {
    const syncService = getGoogleSyncService();
    const backups = syncService.listBackups();
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const hasTodayBackup = backups.some((b) => b.createdAt.slice(0, 10) === todayPrefix);
    if (!hasTodayBackup) {
      const repo = getDataRepository();
      const chef = (await repo.listAgents()).find((a) => a.role === 'CHEF');
      if (chef) {
        await syncService.createBackup(chef, false);
      }
    }
  } catch (err) {
    console.warn('[Sauvegarde quotidienne]', err);
  }
}

async function startServer(): Promise<void> {
  const repo = getDataRepository();
  await repo.init();
  await ensureDailyAutomaticBackup();

  const app = express();
  app.disable('x-powered-by');
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '12mb' }));

  // En-têtes de sécurité renforcés
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // CORS pour l'application Android APK (Capacitor) et l'URL configurée
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = new Set<string>([
      'https://localhost',
      'http://localhost',
      'capacitor://localhost',
      'http://127.0.0.1:3000',
    ]);
    if (process.env.APP_URL) {
      allowedOrigins.add(process.env.APP_URL.replace(/\/+$/, ''));
    }
    if (origin && (allowedOrigins.has(origin) || origin.startsWith('http://localhost:'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Google-Access-Token'
      );
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Report-Number');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Routes API REST
  app.use('/api', createApiRouter());

  // Gestion d'erreurs API JSON sans fuite de pile d'exécution
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith('/api')) {
        console.error('[API Error]', err.message);
        res.status(500).json({
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Une erreur serveur est survenue.',
        });
        return;
      }
      next(err);
    }
  );

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProduction) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
      plugins: [
        {
          name: 'disable-hmr-client-ws',
          transform(code, id) {
            if (id.includes('vite/dist/client/client.mjs') || id.endsWith('/@vite/client')) {
              return code.replace(
                /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
                'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });'
              );
            }
          },
        },
      ],
    });
    app.use(vite.middlewares);
  }

  // Vérification sauvegarde quotidienne toutes les 12 heures
  setInterval(() => {
    void ensureDailyAutomaticBackup();
  }, 12 * 60 * 60 * 1000).unref();

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `[GESTION ÉQUIPE GAZ – SIDI ALI] Serveur actif sur http://0.0.0.0:${port} (TZ=${process.env.TZ})`
    );
  });
}

startServer().catch((err) => {
  console.error('Échec du démarrage serveur:', err);
  process.exit(1);
});
