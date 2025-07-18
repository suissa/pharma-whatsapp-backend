import * as amqp from 'amqplib';
import { MessageDatabase } from '../database/MessageDatabase';
import { WhatsAppMessageEvent } from './UnifiedProducer';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import logger from '../utils/Logger';

// Evitar import circular usando interface
interface IWebSocketServer {
  broadcastNewMessage(instanceId: string, message: any): void;
}

export class MessageDatabaseConsumer {
  private connection: any = null;
  private channel: any = null;
  private messageDatabase: MessageDatabase;
  private isRunning = false;
  private queueName = 'whatsapp.messages.bridge';
  private webSocketServer: IWebSocketServer | null = null;

  constructor(
    private rabbitUrl: string = rabbitMQConfig.url,
    dbDirectory: string = './data/messages',
    webSocketServer?: IWebSocketServer
  ) {
    this.messageDatabase = new MessageDatabase(dbDirectory);
    this.webSocketServer = webSocketServer || null;
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🔧 Inicializando MessageDatabaseConsumer...');
      
      // Inicializar banco de dados
      await this.messageDatabase.initialize();
      const stats = await this.messageDatabase.getStatistics();
      logger.info(`✅ MessageDatabase inicializado com ${stats.totalMessages} mensagens`);
    } catch (error) {
      logger.error('🔴 Erro ao inicializar MessageDatabaseConsumer:', error);
      throw error;
    }
  }

  async connect(): Promise<void> {
    try {
      if (this.connection && this.channel) {
        return; // Já conectado
      }

      logger.info('🔗 Conectando ao RabbitMQ para MessageDatabaseConsumer...');
      this.connection = await amqp.connect(rabbitMQConfig.url);
      this.channel = await this.connection.createChannel();

      // Declarar exchange para DLQ se necessário
      await this.channel.assertExchange('baileys.dlx', 'direct', { durable: true });
      
      // Declarar a fila para mensagens recebidas COM DLQ
      await this.channel.assertQueue(this.queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'baileys.dlx',
          'x-dead-letter-routing-key': 'dead.letter'
        }
      });

      // Configurar prefetch para processar uma mensagem por vez
      await this.channel.prefetch(rabbitMQConfig.queues.prefetch);

      // Configurar handlers de erro
      this.connection.on('error', (err) => {
        logger.error('🔴 Erro na conexão RabbitMQ MessageDatabaseConsumer:', err);
        this.connection = null;
        this.channel = null;
        this.isRunning = false;
      });

      this.connection.on('close', () => {
        logger.info('📴 Conexão RabbitMQ MessageDatabaseConsumer fechada');
        this.connection = null;
        this.channel = null;
        this.isRunning = false;
      });

      logger.info('✅ MessageDatabaseConsumer conectado ao RabbitMQ');
    } catch (error) {
      logger.error('🔴 Erro ao conectar MessageDatabaseConsumer ao RabbitMQ:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('⚠️ MessageDatabaseConsumer já está em execução');
        return;
      }

      await this.connect();

      if (!this.channel) {
        throw new Error('Canal RabbitMQ não disponível para MessageDatabaseConsumer');
      }

      logger.info('🎧 Iniciando consumo de mensagens recebidas...');

      await this.channel.consume(this.queueName, async (msg: any) => {
        if (msg) {
          try {
            await this.processMessage(msg);
          } catch (error) {
            logger.error('🔴 Erro ao processar mensagem recebida:', error);
            
            // Rejeitar mensagem (enviará para DLQ se configurado)
            this.channel.nack(msg, false, false);
          }
        }
      });

      this.isRunning = true;
      logger.info(`✅ MessageDatabaseConsumer iniciado - consumindo fila: ${this.queueName}`);
    } catch (error) {
      logger.error('🔴 Erro ao iniciar MessageDatabaseConsumer:', error);
      throw error;
    }
  }

  private async processMessage(msg: any): Promise<void> {
    try {
      const messageEvent: WhatsAppMessageEvent = JSON.parse(msg.content.toString());
      
      logger.info(`📥 Processando mensagem recebida:`, {
        eventId: messageEvent.eventId,
        sessionId: messageEvent.sessionId,
        messageType: messageEvent.messageType,
        fromUser: messageEvent.fromUser
      });

      // Salvar mensagem diretamente no banco
      const savedMessage = await this.messageDatabase.saveMessage(messageEvent);
      
      if (savedMessage) {
        logger.info(`💾 Mensagem salva no banco: ${savedMessage.id}`);
        
        // Broadcast da nova mensagem para clientes WebSocket interessados
        if (this.webSocketServer) {
          this.webSocketServer.broadcastNewMessage(messageEvent.sessionId, savedMessage);
        }
        
        // Confirmar processamento no RabbitMQ
        this.channel.ack(msg);
        logger.info(`✅ Mensagem processada com sucesso: ${messageEvent.eventId}`);
      } else {
        logger.warn(`⚠️ Falha ao salvar mensagem no banco: ${messageEvent.eventId}`);
        this.channel.nack(msg, false, true); // Requeue para tentar novamente
      }
      
    } catch (error) {
      logger.error('🔴 Erro ao processar mensagem:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.isRunning = false;
      
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      logger.info('📴 MessageDatabaseConsumer parado');
    } catch (error) {
      logger.error('🔴 Erro ao parar MessageDatabaseConsumer:', error);
    }
  }

  public isConsumerRunning(): boolean {
    return this.isRunning;
  }

  public getQueueName(): string {
    return this.queueName;
  }

  // Getter para acessar o banco de dados
  public get database(): MessageDatabase {
    return this.messageDatabase;
  }

  // Método para obter estatísticas do consumer
  public async getStats(): Promise<any> {
    try {
      if (!this.channel) {
        return {
          connected: false,
          queue: this.queueName,
          status: 'disconnected'
        };
      }

      // Verificar fila
      const queueInfo = await this.channel.checkQueue(this.queueName);
      const dbStats = await this.messageDatabase.getStatistics();
      
      return {
        connected: true,
        queue: this.queueName,
        status: this.isRunning ? 'running' : 'stopped',
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
        database: dbStats
      };
    } catch (error) {
      return {
        connected: false,
        queue: this.queueName,
        status: 'error',
        error: error.message
      };
    }
  }

  // Métodos de conveniência para acesso ao banco
  public async getRecentMessages(hours: number = 24) {
    return await this.messageDatabase.getRecentMessages(hours);
  }

  public async searchMessages(query: string) {
    return await this.messageDatabase.searchMessages(query);
  }

  public async getMessagesBySession(sessionId: string) {
    return await this.messageDatabase.getMessagesBySession(sessionId);
  }

  public async backup() {
    return await this.messageDatabase.createBackup();
  }
} 