import { Router, Request, Response } from 'express';
import { SessionManager } from '../services/SessionManager';
import logger from '../utils/Logger';

export function createHealthRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  // Health check básico
  router.get('/', (req: Request, res: Response) => {
    try {
      const activeSessions = sessionManager.getActiveSessionsCount();
      const sessionIds = sessionManager.getActiveSessionIds();
      
      res.json({
        success: true,
        message: 'API funcionando',
        timestamp: new Date().toISOString(),
        status: 'healthy',
        activeSessions,
        sessionIds,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.3'
      });
    } catch (error) {
      logger.error('Erro no health check:', error);
      res.status(500).json({
        success: false,
        message: 'Erro no health check',
        timestamp: new Date().toISOString(),
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  // Health check detalhado
  router.get('/detailed', (req: Request, res: Response) => {
    try {
      const sessions = sessionManager.getAllSessions();
      const activeSessions = sessionManager.getActiveSessionsCount();
      
      res.json({
        success: true,
        message: 'API funcionando - informações detalhadas',
        timestamp: new Date().toISOString(),
        status: 'healthy',
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid
        },
        sessions: {
          total: activeSessions,
          details: sessions
        },
        features: [
          'sessions',
          'file-auth',
          'auto-reconnect',
          'message-store',
          'cors-enabled'
        ]
      });
    } catch (error) {
      logger.error('Erro no health check detalhado:', error);
      res.status(500).json({
        success: false,
        message: 'Erro no health check detalhado',
        timestamp: new Date().toISOString(),
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  return router;
} 