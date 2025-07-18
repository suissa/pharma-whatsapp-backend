import * as amqp from 'amqplib';
import { proto } from '@whiskeysockets/baileys';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import logger from '../utils/Logger';

// Interfaces dos diferentes tipos de eventos
export interface BaileysEvent {
  action: string;
  instanceId: string;
  data: any;
}

export interface WhatsAppMessageEvent {
  sessionId: string;
  messageId: string;
  fromUser: string;
  toUser?: string;
  timestamp: Date;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'other';
  content?: string;
  mediaInfo?: {
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    downloaded?: boolean;
    filePath?: string;
  };
  originalMessage: proto.IWebMessageInfo;
  eventTimestamp: string;
  eventId: string;
}

export interface SendMessageCommand {
  command: 'send_message';
  instanceId: string;
  payload: {
    to: string;
    message: string;
    type?: 'text' | 'image' | 'video' | 'audio' | 'document';
  };
  timestamp: string;
  eventId: string;
  metadata?: {
    sender?: string;
    priority?: 'high' | 'medium' | 'low';
    originalQueue?: string;
    messageId?: string;
  };
}

// Configuração de exchanges e filas
export interface ExchangeConfig {
  name: string;
  type: 'topic' | 'direct' | 'fanout' | 'headers';
  durable: boolean;
}

export interface QueueConfig {
  name: string;
  routingKey?: string;
  durable: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
}

export class UnifiedProducer {
  private static instance: UnifiedProducer;
  private connection: any = null;
  private channel: any = null;
  private readonly url: string = rabbitMQConfig.url;

  // Configurações predefinidas dos exchanges
  private readonly exchanges: Record<string, ExchangeConfig> = {
    baileys: { name: 'baileys.events', type: 'topic', durable: true },
    whatsapp: { name: 'whatsapp.messages', type: 'topic', durable: true },
    commands: { name: 'whatsapp.commands', type: 'topic', durable: true }
  };

  // Configurações predefinidas das filas
  private readonly queues: Record<string, QueueConfig> = {
    'send-commands': { name: 'whatsapp.send.commands', durable: true },
    'message-bridge': { name: 'whatsapp.messages.bridge', durable: true }
  };

  private constructor(rabbitUrl: string = 'amqp://admin:admin123@localhost:5672') {
    this.url = rabbitUrl;
  }

  public static getInstance(rabbitUrl?: string): UnifiedProducer {
    if (!UnifiedProducer.instance) {
      UnifiedProducer.instance = new UnifiedProducer(rabbitUrl);
    }
    return UnifiedProducer.instance;
  }

