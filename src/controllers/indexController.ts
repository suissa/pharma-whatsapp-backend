import { Router, Request, Response } from 'express';
import { SessionManager } from '../services/SessionManager';
import { connect } from 'amqplib';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import logger from '../utils/Logger';

export function createIndexRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  // Rota raiz da aplicação
  router.get('/', (req: Request, res: Response) => {
    try {
      const activeSessions = sessionManager.getActiveSessionIds();
      
      res.json({
        message: 'Baileys WhatsApp API',
        version: '1.0.3',
        status: 'running',
        timestamp: new Date().toISOString(),
        features: [
          'sessions', 
          'file-auth', 
          'auto-reconnect',
          'message-store',
          'cors-enabled',
          'modular-architecture'
        ],
        endpoints: {
          sessions: '/api/sessions',
          health: '/api/health',
          documentation: '/api/docs'
        },
        activeSessions,
        description: 'API modular para gerenciamento de sessões WhatsApp usando Baileys'
      });
    } catch (error) {
      logger.error('Erro na rota raiz:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  });

  // Documentação básica da API
  router.get('/docs', (req: Request, res: Response) => {
    res.json({
      title: 'Baileys WhatsApp API Documentation',
      version: '1.0.3',
      description: 'API para gerenciamento de sessões WhatsApp usando a biblioteca Baileys',
      baseUrl: `${req.protocol}://${req.get('host')}`,
      endpoints: {
        sessions: {
          'GET /api/sessions': 'Listar todas as sessões ativas',
          'GET /api/sessions/:id': 'Obter informações de uma sessão específica',
          'POST /api/sessions/:id/reconnect': 'Reconectar uma sessão',
          'POST /api/sessions/:id/send': 'Enviar mensagem através de uma sessão'
        },
        health: {
          'GET /api/health': 'Health check básico',
          'GET /api/health/detailed': 'Health check detalhado com informações do sistema'
        },
        general: {
          'GET /': 'Informações gerais da API',
          'GET /docs': 'Esta documentação'
        }
      },
      examples: {
        sendMessage: {
          url: 'POST /api/sessions/euhueue/send',
          body: {
            to: '5511991957645',
            message: 'Olá! Esta é uma mensagem de teste.'
          }
        },
        getSessions: {
          url: 'GET /api/sessions',
          response: {
            success: true,
            sessions: [
              {
                sessionId: 'euhueue',
                status: 'connected',
                user: {
                  id: '5515991957645:32@s.whatsapp.net',
                  name: 'Jean Suissa'
                }
              }
            ],
            total: 1
          }
        }
      }
    });
  });

  // Endpoint para recebimento de mensagens de uma fila RabbitMQ
  router.get('/api/messages/receive/:queueName', async (req: Request, res: Response) => {
    const { queueName } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const timeout = parseInt(req.query.timeout as string) || 5;
    let connection: any = null;
    let channel: any = null;
    let totalReceived = 0;
    const start = Date.now();
    // Instanciar RedisConsumer
    const { RedisConsumer } = await import('../services/RedisConsumer');
    const redisConsumer = new RedisConsumer();
    redisConsumer.setStreamName(`whatsapp:messages:${queueName}`);
    let rabbitMessages: any[] = [];
    let redisMessages: any[] = [];
    try {
      connection = await connect(rabbitMQConfig.url);
      channel = await connection.createChannel();
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'baileys.dlx',
          'x-dead-letter-routing-key': 'dead.letter'
        }
      });
      // Função para consumir uma mensagem com timeout
      async function getMessageWithTimeout(): Promise<any | null> {
        return new Promise((resolve) => {
          let resolved = false;
          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }, timeout * 1000);
          channel!.get(queueName, { noAck: false })
            .then((msg) => {
              if (!resolved) {
                clearTimeout(timer);
                resolved = true;
                resolve(msg);
              }
            })
            .catch(() => {
              if (!resolved) {
                clearTimeout(timer);
                resolved = true;
                resolve(null);
              }
            });
        });
      }
      // Consumir até 'limit' mensagens ou até o timeout geral
      for (let i = 0; i < limit; i++) {
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed > timeout) break;
        const msg = await getMessageWithTimeout();
        if (!msg) break;
        const now = new Date();
        let content = null;
        try {
          content = JSON.parse(msg.content.toString());
        } catch {
          content = msg.content.toString();
        }
        // Salvar no Redis
        try {
          await redisConsumer.addMessageToStream({
            ...content,
            messageId: content.id || content.messageId || content.eventId, // garantir que o id do POST vira messageId
            eventId: msg.properties.messageId || msg.fields.deliveryTag,
            eventTimestamp: msg.properties.timestamp ? new Date(msg.properties.timestamp).toISOString() : now.toISOString(),
            originalMessage: content
          });
        } catch (err) {
          logger.error('Erro ao salvar mensagem no Redis:', err);
        }
        rabbitMessages.push({
          id: msg.properties.messageId || msg.fields.deliveryTag,
          content: typeof content === 'object' && content.message ? content.message : content,
          timestamp: msg.properties.timestamp ? new Date(msg.properties.timestamp).toISOString() : null,
          metadata: msg.properties.headers || {},
          receivedAt: now.toISOString(),
        });
        channel.ack(msg);
        totalReceived++;
      }
      // Buscar mensagens do Redis (stream)
      try {
        redisMessages = await redisConsumer.getRecentMessages(limit * 2); // Pega mais para garantir interseção
      } catch (err) {
        logger.error('Erro ao buscar mensagens do Redis:', err);
      }
      // Interseção: mensagens presentes em ambos (por id/eventId/messageId)
      const rabbitIds = new Set(rabbitMessages.map(m => m.id));
      const messages = redisMessages
        .filter(rm => rabbitIds.has(rm.messageId || rm.eventId || rm.id))
        .map(rm => ({
          id: rm.messageId || rm.eventId || rm.id,
          content: rm.content,
          timestamp: rm.timestamp || rm.eventTimestamp || null,
          metadata: {
            sender: rm.metadata?.sender || rm.sender || '',
            priority: rm.metadata?.priority || rm.priority || ''
          },
          receivedAt: rm.receivedAt || new Date().toISOString()
        }));
      // Se a interseção for vazia, retorna as mensagens recentes do Redis
      let responseMessages = messages;
      if (messages.length === 0) {
        responseMessages = redisMessages.map(rm => ({
          id: rm.messageId || rm.eventId || rm.id,
          content: rm.content,
          timestamp: rm.timestamp || rm.eventTimestamp || null,
          metadata: {
            sender: rm.metadata?.sender || rm.sender || '',
            priority: rm.metadata?.priority || rm.priority || ''
          },
          receivedAt: rm.receivedAt || new Date().toISOString()
        }));
      }
      // Mensagens pendentes na fila RabbitMQ
      const pending = rabbitMessages.map(m => ({
        id: m.id,
        content: m.content,
        timestamp: m.timestamp,
        metadata: m.metadata,
        receivedAt: m.receivedAt
      }));
      // Mensagens históricas do Redis
      const history = redisMessages.map(rm => ({
        id: rm.messageId || rm.eventId || rm.id,
        content: rm.content,
        timestamp: rm.timestamp || rm.eventTimestamp || null,
        metadata: {
          sender: rm.metadata?.sender || rm.sender || '',
          priority: rm.metadata?.priority || rm.priority || ''
        },
        receivedAt: rm.receivedAt || new Date().toISOString()
      }));
      res.json({
        success: true,
        pending,
        history,
        queueName,
        totalPending: pending.length,
        totalHistory: history.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erro ao consumir mensagens da fila',
        error: error.message,
        queueName
      });
    } finally {
      if (channel) await channel.close().catch(() => {});
      if (connection) await connection.close().catch(() => {});
    }
  });

  // Endpoint de Status das Filas
  router.get('/api/queues/status', async (req: Request, res: Response) => {
    const { connect } = await import('amqplib');
    const { rabbitMQConfig } = await import('../config/RabbitMQConfig');
    // Buscar nomes das filas dinamicamente do config
    const { EmpresaConfigManager } = await import('../config/EmpresaConfig');
    const empresaConfig = EmpresaConfigManager.getInstance();
    const filaNomes = empresaConfig.getAllFilasEmpresas();
    let queues: any[] = [];
    let rabbitMQStatus = 'disconnected';
    let connection: any = null;
    let channel: any = null;
    try {
      connection = await connect(rabbitMQConfig.url);
      channel = await connection.createChannel();
      rabbitMQStatus = 'connected';
      for (const name of filaNomes) {
        let messageCount = 0;
        let consumerCount = 0;
        let isActive = false;
        try {
          const q = await channel.checkQueue(name);
          messageCount = q.messageCount;
          consumerCount = q.consumerCount;
          isActive = q.consumerCount > 0;
        } catch {}
        queues.push({
          name,
          messageCount,
          consumerCount,
          isActive
        });
      }
      await channel.close();
      await connection.close();
    } catch (err) {
      rabbitMQStatus = 'disconnected';
    }
    res.json({
      success: true,
      queues,
      rabbitMQStatus,
      timestamp: new Date().toISOString()
    });
  });

  return router;
} 