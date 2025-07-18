import * as amqp from 'amqplib';
import { RedisClient } from '../config/redis';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import logger from '../utils/Logger';

export interface DLQMessage {
  id: string;
  originalRoutingKey: string;
  originalExchange: string;
  originalQueue: string;
  payload: any;
  error: string;
  retryCount: number;
  maxRetries: number;
  timestamp: string;
  lastErrorTimestamp: string;
  instanceId?: string;
}

export interface DLQConfig {
  maxRetries: number;
  retryDelay: number; // em segundos
  dlqExchange: string;
  dlqQueue: string;
  dlqRoutingKey: string;
}

export class DeadLetterQueue {
  private static instance: DeadLetterQueue;
  private connection: any = null;
  private channel: any = null;
  private redis: RedisClient;
  private readonly url = rabbitMQConfig.url;
  
  private readonly config: DLQConfig = {
    maxRetries: 3,
    retryDelay: 300, // 5 minutos
    dlqExchange: 'baileys.dlx',
    dlqQueue: 'baileys.dlq',
    dlqRoutingKey: 'dead.letter'
  };

  private constructor() {
    this.redis = RedisClient.getInstance();
  }

  public static getInstance(): DeadLetterQueue {
    if (!DeadLetterQueue.instance) {
      DeadLetterQueue.instance = new DeadLetterQueue();
    }
    return DeadLetterQueue.instance;
  }

  public async connect(): Promise<void> {
    try {
      if (!this.connection) {
        this.connection = await amqp.connect(this.url);
        logger.info('🔗 Dead Letter Queue conectada ao RabbitMQ');

        this.connection.on('error', (err: any) => {
          logger.error('🔴 Erro na conexão DLQ:', err);
          this.connection = null;
          this.channel = null;
        });

        this.connection.on('close', () => {
          logger.info('🔴 Conexão DLQ fechada');
          this.connection = null;
          this.channel = null;
        });
      }

      if (!this.channel) {
        this.channel = await this.connection.createChannel();
        await this.setupDLQInfrastructure();
      }

      await this.redis.connect();
    } catch (error) {
      logger.error('🔴 Erro ao conectar DLQ:', error);
      throw error;
    }
  }