  public async connect(): Promise<void> {
    try {
      if (!this.connection) {
        this.connection = await amqp.connect(this.url);
        logger.info('🔗 UnifiedProducer conectado ao RabbitMQ');

        this.connection.on('error', (err: any) => {
          logger.error('🔴 Erro na conexão RabbitMQ UnifiedProducer:', err);
          this.connection = null;
          this.channel = null;
        });

        this.connection.on('close', () => {
          logger.info('🔴 Conexão RabbitMQ UnifiedProducer fechada');
          this.connection = null;
          this.channel = null;
        });
      }

      if (!this.channel) {
        this.channel = await this.connection.createChannel();
        
        // Declarar todos os exchanges
        for (const exchange of Object.values(this.exchanges)) {
          await this.channel.assertExchange(exchange.name, exchange.type, {
            durable: exchange.durable
          });
        }

        // Declarar exchange para DLQ se necessário
        await this.channel.assertExchange('baileys.dlx', 'direct', { durable: true });
        
        // Argumentos para DLQ
        const dlqArgs = {
          'x-dead-letter-exchange': 'baileys.dlx',
          'x-dead-letter-routing-key': 'dead.letter'
        };

        // Declarar filas essenciais COM DLQ
        for (const queue of Object.values(this.queues)) {
          await this.channel.assertQueue(queue.name, {
            durable: queue.durable,
            exclusive: queue.exclusive || false,
            autoDelete: queue.autoDelete || false,
            arguments: dlqArgs
          });
        }

        // Bind filas aos exchanges
        await this.channel.bindQueue(
          this.queues['message-bridge'].name,
          this.exchanges.whatsapp.name,
          'message.received'
        );
      }
    } catch (error) {
      logger.error('🔴 Erro ao conectar UnifiedProducer:', error);
      throw error;
    }
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
      logger.info('🔌 UnifiedProducer desconectado');
    } catch (error) {
      logger.error('🔴 Erro ao desconectar UnifiedProducer:', error);
    }
  }

  // ========== MÉTODOS GERAIS ==========

  public async publishToExchange(
    exchangeName: string, 
    routingKey: string, 
    payload: any,
    options?: any
  ): Promise<boolean> {
    try {
      await this.connect();
      
      if (!this.channel) {
        throw new Error('Canal RabbitMQ não disponível');
      }

      const message = JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
        eventId: this.generateEventId()
      });

      const published = this.channel.publish(
        exchangeName,
        routingKey,
        Buffer.from(message),
        {
          persistent: true,
          messageId: this.generateEventId(),
          timestamp: Date.now(),
          ...options
        }
      );

      if (published) {
        logger.info(`📤 Evento enviado para ${exchangeName}:`, { routingKey, payload });
        return true;
      } else {
        logger.warn(`⚠️ Falha ao enviar para ${exchangeName}: ${routingKey}`);
        return false;
      }
    } catch (error) {
      logger.error('🔴 Erro ao publicar evento:', error);
      return false;
    }
  }

  public async sendToQueue(queueName: string, payload: any): Promise<boolean> {
    try {
      await this.connect();
      
      if (!this.channel) {
        throw new Error('Canal RabbitMQ não disponível');
      }

      const message = JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
        eventId: this.generateEventId()
      });

      const sent = this.channel.sendToQueue(
        queueName,
        Buffer.from(message),
        { persistent: true }
      );

      if (sent) {
        logger.info(`📤 Mensagem enviada para fila ${queueName}:`, payload);
        return true;
      } else {
        logger.warn(`⚠️ Falha ao enviar para fila ${queueName}`);
        return false;
      }
    } catch (error) {
      logger.error('🔴 Erro ao enviar para fila:', error);
      return false;
    }
  }

  // ========== MÉTODOS ESPECÍFICOS BAILEYS ==========

  public async publishBaileysEvent(routingKey: string, eventData: BaileysEvent): Promise<boolean> {
    return this.publishToExchange(this.exchanges.baileys.name, routingKey, eventData);
  }

  public async publishInstanceCreateEvent(instanceData: any): Promise<boolean> {
    return this.publishBaileysEvent('instance.create', {
      action: 'create',
      instanceId: instanceData.instanceId,
      data: instanceData
    });
  }

  public async publishInstanceDeleteEvent(instanceId: string): Promise<boolean> {
    return this.publishBaileysEvent('instance.delete', {
      action: 'delete',
      instanceId,
      data: { instanceId }
    });
  }

  // ========== MÉTODOS ESPECÍFICOS WHATSAPP ==========

  public async publishWhatsAppMessage(messageData: Omit<WhatsAppMessageEvent, 'eventTimestamp' | 'eventId'>): Promise<boolean> {
    const event: WhatsAppMessageEvent = {
      ...messageData,
      eventTimestamp: new Date().toISOString(),
      eventId: this.generateEventId()
    };

    return this.publishToExchange(
      this.exchanges.whatsapp.name,
      'message.received',
      event,
      {
        headers: {
          'message-type': event.messageType,
          'session-id': event.sessionId,
          'from-user': event.fromUser
        }
      }
    );
  }

  // ========== MÉTODOS ESPECÍFICOS COMANDOS ==========

  public async publishSendCommand(command: SendMessageCommand): Promise<boolean> {
    return this.sendToQueue(this.queues['send-commands'].name, command);
  }

  // Método de conveniência para API HTTP
  public async publishHttpSendRequest(queueName: string, message: any): Promise<boolean> {
    const command: SendMessageCommand = {
      command: 'send_message',
      instanceId: queueName,
      payload: {
        to: message.content?.substring(0, 20) || 'unknown',
        message: message.content || '',
        type: 'text'
      },
      timestamp: message.timestamp || new Date().toISOString(),
      eventId: message.id || this.generateEventId(),
      metadata: {
        sender: message.metadata?.sender,
        priority: message.metadata?.priority || 'medium',
        originalQueue: queueName,
        messageId: message.id
      }
    };

    return this.publishSendCommand(command);
  }

  // ========== UTILITÁRIOS ==========

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  // Método utilitário para extrair informações da mensagem do Baileys
  public static extractMessageInfo(message: proto.IWebMessageInfo): Partial<WhatsAppMessageEvent> {
    const messageContent = message.message;
    let messageType: WhatsAppMessageEvent['messageType'] = 'other';
    let content: string | undefined;
    let mediaInfo: WhatsAppMessageEvent['mediaInfo'] | undefined;

    if (!messageContent) {
      return { messageType: 'other' };
    }

    // Detectar tipo de mensagem e extrair conteúdo
    if (messageContent.conversation) {
      messageType = 'text';
      content = messageContent.conversation;
    } else if (messageContent.extendedTextMessage) {
      messageType = 'text';
      content = messageContent.extendedTextMessage.text;
    } else if (messageContent.imageMessage) {
      messageType = 'image';
      mediaInfo = {
        fileName: 'image',
        mimeType: messageContent.imageMessage.mimetype,
        fileSize: messageContent.imageMessage.fileLength ? parseInt(messageContent.imageMessage.fileLength.toString()) : undefined
      };
    } else if (messageContent.videoMessage) {
      messageType = 'video';
      mediaInfo = {
        fileName: 'video',
        mimeType: messageContent.videoMessage.mimetype,
        fileSize: messageContent.videoMessage.fileLength ? parseInt(messageContent.videoMessage.fileLength.toString()) : undefined
      };
    } else if (messageContent.audioMessage) {
      messageType = 'audio';
      mediaInfo = {
        fileName: 'audio',
        mimeType: messageContent.audioMessage.mimetype,
        fileSize: messageContent.audioMessage.fileLength ? parseInt(messageContent.audioMessage.fileLength.toString()) : undefined
      };
    } else if (messageContent.documentMessage) {
      messageType = 'document';
      mediaInfo = {
        fileName: messageContent.documentMessage.fileName || 'document',
        mimeType: messageContent.documentMessage.mimetype,
        fileSize: messageContent.documentMessage.fileLength ? parseInt(messageContent.documentMessage.fileLength.toString()) : undefined
      };
    } else if (messageContent.stickerMessage) {
      messageType = 'sticker';
      mediaInfo = {
        fileName: 'sticker',
        mimeType: messageContent.stickerMessage.mimetype,
        fileSize: messageContent.stickerMessage.fileLength ? parseInt(messageContent.stickerMessage.fileLength.toString()) : undefined
      };
    } else if (messageContent.locationMessage) {
      messageType = 'location';
      content = `Latitude: ${messageContent.locationMessage.degreesLatitude}, Longitude: ${messageContent.locationMessage.degreesLongitude}`;
    } else if (messageContent.contactMessage) {
      messageType = 'contact';
      content = messageContent.contactMessage.displayName || 'Contato compartilhado';
    }

    return {
      messageType,
      content,
      mediaInfo
    };
  }

  // ========== GETTERS PARA CONFIGURAÇÕES ==========

  public getExchanges(): Record<string, ExchangeConfig> {
    return { ...this.exchanges };
  }

  public getQueues(): Record<string, QueueConfig> {
    return { ...this.queues };
  }
} 