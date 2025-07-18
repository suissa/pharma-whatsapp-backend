import { createClient, RedisClientType } from 'redis';
import { WhatsAppMessageEvent } from '../services/UnifiedProducer';
import logger from '../utils/Logger';

export interface MessageDatabaseEntry {
  id: string;
  sessionId: string;
  messageId: string;
  fromUser: string;
  toUser?: string;
  timestamp: Date;
  messageType: string;
  content?: string;
  mediaInfo?: any;
  processed: boolean;
  createdAt: Date;
  eventId: string;
}

export class RedisConsumer {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private isConsuming = false;
  private onMessageCallback?: (message: WhatsAppMessageEvent) => Promise<void>;

  constructor(
    private redisUrl: string = 'redis://localhost:6379',
    private streamName: string = 'whatsapp:messages',
    private consumerGroup: string = 'message-processors',
    private consumerName: string = 'consumer-1'
  ) {}

  async connect(): Promise<void> {
    try {
      if (this.isConnected && this.client) {
        return;
      }

      logger.info('🔗 Conectando ao Redis para RedisConsumer...');
      this.client = createClient({ url: this.redisUrl });

      this.client.on('error', (err) => {
        logger.error('🔴 Erro na conexão Redis Consumer:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('✅ RedisConsumer conectado');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        logger.info('📴 Conexão Redis Consumer fechada');
        this.isConnected = false;
      });

      await this.client.connect();

      // Criar o consumer group se não existir
      try {
        await this.client.xGroupCreate(this.streamName, this.consumerGroup, '0', {
          MKSTREAM: true
        });
        logger.info(`📊 Consumer group criado: ${this.consumerGroup}`);
      } catch (error: any) {
        if (error.message.includes('BUSYGROUP')) {
          logger.info(`📊 Consumer group já existe: ${this.consumerGroup}`);
        } else {
          logger.error('🔴 Erro ao criar consumer group:', error);
          throw error;
        }
      }

      logger.info('✅ RedisConsumer configurado com sucesso');
    } catch (error) {
      logger.error('🔴 Erro ao conectar RedisConsumer:', error);
      throw error;
    }
  }

  async startConsuming(onMessage: (message: WhatsAppMessageEvent) => Promise<void>): Promise<void> {
    try {
      await this.connect();

      if (!this.client) {
        throw new Error('Cliente Redis não disponível');
      }

      if (this.isConsuming) {
        logger.warn('⚠️ RedisConsumer já está consumindo mensagens');
        return;
      }

      this.onMessageCallback = onMessage;
      this.isConsuming = true;

      logger.info(`🎧 Iniciando consumo de mensagens do stream: ${this.streamName}`);

      while (this.isConsuming) {
        try {
          // Ler mensagens do consumer group
          const messages = await this.client.xReadGroup(
            this.consumerGroup,
            this.consumerName,
            [
              {
                key: this.streamName,
                id: '>'
              }
            ],
            {
              COUNT: 10,
              BLOCK: 1000 // 1 segundo de timeout
            }
          );

          if (messages && Array.isArray(messages) && messages.length > 0) {
            for (const stream of messages) {
              if (stream && stream.messages && Array.isArray(stream.messages)) {
                for (const message of stream.messages) {
                  await this.processMessage(message);
                }
              }
            }
          }
        } catch (error: any) {
          if (error.message.includes('NOGROUP')) {
            logger.info('🔄 Recriando consumer group...');
            await this.createConsumerGroup();
          } else {
            logger.error('🔴 Erro ao ler mensagens do Redis:', error);
            await this.sleep(5000); // Aguardar 5 segundos antes de tentar novamente
          }
        }
      }
    } catch (error) {
      logger.error('🔴 Erro ao iniciar consumo de mensagens:', error);
      this.isConsuming = false;
    }
  }

  private async processMessage(message: any): Promise<void> {
    try {
      const messageData = message.message;
      
      // Converter dados do stream Redis para WhatsAppMessageEvent
      const whatsappMessage: WhatsAppMessageEvent = {
        sessionId: messageData.sessionId,
        messageId: messageData.messageId,
        fromUser: messageData.fromUser,
        toUser: messageData.toUser || undefined,
        timestamp: new Date(messageData.timestamp),
        messageType: messageData.messageType,
        content: messageData.content || undefined,
        mediaInfo: messageData.mediaInfo ? JSON.parse(messageData.mediaInfo) : undefined,
        originalMessage: JSON.parse(messageData.originalMessage),
        eventTimestamp: messageData.eventTimestamp,
        eventId: messageData.eventId
      };

      logger.info(`📥 Processando mensagem Redis:`, {
        eventId: whatsappMessage.eventId,
        messageType: whatsappMessage.messageType,
        fromUser: whatsappMessage.fromUser
      });

      // Chamar callback de processamento
      if (this.onMessageCallback) {
        await this.onMessageCallback(whatsappMessage);
      }

      // Confirmar processamento da mensagem
      await this.client?.xAck(this.streamName, this.consumerGroup, message.id);
      
      logger.info(`✅ Mensagem processada e confirmada: ${message.id}`);
    } catch (error) {
      logger.error('🔴 Erro ao processar mensagem:', error);
      
      // TODO: Implementar retry logic ou enviar para DLQ
      try {
        await this.client?.xAck(this.streamName, this.consumerGroup, message.id);
      } catch (ackError) {
        logger.error('🔴 Erro ao confirmar mensagem com falha:', ackError);
      }
    }
  }

  private async createConsumerGroup(): Promise<void> {
    try {
      if (!this.client) return;

      await this.client.xGroupCreate(this.streamName, this.consumerGroup, '0', {
        MKSTREAM: true
      });
      logger.info(`📊 Consumer group recriado: ${this.consumerGroup}`);
    } catch (error: any) {
      if (!error.message.includes('BUSYGROUP')) {
        logger.error('🔴 Erro ao recriar consumer group:', error);
      }
    }
  }

  async addMessageToStream(message: WhatsAppMessageEvent): Promise<string | null> {
    try {
      await this.connect();

      if (!this.client) {
        throw new Error('Cliente Redis não disponível');
      }

      const streamData = {
        sessionId: String(message.sessionId ?? ''),
        messageId: String(message.messageId ?? ''),
        fromUser: String(message.fromUser ?? ''),
        toUser: String(message.toUser ?? ''),
        timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : String(message.timestamp ?? ''),
        messageType: String(message.messageType ?? ''),
        content: String(message.content ?? ''),
        mediaInfo: message.mediaInfo ? JSON.stringify(message.mediaInfo) : '',
        originalMessage: message.originalMessage ? JSON.stringify(message.originalMessage) : '',
        eventTimestamp: String(message.eventTimestamp ?? ''),
        eventId: String(message.eventId ?? '')
      };

      const messageId = await this.client.xAdd(this.streamName, '*', streamData);
      
      logger.info(`📨 Mensagem adicionada ao stream Redis: ${messageId}`, {
        eventId: message.eventId,
        messageType: message.messageType
      });

      return messageId;
    } catch (error) {
      logger.error('🔴 Erro ao adicionar mensagem ao stream Redis:', error);
      return null;
    }
  }

  async stopConsuming(): Promise<void> {
    this.isConsuming = false;
    logger.info('🛑 Parando consumo de mensagens do Redis');
  }

  async disconnect(): Promise<void> {
    try {
      await this.stopConsuming();
      
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }
      
      this.isConnected = false;
      logger.info('🔌 RedisConsumer desconectado');
    } catch (error) {
      logger.error('🔴 Erro ao desconectar RedisConsumer:', error);
    }
  }

