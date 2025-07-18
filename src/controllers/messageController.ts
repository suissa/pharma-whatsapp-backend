import { Router, Request, Response } from 'express';
import { SessionManager } from '../services/SessionManager';
import { UnifiedProducer, SendMessageCommand } from '../services/UnifiedProducer';
import { MessageValidator } from '../middleware/MessageValidator';
import { 
  SendMessageRequest, 
  SendMessageResponse, 
  QueueMessage 
} from '../utils/QueueMessage';
import logger from '../utils/Logger';

export function createMessageRoutes(sessionManager: SessionManager): Router {
  const router = Router();
  
  // Usar o UnifiedProducer
  const producer = UnifiedProducer.getInstance();

  // Endpoint para envio de mensagens para filas RabbitMQ
  router.post('/send', async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      logger.info('📨 Recebendo requisição de envio de mensagem:', req.body);
      
      // Validar requisição
      const validation = MessageValidator.validateSendRequest(req.body as SendMessageRequest);
      
      if (!validation.isValid) {
        logger.info('🔴 Validação falhou:', validation.errors);
        return res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors: validation.errors,
          timestamp: new Date().toISOString()
        });
      }

      const { queue, message } = req.body as SendMessageRequest;
      
      // Normalizar mensagem
      const normalizedMessage = MessageValidator.normalizeMessage(message);
      
      // Gerar ID se não fornecido
      if (!normalizedMessage.id) {
        normalizedMessage.id = MessageValidator.generateMessageId();
      }

      logger.info(`📤 Enviando mensagem ${normalizedMessage.id} para fila ${queue}`);

      // Conectar producer
      await producer.connect();

      // Enviar diretamente para a fila especificada
      const sent = await producer.sendToQueue(queue, normalizedMessage);
      const processingTime = Date.now() - startTime;
      if (sent) {
        const response: SendMessageResponse = {
          success: true,
          messageId: normalizedMessage.id,
          queueName: queue,
          timestamp: new Date().toISOString(),
          retryAttempt: 0,
          processingTime
        };
        logger.info(`✅ Mensagem enviada para fila ${queue} em ${processingTime}ms`);
        res.status(200).json(response);
      } else {
        logger.info(`🔴 Falha ao enviar mensagem para fila ${queue}`);
        res.status(500).json({
          success: false,
          message: `Falha ao enviar mensagem para fila ${queue}`,
          messageId: normalizedMessage.id,
          timestamp: new Date().toISOString(),
          retryAttempt: 0,
          processingTime
        });
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('🔴 Erro no endpoint de envio:', error);
      
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message,
        timestamp: new Date().toISOString(),
        processingTime
      });
    }
  });

  // Endpoint para verificar status de uma fila
  router.get('/queue/:queueName/status', async (req: Request, res: Response) => {
    try {
      const { queueName } = req.params;
      
      logger.info(`📊 Verificando status da fila: ${queueName}`);
      
      // Validar nome da fila
      const validation = MessageValidator.validateQueueName(queueName);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Nome de fila inválido',
          errors: validation.errors,
          timestamp: new Date().toISOString()
        });
      }

      // A lógica de status agora deve ser gerenciada pelo MessageConsumer
      // ou por outro mecanismo de monitoramento da fila.
      // Por enquanto, retornamos um status genérico.
      res.json({
        success: true,
        queueName,
        status: 'Status da fila não disponível via esta rota',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`🔴 Erro ao verificar status da fila ${req.params.queueName}:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Erro ao verificar status da fila',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Endpoint para listar todas as filas
  router.get('/queues', async (req: Request, res: Response) => {
    try {
      logger.info('📋 Listando filas do sistema');
      
      // A lógica de listar filas agora deve ser gerenciada pelo MessageConsumer
      // ou por outro mecanismo de monitoramento da fila.
      // Por enquanto, retornamos um status genérico.
      res.json({
        success: true,
        message: 'Listar filas não disponível via esta rota',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('🔴 Erro ao listar filas:', error);
      
      res.status(500).json({
        success: false,
        message: 'Erro ao listar filas',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Endpoint para purgar uma fila
  router.delete('/queue/:queueName/purge', async (req: Request, res: Response) => {
    try {
      const { queueName } = req.params;
      
      logger.info(`🧹 Purgando fila: ${queueName}`);
      
      // Validar nome da fila
      const validation = MessageValidator.validateQueueName(queueName);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Nome de fila inválido',
          errors: validation.errors,
          timestamp: new Date().toISOString()
        });
      }

      // A lógica de purga agora deve ser gerenciada pelo MessageConsumer
      // ou por outro mecanismo de limpeza da fila.
      // Por enquanto, retornamos um status genérico.
      res.json({
        success: true,
        queueName,
        message: 'Purga de fila não disponível via esta rota',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`🔴 Erro ao purgar fila ${req.params.queueName}:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Erro ao purgar fila',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Obter estatísticas do sistema de mensageria
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = await sessionManager.getMessageStats();
      
      res.json({
        success: true,
        stats,
        systemRunning: sessionManager.messageBridgeRunning,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas de mensagens:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas de mensagens',
        error: error.message
      });
    }
  });

  // Obter mensagens recentes
  router.get('/recent', async (req: Request, res: Response) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const messages = await sessionManager.getRecentMessages(hours);
      
      res.json({
        success: true,
        messages,
        hours,
        count: messages.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter mensagens recentes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter mensagens recentes',
        error: error.message
      });
    }
  });

  // Buscar mensagens
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 50;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          message: 'Parâmetro "q" (query) é obrigatório'
        });
      }

      const messages = await sessionManager.searchMessages(query, limit);
      
      res.json({
        success: true,
        query,
        messages,
        count: messages.length,
        limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao buscar mensagens:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao buscar mensagens',
        error: error.message
      });
    }
  });

  // Criar backup das mensagens
  router.post('/backup', async (req: Request, res: Response) => {
    try {
      const backupPath = await sessionManager.createMessageBackup();
      
      if (backupPath) {
        res.json({
          success: true,
          message: 'Backup criado com sucesso',
          backupPath,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Falha ao criar backup'
        });
      }
    } catch (error) {
      logger.error('Erro ao criar backup:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao criar backup',
        error: error.message
      });
    }
  });

  // Obter mensagens por sessão
  router.get('/by-session/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const messages = await sessionManager.messageDatabase.getMessagesBySession(sessionId, limit);
      
      res.json({
        success: true,
        sessionId,
        messages,
        count: messages.length,
        limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter mensagens por sessão:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter mensagens por sessão',
        error: error.message
      });
    }
  });

  // Obter mensagens por usuário
  router.get('/by-user/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const messages = await sessionManager.messageDatabase.getMessagesByUser(userId, limit);
      
      res.json({
        success: true,
        userId,
        messages,
        count: messages.length,
        limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter mensagens por usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter mensagens por usuário',
        error: error.message
      });
    }
  });

  // Obter mensagens por tipo
  router.get('/by-type/:messageType', async (req: Request, res: Response) => {
    try {
      const { messageType } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const messages = await sessionManager.messageDatabase.getMessagesByType(messageType, limit);
      
      res.json({
        success: true,
        messageType,
        messages,
        count: messages.length,
        limit,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter mensagens por tipo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter mensagens por tipo',
        error: error.message
      });
    }
  });

  // Obter estatísticas detalhadas do banco
  router.get('/database/stats', async (req: Request, res: Response) => {
    try {
      const stats = await sessionManager.messageDatabase.getStatistics();
      
      res.json({
        success: true,
        database: 'JSON',
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas do banco:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas do banco',
        error: error.message
      });
    }
  });

  // Obter mensagens recentes do banco (substitui Redis Stream)
  router.get('/database/recent', async (req: Request, res: Response) => {
    try {
      const count = parseInt(req.query.count as string) || 50;
      const hours = parseInt(req.query.hours as string) || 24;
      
      const messages = await sessionManager.getRecentMessages(hours);
      const limitedMessages = messages.slice(0, count);

      res.json({
        success: true,
        source: 'database',
        messages: limitedMessages,
        count: limitedMessages.length,
        hours,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter mensagens do banco:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter mensagens do banco',
        error: error.message
      });
    }
  });

  // Obter informações do sistema (substitui Redis info)
  router.get('/system/info', async (req: Request, res: Response) => {
    try {
      const messageStats = await sessionManager.getMessageStats();
      
      res.json({
        success: true,
        system: 'RabbitMQ + JSON Database',
        architecture: 'Simplified',
        components: {
          rabbitmq: 'Message Queue',
          database: 'JSON File Storage',
          consumer: 'MessageDatabaseConsumer'
        },
        stats: messageStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter informações do sistema:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter informações do sistema',
        error: error.message
      });
    }
  });

  // Status do sistema (substitui Redis pending)
  router.get('/system/status', async (req: Request, res: Response) => {
    try {
      const isRunning = sessionManager.messageBridgeRunning;
      const stats = await sessionManager.getMessageStats();
      
      res.json({
        success: true,
        system: {
          status: isRunning ? 'running' : 'stopped',
          architecture: 'RabbitMQ → Database',
          redis_removed: true
        },
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Erro ao obter status do sistema:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter status do sistema',
        error: error.message
      });
    }
  });

  return router;
} 