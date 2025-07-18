import * as amqp from 'amqplib';
import { 
  QueueMessage, 
  QueueConfig, 
  QueueStatus, 
  RetryConfig, 
  DEFAULT_QUEUE_CONFIG, 
  DEFAULT_RETRY_CONFIG,
  MESSAGE_PRIORITIES 
} from '../utils/QueueMessage';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import { RabbitMQErrorHandler, defaultErrorHandler } from '../utils/RabbitMQErrorHandler';
import logger from '../utils/Logger';

export class QueueManager {
  private connection: any = null;
  private channel: any = null;
  private readonly rabbitUrl: string;
  private queueCache: Map<string, QueueStatus> = new Map();
  private retryConfig: RetryConfig;
  private isConnected: boolean = false;
  private errorHandler: RabbitMQErrorHandler;

  constructor(
    rabbitUrl: string = 'amqp://admin:admin123@localhost:5672',
    retryConfig?: Partial<RetryConfig>
  ) {
    this.rabbitUrl = rabbitUrl;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.errorHandler = new RabbitMQErrorHandler({
      maxRetries: 3,
      retryDelay: 1000,
      exponentialBackoff: true,
      dlqEnabled: true,
      logLevel: 'error'
    });
  }

  /**
   * Conecta ao RabbitMQ
   */
  async connect(): Promise<void> {
    try {
      if (this.isConnected && this.connection && this.channel) {
        return;
      }

      logger.info('🔗 Conectando QueueManager ao RabbitMQ...');
      
      try {
        this.connection = await amqp.connect(rabbitMQConfig.url);
        this.channel = await this.connection.createChannel();

        // Validar permissões se configurado
        if (process.env.VALIDATE_RABBITMQ_PERMISSIONS === 'true') {
          const permissions = await this.errorHandler.validatePermissions(this.channel);
          if (permissions.errors.length > 0) {
            logger.warn(`⚠️ Permissões RabbitMQ limitadas:`, permissions.errors);
          }
        }

        // Configurar handlers de erro
        this.connection.on('error', (err) => {
          const errorAction = this.errorHandler.handleError(err, 'connection', 0);
          
          if (errorAction.action === 'reconnect') {
            logger.info(`🔄 Tentando reconectar em ${errorAction.delay}ms...`);
            setTimeout(() => this.reconnect(), errorAction.delay);
          } else {
            logger.error('🔴 Erro na conexão RabbitMQ QueueManager:', err);
            this.isConnected = false;
            this.connection = null;
            this.channel = null;
          }
        });

        this.connection.on('close', () => {
          logger.info('📴 Conexão RabbitMQ QueueManager fechada');
          this.isConnected = false;
          this.connection = null;
          this.channel = null;
        });

        this.isConnected = true;
        logger.info('✅ QueueManager conectado ao RabbitMQ');
      } catch (error) {
        const errorAction = this.errorHandler.handleError(error, 'connect', 0);
        
        if (errorAction.action === 'retry') {
          logger.info(`🔄 Tentando conectar novamente em ${errorAction.delay}ms...`);
          setTimeout(() => this.connect(), errorAction.delay);
          return;
        }
        
        throw error;
      }
    } catch (error) {
      logger.error('🔴 Erro ao conectar QueueManager:', error);
      throw error;
    }
  }

