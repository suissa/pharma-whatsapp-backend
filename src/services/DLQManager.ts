import * as amqp from 'amqplib';
import { DeadLetterQueue, DLQMessage } from './DeadLetterQueue';
import { RedisClient } from '../config/redis';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import logger from '../utils/Logger';

export interface DLQProcessingStats {
  processed: number;
  retried: number;
  failed: number;
  discarded: number;
}

export class DLQManager {
  private static instance: DLQManager;
  private connection: any = null;
  private channel: any = null;
  private dlq: DeadLetterQueue;
  private redis: RedisClient;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly url = rabbitMQConfig.url;

  private constructor() {
    this.dlq = DeadLetterQueue.getInstance();
    this.redis = RedisClient.getInstance();
  }

  public static getInstance(): DLQManager {
    if (!DLQManager.instance) {
      DLQManager.instance = new DLQManager();
    }
    return DLQManager.instance;
  }

  public async connect(): Promise<void> {
    try {
      if (!this.connection) {
        this.connection = await amqp.connect(this.url);
        logger.info('🔗 DLQ Manager conectado ao RabbitMQ');

        this.connection.on('error', (err: any) => {
          logger.error('🔴 Erro na conexão DLQ Manager:', err);
          this.connection = null;
          this.channel = null;
        });

        this.connection.on('close', () => {
          logger.info('🔴 Conexão DLQ Manager fechada');
          this.connection = null;
          this.channel = null;
        });
      }

      if (!this.channel) {
        this.channel = await this.connection.createChannel();
      }

      await this.dlq.connect();
      await this.redis.connect();
    } catch (error) {
      logger.error('🔴 Erro ao conectar DLQ Manager:', error);
      throw error;
    }
  }

  public async startProcessing(intervalMinutes: number = 5): Promise<void> {
    if (this.isProcessing) {
      logger.warn('⚠️ DLQ Manager já está processando');
      return;
    }

    this.isProcessing = true;
    logger.info(`🎯 DLQ Manager iniciado - processamento a cada ${intervalMinutes} minutos`);

    // Processar imediatamente
    await this.processFailedMessages();

    // Configurar processamento periódico
    this.processingInterval = setInterval(async () => {
      await this.processFailedMessages();
    }, intervalMinutes * 60 * 1000);
  }

  public async stopProcessing(): Promise<void> {
    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('🛑 DLQ Manager parado');
  }

  private async processFailedMessages(): Promise<DLQProcessingStats> {
    const stats: DLQProcessingStats = {
      processed: 0,
      retried: 0,
      failed: 0,
      discarded: 0
    };

    try {
      logger.info('🔍 Processando mensagens da DLQ...');
      const dlqMessages = await this.dlq.getDLQMessages(100);

      for (const message of dlqMessages) {
        stats.processed++;

        try {
          if (await this.shouldRetryMessage(message)) {
            const retrySuccess = await this.dlq.retryMessage(message.id);
            if (retrySuccess) {
              stats.retried++;
              logger.info(`✅ Mensagem reenviada: ${message.id}`);
            } else {
              stats.failed++;
              logger.error(`🔴 Falha ao reenviar: ${message.id}`);
            }
          } else {
            await this.discardMessage(message);
            stats.discarded++;
            logger.warn(`🗑️ Mensagem descartada: ${message.id}`);
          }
        } catch (error) {
          stats.failed++;
          logger.error(`🔴 Erro ao processar mensagem ${message.id}:`, error);
        }

        // Pequeno delay para não sobrecarregar
        await this.sleep(100);
      }

      if (stats.processed > 0) {
        logger.info('📊 Estatísticas do processamento DLQ:', stats);
      }

      return stats;
    } catch (error) {
      logger.error('🔴 Erro no processamento automático DLQ:', error);
      return stats;
    }
  }

  private async shouldRetryMessage(message: DLQMessage): Promise<boolean> {
    // Verificar se ainda não excedeu o máximo de tentativas
    if (message.retryCount >= message.maxRetries) {
      return false;
    }

    // Verificar se já passou tempo suficiente desde a última tentativa
    const lastError = new Date(message.lastErrorTimestamp);
    const now = new Date();
    const timeDiff = (now.getTime() - lastError.getTime()) / 1000; // em segundos
    const minRetryDelay = 300; // 5 minutos

    if (timeDiff < minRetryDelay) {
      return false;
    }

    // Verificar se o erro é recuperável
    return this.isRecoverableError(message.error);
  }

  private isRecoverableError(error: string): boolean {
    const recoverableErrors = [
      'CONNECTION_RESET',
      'TIMEOUT',
      'NETWORK_ERROR',
      'TEMPORARY_FAILURE',
      'RATE_LIMIT',
      'SERVICE_UNAVAILABLE'
    ];

    const nonRecoverableErrors = [
      'AUTHENTICATION_ERROR',
      'INVALID_MESSAGE_FORMAT',
      'VALIDATION_ERROR',
      'PERMISSION_DENIED',
      'NOT_FOUND'
    ];

    // Verificar erros não recuperáveis primeiro
    if (nonRecoverableErrors.some(errType => error.includes(errType))) {
      return false;
    }

    // Verificar erros recuperáveis
    if (recoverableErrors.some(errType => error.includes(errType))) {
      return true;
    }

    // Por padrão, considerar recuperável (ser conservador)
    return true;
  }