  private async setupDLQInfrastructure(): Promise<void> {
    if (!this.channel) return;

    // Declarar Dead Letter Exchange
    await this.channel.assertExchange(this.config.dlqExchange, 'topic', {
      durable: true
    });

    // Declarar Dead Letter Queue
    await this.channel.assertQueue(this.config.dlqQueue, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        'x-message-ttl': 86400000, // 24 horas
        'x-max-length': 10000 // máximo de mensagens
      }
    });

    // Bind DLQ ao DLX
    await this.channel.bindQueue(
      this.config.dlqQueue,
      this.config.dlqExchange,
      this.config.dlqRoutingKey
    );

    logger.info('✅ Infraestrutura DLQ configurada');
  }

  public async sendToDeadLetterQueue(
    originalMessage: any,
    originalRoutingKey: string,
    error: string,
    retryCount: number = 0,
    instanceId?: string
  ): Promise<void> {
    try {
      await this.connect();

      const dlqMessage: DLQMessage = {
        id: this.generateMessageId(),
        originalRoutingKey,
        originalExchange: 'baileys.events',
        originalQueue: originalMessage.queue || 'unknown',
        payload: originalMessage,
        error,
        retryCount,
        maxRetries: this.config.maxRetries,
        timestamp: new Date().toISOString(),
        lastErrorTimestamp: new Date().toISOString(),
        instanceId
      };

      // Salvar no Redis para tracking
      await this.saveDLQMessageToRedis(dlqMessage);

      // Enviar para a Dead Letter Queue
      const published = this.channel.publish(
        this.config.dlqExchange,
        this.config.dlqRoutingKey,
        Buffer.from(JSON.stringify(dlqMessage)),
        {
          persistent: true,
          messageId: dlqMessage.id,
          timestamp: Date.now(),
          headers: {
            'x-retry-count': retryCount,
            'x-original-routing-key': originalRoutingKey,
            'x-error': error,
            'x-instance-id': instanceId || 'unknown'
          }
        }
      );

      if (published) {
        logger.info(`💀 Mensagem enviada para DLQ: ${dlqMessage.id}`, {
          routingKey: originalRoutingKey,
          error: error.substring(0, 100),
          retryCount
        });
      } else {
        logger.error(`🔴 Falha ao enviar mensagem para DLQ: ${dlqMessage.id}`);
      }
    } catch (error) {
      logger.error('🔴 Erro ao enviar para DLQ:', error);
    }
  }

  public async retryMessage(messageId: string): Promise<boolean> {
    try {
      const dlqMessage = await this.getDLQMessageFromRedis(messageId);
      if (!dlqMessage) {
        logger.error(`🔴 Mensagem DLQ não encontrada: ${messageId}`);
        return false;
      }

      if (dlqMessage.retryCount >= dlqMessage.maxRetries) {
        logger.error(`🔴 Mensagem excedeu tentativas máximas: ${messageId}`);
        return false;
      }

      // Incrementar contador de retry
      dlqMessage.retryCount++;
      dlqMessage.lastErrorTimestamp = new Date().toISOString();

      // Atualizar no Redis
      await this.saveDLQMessageToRedis(dlqMessage);

      // Reenviar para a fila original
      const published = this.channel.publish(
        dlqMessage.originalExchange,
        dlqMessage.originalRoutingKey,
        Buffer.from(JSON.stringify(dlqMessage.payload)),
        {
          persistent: true,
          messageId: this.generateMessageId(),
          timestamp: Date.now(),
          headers: {
            'x-retry-attempt': dlqMessage.retryCount,
            'x-dlq-message-id': messageId
          }
        }
      );

      if (published) {
        logger.info(`🔄 Mensagem reenviada da DLQ: ${messageId} (tentativa ${dlqMessage.retryCount})`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('🔴 Erro ao tentar novamente mensagem DLQ:', error);
      return false;
    }
  }

  public async getDLQMessages(limit: number = 50): Promise<DLQMessage[]> {
    try {
      await this.redis.connect();
      const keys = await this.redis.getClient().keys('dlq:message:*');
      const messages: DLQMessage[] = [];

      for (let i = 0; i < Math.min(keys.length, limit); i++) {
        const messageData = await this.redis.get(keys[i]);
        if (messageData) {
          messages.push(JSON.parse(messageData));
        }
      }

      return messages.sort((a, b) => 
        new Date(b.lastErrorTimestamp).getTime() - new Date(a.lastErrorTimestamp).getTime()
      );
    } catch (error) {
      logger.error('🔴 Erro ao buscar mensagens DLQ:', error);
      return [];
    }
  }

  public async getDLQStats(): Promise<{
    totalMessages: number;
    messagesByInstance: Record<string, number>;
    messagesByError: Record<string, number>;
  }> {
    try {
      const messages = await this.getDLQMessages(1000);
      
      const stats = {
        totalMessages: messages.length,
        messagesByInstance: {} as Record<string, number>,
        messagesByError: {} as Record<string, number>
      };

      messages.forEach(msg => {
        const instance = msg.instanceId || 'unknown';
        stats.messagesByInstance[instance] = (stats.messagesByInstance[instance] || 0) + 1;
        
        const errorType = msg.error.split(':')[0];
        stats.messagesByError[errorType] = (stats.messagesByError[errorType] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('🔴 Erro ao gerar estatísticas DLQ:', error);
      return {
        totalMessages: 0,
        messagesByInstance: {},
        messagesByError: {}
      };
    }
  }

  private async saveDLQMessageToRedis(message: DLQMessage): Promise<void> {
    const key = `dlq:message:${message.id}`;
    const ttl = 7 * 24 * 60 * 60; // 7 dias
    await this.redis.set(key, JSON.stringify(message), ttl);
  }

  private async getDLQMessageFromRedis(messageId: string): Promise<DLQMessage | null> {
    const key = `dlq:message:${messageId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  private generateMessageId(): string {
    return `dlq-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      logger.info('🔌 Dead Letter Queue desconectada');
    } catch (error) {
      logger.error('🔴 Erro ao desconectar DLQ:', error);
    }
  }
} 