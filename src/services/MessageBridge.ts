import { UnifiedProducer, WhatsAppMessageEvent } from '../services/UnifiedProducer';
import { RedisConsumer } from '../services/RedisConsumer';
import { MessageDatabase } from '../database/MessageDatabase';
import * as amqp from 'amqplib';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import logger from '../utils/Logger';

export class MessageBridge {
  private messageProducer: UnifiedProducer;
  private redisConsumer: RedisConsumer;
  private messageDatabase: MessageDatabase;
  private rabbitConsumer: any = null;
  private connection: any = null;
  private channel: any = null;
  private isRunning = false;

  constructor(
    rabbitUrl: string = 'amqp://admin:admin123@localhost:5672',
    redisUrl: string = 'redis://localhost:6379',
    dbDirectory: string = './data/messages'
  ) {
    this.messageProducer = UnifiedProducer.getInstance();
    this.redisConsumer = new RedisConsumer(redisUrl);
    this.messageDatabase = new MessageDatabase(dbDirectory);
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🌉 Inicializando MessageBridge...');

      // Inicializar componentes
      await this.messageDatabase.initialize();
      await this.setupRabbitConsumer();
      
      logger.info('✅ MessageBridge inicializado com sucesso');
    } catch (error) {
      logger.error('🔴 Erro ao inicializar MessageBridge:', error);
      throw error;
    }
  }

  private async setupRabbitConsumer(): Promise<void> {
    try {
      logger.info('🔗 Configurando consumer RabbitMQ...');
      
      // Conectar ao RabbitMQ
      this.connection = await amqp.connect(rabbitMQConfig.url);
      this.channel = await this.connection.createChannel();

      // Declarar exchange e queue para receber mensagens
      const exchangeName = 'whatsapp.messages';
      const queueName = 'whatsapp.messages.bridge';
      
      await this.channel.assertExchange(exchangeName, 'topic', { durable: true });
      
      // Declarar exchange para DLQ se necessário
      await this.channel.assertExchange('baileys.dlx', 'direct', { durable: true });
      
      // Declarar fila COM DLQ
      await this.channel.assertQueue(queueName, { 
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'baileys.dlx',
          'x-dead-letter-routing-key': 'dead.letter'
        }
      });
      await this.channel.bindQueue(queueName, exchangeName, 'message.received');

      logger.info('✅ RabbitMQ consumer configurado');
    } catch (error) {
      logger.error('🔴 Erro ao configurar RabbitMQ consumer:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('⚠️ MessageBridge já está em execução');
        return;
      }

      await this.initialize();
      
      // Iniciar consumo do RabbitMQ
      await this.startRabbitConsumer();
      
      // Iniciar consumo do Redis
      await this.startRedisConsumer();
      
      this.isRunning = true;
      logger.info('🚀 MessageBridge iniciado - fluxo RabbitMQ → Redis → Banco ativo!');
    } catch (error) {
      logger.error('🔴 Erro ao iniciar MessageBridge:', error);
      throw error;
    }
  }

  private async startRabbitConsumer(): Promise<void> {
    try {
      const queueName = 'whatsapp.messages.bridge';
      
      logger.info('🎧 Iniciando consumo RabbitMQ...');
      
      await this.channel.consume(queueName, async (msg: any) => {
        if (msg) {
          try {
            const messageEvent: WhatsAppMessageEvent = JSON.parse(msg.content.toString());
            
            logger.info(`📨 Mensagem recebida do RabbitMQ:`, {
              eventId: messageEvent.eventId,
              sessionId: messageEvent.sessionId,
              messageType: messageEvent.messageType,
              fromUser: messageEvent.fromUser
            });

            // Enviar para Redis Stream
            await this.redisConsumer.addMessageToStream(messageEvent);
            
            // Confirmar processamento no RabbitMQ
            this.channel.ack(msg);
            
            logger.info(`✅ Mensagem transferida RabbitMQ → Redis: ${messageEvent.eventId}`);
          } catch (error) {
            logger.error('🔴 Erro ao processar mensagem do RabbitMQ:', error);
            
            // Rejeitar mensagem (enviará para DLQ se configurado)
            this.channel.nack(msg, false, false);
          }
        }
      });
      
      logger.info('✅ Consumer RabbitMQ iniciado');
    } catch (error) {
      logger.error('🔴 Erro ao iniciar consumer RabbitMQ:', error);
      throw error;
    }
  }

  private async startRedisConsumer(): Promise<void> {
    try {
      logger.info('🎧 Iniciando consumo Redis...');
      
      // Definir callback para processar mensagens do Redis
      const processMessage = async (messageEvent: WhatsAppMessageEvent): Promise<void> => {
        try {
          logger.info(`📥 Processando mensagem do Redis:`, {
            eventId: messageEvent.eventId,
            sessionId: messageEvent.sessionId,
            messageType: messageEvent.messageType,
            fromUser: messageEvent.fromUser
          });

          // Salvar no banco de dados
          const savedMessage = await this.messageDatabase.saveMessage(messageEvent);
          
          logger.info(`💾 Mensagem salva no banco: ${savedMessage.id}`);
        } catch (error) {
          logger.error('🔴 Erro ao salvar mensagem no banco:', error);
          throw error;
        }
      };

      // Iniciar consumo do Redis
      await this.redisConsumer.startConsuming(processMessage);
      
      logger.info('✅ Consumer Redis iniciado');
    } catch (error) {
      logger.error('🔴 Erro ao iniciar consumer Redis:', error);
      throw error;
    }
  }

  async publishMessage(messageEvent: WhatsAppMessageEvent): Promise<boolean> {
    try {
      // Método para publicar mensagem no início do fluxo (RabbitMQ)
      return await this.messageProducer.publishWhatsAppMessage(messageEvent);
    } catch (error) {
      logger.error('🔴 Erro ao publicar mensagem:', error);
      return false;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('🛑 Parando MessageBridge...');
      
      this.isRunning = false;
      
      // Parar consumers
      await this.redisConsumer.stopConsuming();
      
      // Fechar conexões
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      
      await this.messageProducer.disconnect();
      await this.redisConsumer.disconnect();
      
      logger.info('✅ MessageBridge parado');
    } catch (error) {
      logger.error('🔴 Erro ao parar MessageBridge:', error);
    }
  }

  // Métodos para estatísticas e monitoramento
  async getStats(): Promise<any> {
    try {
      const dbStats = await this.messageDatabase.getStatistics();
      const redisStreamInfo = await this.redisConsumer.getStreamInfo();
      const redisConsumerInfo = await this.redisConsumer.getConsumerGroupInfo();

      return {
        database: dbStats,
        redis: {
          stream: redisStreamInfo,
          consumer: redisConsumerInfo,
          connected: this.redisConsumer.connected,
          consuming: this.redisConsumer.consuming
        },
        bridge: {
          running: this.isRunning,
          messageDatabase: {
            messageCount: this.messageDatabase.messageCount,
            initialized: this.messageDatabase.initialized
          }
        }
      };
    } catch (error) {
      logger.error('🔴 Erro ao obter estatísticas:', error);
      return null;
    }
  }

  async getRecentMessages(hours: number = 24): Promise<any[]> {
    try {
      return await this.messageDatabase.getRecentMessages(hours);
    } catch (error) {
      logger.error('🔴 Erro ao obter mensagens recentes:', error);
      return [];
    }
  }

  async searchMessages(query: string, limit: number = 50): Promise<any[]> {
    try {
      return await this.messageDatabase.searchMessages(query, limit);
    } catch (error) {
      logger.error('🔴 Erro ao buscar mensagens:', error);
      return [];
    }
  }

  async createBackup(): Promise<string | null> {
    try {
      return await this.messageDatabase.createBackup();
    } catch (error) {
      logger.error('🔴 Erro ao criar backup:', error);
      return null;
    }
  }

  // Getters para status
  get running(): boolean {
    return this.isRunning;
  }

  get database(): MessageDatabase {
    return this.messageDatabase;
  }

  get producer(): UnifiedProducer {
    return this.messageProducer;
  }

  get consumer(): RedisConsumer {
    return this.redisConsumer;
  }
} 