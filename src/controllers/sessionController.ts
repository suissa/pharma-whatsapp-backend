import { Router, Request, Response } from 'express';
import { SessionManager } from '../services/SessionManager';
import { QRCodeManager } from '../services/QRCodeManager';
import { validateBody, validateParams } from '../middleware/validation';
import { sessionSchemas } from '../validators/schemas';
import Joi from 'joi';
import { RateLimiter } from '../utils/RateLimiter';
import { CircuitBreakerService } from '../services/CircuitBreakerService';
import logger from '../utils/Logger';

export function createSessionRoutes(sessionManager: SessionManager): Router {
  const router = Router();
  const qrCodeManager = QRCodeManager.getInstance(sessionManager);
  
 router.get('/ai/stats', async (req: Request, res: Response) => {
    try {
      const aiStats = sessionManager.getAIStats();
      
      res.json({
        success: true,
        aiStats
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas da IA:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas da IA',
        error: error.message
      });
    }
  });

  router.post('/ai/test-connection', async (req: Request, res: Response) => {
    try {
      const result = await sessionManager.testAIConnection();
      
      res.json({
        success: result.success,
        message: result.success ? 'Conexão com IA testada com sucesso' : 'Falha na conexão com IA',
        error: result.error
      });
    } catch (error) {
      logger.error('Erro ao testar conexão com IA:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao testar conexão com IA',
        error: error.message
      });
    }
  });

  router.post('/ai/config', 
    validateBody(Joi.object({
      model: Joi.string().optional(),
      maxTokens: Joi.number().min(1).max(4000).optional(),
      temperature: Joi.number().min(0).max(2).optional(),
      systemPrompt: Joi.string().max(4000).optional()
    })),
    async (req: Request, res: Response) => {
      try {
        const config = req.body;
        sessionManager.updateAIConfiguration(config);
        
        res.json({
          success: true,
          message: 'Configuração da IA atualizada com sucesso',
          config
        });
      } catch (error) {
        logger.error('Erro ao atualizar configuração da IA:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao atualizar configuração da IA',
          error: error.message
        });
      }
    }
  );

  router.get('/ai/keywords', async (req: Request, res: Response) => {
    try {
      const keywords = sessionManager.getAIKeywords();
      
      res.json({
        success: true,
        keywords,
        total: keywords.length
      });
    } catch (error) {
      logger.error('Erro ao listar palavras-chave:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar palavras-chave',
        error: error.message
      });
    }
  });

  router.post('/ai/keywords/add', 
    validateBody(Joi.object({
      keyword: Joi.string().required().min(2).max(50)
    })),
    async (req: Request, res: Response) => {
      try {
        const { keyword } = req.body;
        sessionManager.addAIKeyword(keyword);
        
        res.json({
          success: true,
          message: `Palavra-chave "${keyword}" adicionada com sucesso`,
          keywords: sessionManager.getAIKeywords()
        });
      } catch (error) {
        logger.error('Erro ao adicionar palavra-chave:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao adicionar palavra-chave',
          error: error.message
        });
      }
    }
  );

  // ✅ NOVO: Remover palavra-chave da IA
  router.post('/ai/keywords/remove', 
    validateBody(Joi.object({
      keyword: Joi.string().required().min(2).max(50)
    })),
    async (req: Request, res: Response) => {
      try {
        const { keyword } = req.body;
        sessionManager.removeAIKeyword(keyword);
        
        res.json({
          success: true,
          message: `Palavra-chave "${keyword}" removida com sucesso`,
          keywords: sessionManager.getAIKeywords()
        });
      } catch (error) {
        logger.error('Erro ao remover palavra-chave:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao remover palavra-chave',
          error: error.message
        });
      }
    }
  );

  // ✅ NOVO: Obter estatísticas de retry das sessões (DEVE vir ANTES das rotas com parâmetros)
  router.get('/retry-stats', async (req: Request, res: Response) => {
    try {
      const retryStats = sessionManager.getSessionRetryStats();
      
      res.json({
        success: true,
        retryStats,
        totalSessionsWithRetries: Object.keys(retryStats).length
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas de retry:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas de retry',
        error: error.message
      });
    }
  });

  // Listar todas as sessões
  router.get('/', (req: Request, res: Response) => {
    try {
      const sessions = sessionManager.getAllSessions();
      logger.info("sessions", sessions);
      
      res.json({
        success: true,
        sessions,
        total: sessions.length
      });
    } catch (error) {
      logger.error('Erro ao listar sessões:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar sessões',
        error: error.message
      });
    }
  });

  // ✅ VALIDADO: Criar nova instância
  router.post('/create', 
    validateBody(sessionSchemas.createSession),
    async (req: Request, res: Response) => {
      try {
        const { instanceId } = req.body;

        // Verificar se a instância já existe
        if (sessionManager.getSession(instanceId)) {
          return res.status(400).json({
            success: false,
            message: `Instância '${instanceId}' já existe`
          });
        }

        logger.info(`🔄 Criando nova instância: ${instanceId}`);
        
        // Atualizar status para "creating"
        sessionManager.getAllSessions().push({
          sessionId: instanceId,
          status: 'connecting',
          user: null
        });

        // Criar instância (async)
        sessionManager.createSession(instanceId).catch(error => {
          logger.error(`🔴 Erro ao criar instância ${instanceId}:`, error);
            sessionManager.getAllSessions().push({
            sessionId: instanceId,
              status: 'disconnected',
              user: null
          });
        });

        res.status(201).json({
          success: true,
          message: `Instância '${instanceId}' está sendo criada. Aguarde o QR Code.`,
          data: { instanceId }
        });
      } catch (error) {
        logger.error('🔴 Erro ao criar instância:', error);
        res.status(500).json({
          success: false,
          message: 'Erro interno do servidor',
          error: error.message
        });
      }
    }
  );

  // ✅ VALIDADO: Reconectar uma sessão específica
  router.post('/:sessionId/reconnect', 
    validateParams(sessionSchemas.sessionId),
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        logger.info(`🔄 Reconectando sessão: ${sessionId}`);
        
        await sessionManager.createSession(sessionId);
        
        res.json({
          success: true,
          message: `Reconexão da sessão ${sessionId} iniciada`,
          sessionId
        });
      } catch (error) {
        logger.error('Erro ao reconectar sessão:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao reconectar sessão',
          error: error.message
        });
      }
    }
  );

  // ✅ VALIDADO: Enviar mensagem através de uma sessão
  router.post('/:sessionId/send', 
    validateParams(sessionSchemas.sessionId),
    validateBody(sessionSchemas.sendMessage),
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { to, message, type } = req.body;

        const result = await sessionManager.sendMessage(sessionId, to, message);

        res.json({
          success: true,
          message: 'Mensagem enviada com sucesso',
          result
        });
      } catch (error) {
        logger.error('Erro ao enviar mensagem:', error);
        
        if (error.message === 'Sessão não encontrada ou não conectada') {
          res.status(404).json({
            success: false,
            message: error.message
          });
        } else if (error.message.includes('Formato de telefone inválido')) {
          res.status(400).json({
            success: false,
            message: 'Erro de validação',
            errors: [error.message]
          });
        } else {
          res.status(500).json({
            success: false,
            message: 'Erro ao enviar mensagem',
            error: error.message
          });
        }
      }
    }
  );

  // QR Code como texto (SEM VALIDAÇÃO - estado original)
  router.get('/:id/qrcode', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      logger.info(`🔍 Buscando QR Code texto para sessão: ${id}`);
      const result = await qrCodeManager.getQRCodeText(id);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      logger.error('🔴 Erro ao obter QR Code:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  });

  // QR Code como imagem base64 (SEM VALIDAÇÃO - estado original)
  router.get('/:id/qrcode/image', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      logger.info(`🔍 Buscando QR Code imagem para sessão: ${id}`);
      const result = await qrCodeManager.getQRCodeImage(id);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      logger.error('🔴 Erro ao obter QR Code imagem:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  });

  // QR Code como SVG (SEM VALIDAÇÃO - estado original)
  router.get('/:id/qrcode/svg', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      logger.info(`🔍 Buscando QR Code SVG para sessão: ${id}`);
      const result = await qrCodeManager.getQRCodeSVG(id);
      
      if (result.success) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(result.qrCodeSVG);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      logger.error('🔴 Erro ao gerar QR Code como SVG:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar SVG do QR Code'
      });
    }
  });

  // ✅ NOVO: Forçar limpeza de sessão problemática
  router.post('/:sessionId/force-cleanup', 
    validateParams(sessionSchemas.forceCleanup),
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        logger.info(`🧹 Forçando limpeza da sessão: ${sessionId}`);
        
        await sessionManager.forceCleanupSession(sessionId);
        
        res.json({
          success: true,
          message: `Limpeza forçada da sessão ${sessionId} iniciada`,
          sessionId
        });
      } catch (error) {
        logger.error('Erro ao forçar limpeza da sessão:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao forçar limpeza da sessão',
          error: error.message
        });
      }
    }
  );

  // ✅ NOVO: Resetar contador de retry de uma sessão
  router.post('/:sessionId/reset-retry', 
    validateParams(sessionSchemas.resetRetry),
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        logger.info(` Resetando contador de retry da sessão: ${sessionId}`);
        
        sessionManager.resetSessionRetryCount(sessionId);
        
        res.json({
          success: true,
          message: `Contador de retry resetado para sessão ${sessionId}`,
          sessionId
        });
      } catch (error) {
        logger.error('Erro ao resetar contador de retry:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao resetar contador de retry',
          error: error.message
        });
      }
    }
  );

  // ✅ NOVO: Obter informações de uma sessão específica
  router.get('/:sessionId', 
    validateParams(sessionSchemas.sessionId),
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        logger.info(`🔍 Obtendo informações da sessão: ${sessionId}`);
        
        const socket = sessionManager.getSession(sessionId);
        
        if (!socket) {
          return res.status(404).json({
            success: false,
            message: 'Sessão não encontrada'
          });
        }

        res.json({
          success: true,
          session: {
            sessionId,
            status: socket.user ? 'connected' : 'connecting',
            user: socket.user || null,
            connectionState: socket.user ? 'OPEN' : 'CONNECTING'
          }
        });
      } catch (error) {
        logger.error('Erro ao obter informações da sessão:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao obter informações da sessão',
          error: error.message
        });
      }
    }
  );

  // ✅ NOVO: Obter estatísticas do rate limiter
  router.get('/rate-limit/stats', async (req: Request, res: Response) => {
    try {
      const stats = sessionManager.getRateLimitStats();
      
      res.json({
        success: true,
        rateLimitStats: stats
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas do rate limiter:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas do rate limiter',
        error: error.message
      });
    }
  });

  // ✅ NOVO: Resetar rate limiter para um destinatário
  router.post('/rate-limit/reset', 
    validateBody(Joi.object({
      sessionId: Joi.string().required(),
      recipient: Joi.string().required()
    })),
    async (req: Request, res: Response) => {
      try {
        const { sessionId, recipient } = req.body;
        sessionManager.resetRateLimit(sessionId, recipient);
        
        res.json({
          success: true,
          message: `Rate limit resetado para ${sessionId}:${recipient}`
        });
      } catch (error) {
        logger.error('Erro ao resetar rate limit:', error);
        res.status(500).json({
          success: false,
          message: 'Erro ao resetar rate limit',
          error: error.message
        });
      }
    }
  );

  // ✅ NOVO: Resetar todo o rate limiter
  router.post('/rate-limit/reset-all', async (req: Request, res: Response) => {
    try {
      const rateLimiter = RateLimiter.getInstance();
      rateLimiter.reset();
      
      res.json({
        success: true,
        message: 'Rate limiter completamente resetado'
      });
    } catch (error) {
      logger.error('Erro ao resetar rate limiter:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao resetar rate limiter',
        error: error.message
      });
    }
  });

  // ✅ NOVO: Obter configuração do rate limiter
  router.get('/rate-limit/config', async (req: Request, res: Response) => {
    try {
      const rateLimiter = RateLimiter.getInstance();
      const config = rateLimiter.getConfig();
      
      res.json({
        success: true,
        config,
        environment: {
          RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW,
          MAX_MESSAGES_PER_WINDOW: process.env.MAX_MESSAGES_PER_WINDOW
        }
      });
    } catch (error) {
      logger.error('Erro ao obter configuração do rate limiter:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter configuração do rate limiter',
        error: error.message
      });
    }
  });

  // ✅ NOVO: Obter estatísticas dos Circuit Breakers
  router.get('/circuit-breakers/stats', async (req: Request, res: Response) => {
    try {
      const stats = CircuitBreakerService.getAllStats();
      
      res.json({
        success: true,
        circuitBreakers: stats,
        totalServices: Object.keys(stats).length
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas dos circuit breakers:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  });

  // ✅ NOVO: Resetar Circuit Breaker específico
  router.post('/circuit-breakers/:serviceName/reset', async (req: Request, res: Response) => {
    try {
      const { serviceName } = req.params;
      const circuitBreaker = CircuitBreakerService.getInstance(serviceName);
      circuitBreaker.forceReset();
      
      res.json({
        success: true,
        message: `Circuit breaker ${serviceName} resetado com sucesso`
      });
    } catch (error) {
      logger.error('Erro ao resetar circuit breaker:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  });

  return router;
} 