  /**
   * Desconecta do RabbitMQ
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.isConnected = false;
      this.queueCache.clear();
      logger.info('✅ QueueManager desconectado');
    } catch (error) {
      logger.error('🔴 Erro ao desconectar QueueManager:', error);
    }
  }

  /**
   * Verifica se uma fila existe
   */
  async queueExists(queueName: string): Promise<boolean> {
    try {
      await this.ensureConnected();
      
      const queueInfo = await this.channel!.checkQueue(queueName);
      
      // Atualizar cache
      this.queueCache.set(queueName, {
        name: queueName,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
        exists: true,
        lastActivity: new Date().toISOString()
      });

      return true;
    } catch (error) {
      if (error.code === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Cria uma fila se não existir
   */
  async ensureQueue(queueName: string, config?: Partial<QueueConfig>): Promise<void> {
    try {
      await this.ensureConnected();

      const queueConfig = { 
        ...DEFAULT_QUEUE_CONFIG, 
        name: queueName,
        ...config 
      };

      logger.info(`📦 Criando/verificando fila: ${queueName}`);
      
      const queueInfo = await this.channel!.assertQueue(queueName, {
        durable: queueConfig.durable,
        autoDelete: queueConfig.autoDelete,
        exclusive: queueConfig.exclusive,
        arguments: queueConfig.arguments
      });

      // Configurar Dead Letter Queue se habilitado
      if (this.retryConfig.dlqEnabled) {
        await this.ensureDeadLetterQueue(queueName);
      }

      // Atualizar cache
      this.queueCache.set(queueName, {
        name: queueName,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
        exists: true,
        lastActivity: new Date().toISOString()
      });

      logger.info(`✅ Fila ${queueName} pronta (${queueInfo.messageCount} mensagens)`);
    } catch (error) {
      logger.error(`🔴 Erro ao criar fila ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Cria uma Dead Letter Queue para uma fila
   */
  private async ensureDeadLetterQueue(queueName: string): Promise<void> {
    const dlqName = `${queueName}.dlq`;
    const dlxName = `${queueName}.dlx`;

    try {
      // Criar Dead Letter Exchange
      await this.channel!.assertExchange(dlxName, 'direct', {
        durable: true
      });

      // Criar Dead Letter Queue
      await this.channel!.assertQueue(dlqName, {
        durable: true,
        autoDelete: false,
        exclusive: false
      });

      // Bind DLQ ao DLX
      await this.channel!.bindQueue(dlqName, dlxName, queueName);

      logger.info(`🪦 Dead Letter Queue configurada: ${dlqName}`);
    } catch (error) {
      logger.error(`🔴 Erro ao configurar DLQ para ${queueName}:`, error);
    }
  }

  /**
   * Envia uma mensagem para a fila com retry automático
   */
  async sendMessage(queueName: string, message: QueueMessage): Promise<boolean> {
    let attempt = 0;
    const maxAttempts = this.retryConfig.maxRetries + 1;

    while (attempt < maxAttempts) {
      try {
        await this.ensureConnected();
        await this.ensureQueue(queueName);

        // Preparar mensagem com metadados de retry
        const messageWithRetry = {
          ...message,
          metadata: {
            ...message.metadata,
            retryCount: attempt,
            maxRetries: this.retryConfig.maxRetries
          }
        };

        // Configurar opções da mensagem
        const options: amqp.Options.Publish = {
          persistent: true,
          priority: MESSAGE_PRIORITIES[message.metadata.priority],
          messageId: message.id,
          timestamp: Date.now(),
          headers: {
            'x-original-queue': queueName,
            'x-retry-count': attempt,
            'x-max-retries': this.retryConfig.maxRetries,
            'x-sender': message.metadata.sender
          }
        };

        // Configurar Dead Letter Exchange se habilitado
        if (this.retryConfig.dlqEnabled && attempt === 0) {
          options.headers!['x-dead-letter-exchange'] = `${queueName}.dlx`;
          options.headers!['x-dead-letter-routing-key'] = queueName;
        }

        // Enviar mensagem
        const success = this.channel!.sendToQueue(
          queueName,
          Buffer.from(JSON.stringify(messageWithRetry)),
          options
        );

        if (success) {
          logger.info(`📤 Mensagem enviada para ${queueName}: ${message.id} (tentativa ${attempt + 1})`);
          
          // Atualizar cache da fila
          const queueStatus = this.queueCache.get(queueName);
          if (queueStatus) {
            queueStatus.messageCount++;
            queueStatus.lastActivity = new Date().toISOString();
          }

          return true;
        } else {
          throw new Error('Canal RabbitMQ não confirmou o envio');
        }

      } catch (error) {
        attempt++;
        logger.error(`🔴 Erro ao enviar mensagem (tentativa ${attempt}/${maxAttempts}):`, error);

        if (attempt >= maxAttempts) {
          logger.error(`💀 Falha definitiva ao enviar mensagem ${message.id} para ${queueName}`);
          
          // Tentar enviar para DLQ se habilitado
          if (this.retryConfig.dlqEnabled) {
            await this.sendToDeadLetterQueue(queueName, message, error.message);
          }
          
          throw error;
        }

        // Aguardar antes do próximo retry
        const delay = this.retryConfig.exponentialBackoff 
          ? this.retryConfig.retryDelay * Math.pow(2, attempt - 1)
          : this.retryConfig.retryDelay;

        logger.info(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
        await this.sleep(delay);

        // Tentar reconectar se necessário
        if (!this.isConnected) {
          await this.connect();
        }
      }
    }

    return false;
  }

  /**
   * Envia mensagem para Dead Letter Queue
   */
  private async sendToDeadLetterQueue(originalQueue: string, message: QueueMessage, errorMessage: string): Promise<void> {
    try {
      const dlqName = `${originalQueue}.dlq`;
      
      const dlqMessage = {
        ...message,
        metadata: {
          ...message.metadata,
          originalQueue,
          errorMessage,
          failedAt: new Date().toISOString()
        }
      };

      await this.ensureQueue(dlqName);
      
      this.channel!.sendToQueue(
        dlqName,
        Buffer.from(JSON.stringify(dlqMessage)),
        {
          persistent: true,
          messageId: `dlq_${message.id}`,
          timestamp: Date.now(),
          headers: {
            'x-original-queue': originalQueue,
            'x-failure-reason': errorMessage,
            'x-failed-at': new Date().toISOString()
          }
        }
      );

      logger.info(`🪦 Mensagem enviada para DLQ: ${dlqName}`);
    } catch (error) {
      logger.error(`🔴 Erro ao enviar para DLQ:`, error);
    }
  }

  /**
   * Obtém o status de uma fila
   */
  async getQueueStatus(queueName: string): Promise<QueueStatus | null> {
    try {
      await this.ensureConnected();
      
      const queueInfo = await this.channel!.checkQueue(queueName);
      
      const status: QueueStatus = {
        name: queueName,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
        exists: true,
        lastActivity: new Date().toISOString()
      };

      this.queueCache.set(queueName, status);
      return status;
    } catch (error) {
      if (error.code === 404) {
        return {
          name: queueName,
          messageCount: 0,
          consumerCount: 0,
          exists: false
        };
      }
      throw error;
    }
  }

  /**
   * Lista todas as filas em cache
   */
  getCachedQueues(): QueueStatus[] {
    return Array.from(this.queueCache.values());
  }

  /**
   * Remove uma fila
   */
  async deleteQueue(queueName: string, ifUnused: boolean = false, ifEmpty: boolean = false): Promise<boolean> {
    try {
      await this.ensureConnected();
      
      const result = await this.channel!.deleteQueue(queueName, {
        ifUnused,
        ifEmpty
      });

      this.queueCache.delete(queueName);
      logger.info(`🗑️ Fila ${queueName} removida (${result.messageCount} mensagens)`);
      
      return true;
    } catch (error) {
      logger.error(`🔴 Erro ao remover fila ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Purga todas as mensagens de uma fila
   */
  async purgeQueue(queueName: string): Promise<number> {
    try {
      await this.ensureConnected();
      
      const result = await this.channel!.purgeQueue(queueName);
      
      // Atualizar cache
      const queueStatus = this.queueCache.get(queueName);
      if (queueStatus) {
        queueStatus.messageCount = 0;
        queueStatus.lastActivity = new Date().toISOString();
      }

      logger.info(`🧹 Fila ${queueName} purgada (${result.messageCount} mensagens removidas)`);
      return result.messageCount;
    } catch (error) {
      logger.error(`🔴 Erro ao purgar fila ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Garante que está conectado
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.connection || !this.channel) {
      await this.connect();
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtém estatísticas do sistema
   */
  getStats(): {
    connected: boolean;
    queuesInCache: number;
    retryConfig: RetryConfig;
    rabbitUrl: string;
  } {
    return {
      connected: this.isConnected,
      queuesInCache: this.queueCache.size,
      retryConfig: this.retryConfig,
      rabbitUrl: this.rabbitUrl.replace(/\/\/.*@/, '//***@') // Ocultar credenciais
    };
  }

  private async reconnect(): Promise<void> {
    try {
      logger.info('�� Reconectando QueueManager...');
      this.connection = null;
      this.channel = null;
      this.isConnected = false;
      await this.connect();
    } catch (error) {
      logger.error('🔴 Erro ao reconectar QueueManager:', error);
    }
  }
} 