  private async discardMessage(message: DLQMessage): Promise<void> {
    try {
      // Mover para arquivo de log permanente
      await this.archiveMessage(message);
      
      // Remover do Redis
      const key = `dlq:message:${message.id}`;
      await this.redis.del(key);
      
      logger.info(`🗃️ Mensagem arquivada e removida: ${message.id}`);
    } catch (error) {
      logger.error(`🔴 Erro ao descartar mensagem ${message.id}:`, error);
    }
  }

  private async archiveMessage(message: DLQMessage): Promise<void> {
    const archiveKey = `dlq:archive:${new Date().toISOString().split('T')[0]}`;
    const archiveData = {
      messageId: message.id,
      timestamp: new Date().toISOString(),
      originalRoutingKey: message.originalRoutingKey,
      error: message.error,
      retryCount: message.retryCount,
      instanceId: message.instanceId
    };

    try {
      // Adicionar à lista de arquivos do dia
      await this.redis.getClient().lpush(archiveKey, JSON.stringify(archiveData));
      
      // Definir TTL de 30 dias para o arquivo
      await this.redis.getClient().expire(archiveKey, 30 * 24 * 60 * 60);
    } catch (error) {
      logger.error('🔴 Erro ao arquivar mensagem:', error);
    }
  }

  public async retryAllMessages(): Promise<DLQProcessingStats> {
    logger.info('🔄 Tentando reenviar todas as mensagens da DLQ...');
    
    const stats: DLQProcessingStats = {
      processed: 0,
      retried: 0,
      failed: 0,
      discarded: 0
    };

    try {
      const dlqMessages = await this.dlq.getDLQMessages(1000);

      for (const message of dlqMessages) {
        stats.processed++;

        if (message.retryCount < message.maxRetries) {
          const success = await this.dlq.retryMessage(message.id);
          if (success) {
            stats.retried++;
          } else {
            stats.failed++;
          }
        } else {
          stats.discarded++;
        }
      }

      logger.info('📊 Resultado do reenvio em massa:', stats);
      return stats;
    } catch (error) {
      logger.error('🔴 Erro no reenvio em massa:', error);
      return stats;
    }
  }

  public async clearDLQ(): Promise<number> {
    try {
      logger.info('🧹 Limpando Dead Letter Queue...');
      
      const messages = await this.dlq.getDLQMessages(1000);
      let cleared = 0;

      for (const message of messages) {
        await this.archiveMessage(message);
        const key = `dlq:message:${message.id}`;
        await this.redis.del(key);
        cleared++;
      }

      // Limpar também a fila do RabbitMQ
      if (this.channel) {
        await this.channel.purgeQueue('baileys.dlq');
      }

      logger.info(`🗑️ ${cleared} mensagens removidas da DLQ`);
      return cleared;
    } catch (error) {
      logger.error('🔴 Erro ao limpar DLQ:', error);
      return 0;
    }
  }

  public async getDetailedStats(): Promise<{
    basic: DLQProcessingStats;
    byInstance: Record<string, number>;
    byErrorType: Record<string, number>;
    timeline: Record<string, number>;
  }> {
    try {
      const messages = await this.dlq.getDLQMessages(1000);
      
      const stats = {
        basic: {
          processed: messages.length,
          retried: 0,
          failed: 0,
          discarded: 0
        },
        byInstance: {} as Record<string, number>,
        byErrorType: {} as Record<string, number>,
        timeline: {} as Record<string, number>
      };

      messages.forEach(msg => {
        // Por instância
        const instance = msg.instanceId || 'unknown';
        stats.byInstance[instance] = (stats.byInstance[instance] || 0) + 1;

        // Por tipo de erro
        const errorType = msg.error.split(':')[0];
        stats.byErrorType[errorType] = (stats.byErrorType[errorType] || 0) + 1;

        // Timeline (por dia)
        const day = msg.timestamp.split('T')[0];
        stats.timeline[day] = (stats.timeline[day] || 0) + 1;

        // Estatísticas básicas
        if (msg.retryCount > 0) {
          stats.basic.retried++;
        }
        if (msg.retryCount >= msg.maxRetries) {
          stats.basic.failed++;
        }
      });

      return stats;
    } catch (error) {
      logger.error('🔴 Erro ao gerar estatísticas detalhadas:', error);
      return {
        basic: { processed: 0, retried: 0, failed: 0, discarded: 0 },
        byInstance: {},
        byErrorType: {},
        timeline: {}
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async disconnect(): Promise<void> {
    try {
      await this.stopProcessing();
      
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      logger.info('🔌 DLQ Manager desconectado');
    } catch (error) {
      logger.error('🔴 Erro ao desconectar DLQ Manager:', error);
    }
  }
} 