  async getStreamInfo(): Promise<any> {
    try {
      if (!this.client) return null;

      const info = await this.client.xInfoStream(this.streamName);
      return info;
    } catch (error) {
      logger.error('🔴 Erro ao obter informações do stream:', error);
      return null;
    }
  }

  async getConsumerGroupInfo(): Promise<any> {
    try {
      if (!this.client) return null;

      const groups = await this.client.xInfoGroups(this.streamName);
      return groups.find((group: any) => group.name === this.consumerGroup);
    } catch (error) {
      logger.error('🔴 Erro ao obter informações do consumer group:', error);
      return null;
    }
  }

  // Retorna as últimas mensagens do stream Redis
  public async getRecentMessages(limit: number = 20): Promise<any[]> {
    await this.connect();
    if (!this.client) return [];
    try {
      // XREVRANGE pega as últimas mensagens do stream
      const entries = await this.client.xRevRange(this.streamName, '+', '-', { COUNT: limit });
      // Converter para formato amigável
      return entries.map((entry: any) => {
        const id = entry.id || entry[0];
        const fields = entry.message || entry.fields || entry[1] || {};
        // Extrair o id correto do conteúdo salvo
        let realId = fields.messageId || fields.eventId || fields.id || id;
        const obj: any = { id: realId };
        for (const [key, value] of Object.entries(fields)) {
          try {
            obj[key] = JSON.parse(String(value));
          } catch {
            obj[key] = value;
          }
        }
        return obj;
      });
    } catch (err) {
      logger.error('Erro ao buscar mensagens recentes do Redis:', err);
      return [];
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getters para status
  get connected(): boolean {
    return this.isConnected;
  }

  get consuming(): boolean {
    return this.isConsuming;
  }

  // Permite definir dinamicamente o nome do stream
  public setStreamName(streamName: string) {
    this.streamName = streamName;
  }
} 