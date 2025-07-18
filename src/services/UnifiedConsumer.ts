import * as amqp from 'amqplib';
import { SessionManager } from './SessionManager';
import { MessageDatabase } from '../database/MessageDatabase';
import { WhatsAppMessageEvent, SendMessageCommand } from './UnifiedProducer';
import { EmpresaConfigManager } from '../config/EmpresaConfig';
import { rabbitMQConfig } from '../config/RabbitMQConfig';
import { RabbitMQErrorHandler, defaultErrorHandler } from '../utils/RabbitMQErrorHandler';
import { CircuitBreakerService } from './CircuitBreakerService';
import logger from '../utils/Logger';

// Interface para WebSocket server
interface IWebSocketServer {
  broadcastNewMessage(instanceId: string, message: any): void;
}

// Configurações de consumer
export interface ConsumerConfig {
  rabbitUrl?: string;
  prefetchCount?: number;
  maxRetries?: number;
  retryDelay?: number;
  dlqEnabled?: boolean;
}

// Handlers para diferentes tipos de mensagem
export interface MessageHandlers {
  onInstanceCreate?: (data: any) => Promise<void>;
  onInstanceDelete?: (data: any) => Promise<void>;
  onInstanceMessage?: (data: any) => Promise<void>;
  onSendCommand?: (command: SendMessageCommand) => Promise<void>;
  onWhatsAppMessage?: (message: WhatsAppMessageEvent) => Promise<void>;
}

export class UnifiedConsumer {
  private connection: any = null;
  private channel: any = null;
  private sessionManager: SessionManager;
  private messageDatabase?: MessageDatabase;
  private webSocketServer?: IWebSocketServer;
  private isRunning = false;
  private instanceId: string;
  private config: Required<ConsumerConfig>;
  private empresaConfig: EmpresaConfigManager;
  private errorHandler: RabbitMQErrorHandler;
  private circuitBreaker: CircuitBreakerService;

  // Filas que este consumer irá gerenciar
  private readonly queues = {
    sendCommands: 'whatsapp.send.commands',
    messageBridge: 'whatsapp.messages.bridge',
    instanceQueue: (instanceId: string) => `baileys.instance.queue.${instanceId}`
  };

  constructor(
    instanceId: string,
    sessionManager: SessionManager,
    config: ConsumerConfig = {},
    messageDatabase?: MessageDatabase,
    webSocketServer?: IWebSocketServer
  ) {
    this.instanceId = instanceId;
    this.sessionManager = sessionManager;
    this.messageDatabase = messageDatabase;
    this.webSocketServer = webSocketServer;
    this.empresaConfig = EmpresaConfigManager.getInstance();
    
    // Configurações padrão
    this.config = {
      rabbitUrl: rabbitMQConfig.url,
      prefetchCount: rabbitMQConfig.queues.prefetch,
      maxRetries: 3,
      retryDelay: 1000,
      dlqEnabled: true
    };

    this.errorHandler = new RabbitMQErrorHandler({
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      exponentialBackoff: true,
      dlqEnabled: this.config.dlqEnabled,
      logLevel: 'error'
    });

    // Circuit Breaker para RabbitMQ - 5 falhas, 30s de cooldown
    this.circuitBreaker = CircuitBreakerService.getInstance('RabbitMQ-Consumer', 5, 30000);
  }

  public async connect(): Promise<void> {
    try {
      if (this.connection && this.channel) {
        return; // Já conectado
      }

      logger.info(`🔗 UnifiedConsumer conectando ao RabbitMQ (Instance: ${this.instanceId})...`);
      
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

        // Configurar prefetch
        await this.channel.prefetch(rabbitMQConfig.queues.prefetch);

        // Declarar exchanges necessários
        await this.channel.assertExchange('baileys.events', 'topic', { durable: true });
        await this.channel.assertExchange('whatsapp.messages', 'topic', { durable: true });

        // Configurar DLQ se habilitado
        if (this.config.dlqEnabled) {
          await this.setupDeadLetterQueue();
        }

        // Declarar filas
        await this.setupQueues();

        // Configurar handlers de erro
        this.connection.on('error', (err: any) => {
          const errorAction = this.errorHandler.handleError(err, 'connection', 0);
          
          if (errorAction.action === 'reconnect') {
            logger.info(`🔄 Tentando reconectar em ${errorAction.delay}ms...`);
            setTimeout(() => this.reconnect(), errorAction.delay);
          } else {
            logger.error(`🔴 Erro na conexão RabbitMQ UnifiedConsumer (${this.instanceId}):`, err);
            this.connection = null;
            this.channel = null;
            this.isRunning = false;
          }
        });

        this.connection.on('close', () => {
          logger.info(`📴 Conexão RabbitMQ UnifiedConsumer fechada (${this.instanceId})`);
          this.connection = null;
          this.channel = null;
          this.isRunning = false;
        });

        logger.info(`✅ UnifiedConsumer conectado ao RabbitMQ (${this.instanceId})`);
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
      logger.error(`🔴 Erro ao conectar UnifiedConsumer (${this.instanceId}):`, error);
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    try {
      logger.info(`🔄 Reconectando UnifiedConsumer (${this.instanceId})...`);
      this.connection = null;
      this.channel = null;
      this.isRunning = false;
      await this.connect();
    } catch (error) {
      logger.error(`🔴 Erro ao reconectar UnifiedConsumer (${this.instanceId}):`, error);
    }
  }

  private async setupDeadLetterQueue(): Promise<void> {
    // Declarar exchange para DLQ
    await this.channel.assertExchange('baileys.dlx', 'direct', { durable: true });
    
    // Declarar fila de dead letter
    await this.channel.assertQueue('baileys.dead.letter', {
      durable: true,
      exclusive: false,
      autoDelete: false
    });

    // Bind DLQ ao exchange
    await this.channel.bindQueue('baileys.dead.letter', 'baileys.dlx', 'dead.letter');
  }

  private async setupQueues(): Promise<void> {
    const dlqArgs = this.config.dlqEnabled ? {
      'x-dead-letter-exchange': 'baileys.dlx',
      'x-dead-letter-routing-key': 'dead.letter'
    } : {};

    // Fila de comandos de envio (geral)
    await this.channel.assertQueue(this.queues.sendCommands, {
      durable: true,
      arguments: dlqArgs
    });

    // Criar filas das empresas automaticamente (se não existirem)
    await this.setupEmpresaQueues(dlqArgs);

    // Fila de bridge para mensagens WhatsApp
    await this.channel.assertQueue(this.queues.messageBridge, {
      durable: true,
      arguments: dlqArgs
    });

    // Fila específica da instância
    const instanceQueue = this.queues.instanceQueue(this.instanceId);
    await this.channel.assertQueue(instanceQueue, {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: dlqArgs
    });

    // Bind da fila da instância ao exchange
    await this.channel.bindQueue(instanceQueue, 'baileys.events', 'instance.create');
    await this.channel.bindQueue(instanceQueue, 'baileys.events', 'instance.delete');
    await this.channel.bindQueue(instanceQueue, 'baileys.events', `instance.${this.instanceId}.*`);
  }

  private async setupEmpresaQueues(dlqArgs: any): Promise<void> {
    try {
      logger.info('🏢 Verificando/criando filas das empresas...');
      
      const empresasAtivas = this.empresaConfig.getEmpresasAtivas();
      let filasExistentes = 0;
      let filasCriadas = 0;
      
      for (const { id: empresaId, info: empresaInfo } of empresasAtivas) {
        const filaEmpresa = this.empresaConfig.getFilaEmpresa(empresaId);
        
        if (!filaEmpresa) {
          logger.warn(`⚠️ Fila não configurada para empresa: ${empresaId}`);
          continue;
        }

        try {
          // Verificar se a fila já existe
          await this.channel.checkQueue(filaEmpresa);
          logger.info(`   ✅ Fila existe: ${filaEmpresa} (${empresaInfo.nome} - ${empresaInfo.numero})`);
          filasExistentes++;
        } catch (error) {
          // Fila não existe, criar
          await this.channel.assertQueue(filaEmpresa, {
            durable: true,
            arguments: dlqArgs
          });
          logger.info(`   🆕 Fila criada: ${filaEmpresa} (${empresaInfo.nome} - ${empresaInfo.numero})`);
          filasCriadas++;
        }
      }
      
      logger.info(`📊 Filas das empresas: ${filasExistentes} existentes, ${filasCriadas} criadas`);
      
    } catch (error) {
      logger.error('🔴 Erro ao configurar filas das empresas:', error);
      // Não fazer throw para não quebrar a inicialização do sistema
      logger.warn('⚠️ Continuando inicialização sem filas de empresas...');
    }
  }

  public async startConsuming(handlers: MessageHandlers = {}): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn(`⚠️ UnifiedConsumer já está em execução (${this.instanceId})`);
        return;
      }

      await this.connect();

      if (!this.channel) {
        throw new Error('Canal RabbitMQ não disponível');
      }

      // Inicializar MessageDatabase se fornecido
      if (this.messageDatabase) {
        await this.messageDatabase.initialize();
      }

      // Iniciar consumo das diferentes filas
      await this.startSendCommandsConsumer(handlers.onSendCommand);
      // await this.startEmpresaQueuesConsumer(handlers.onSendCommand); // Comentado para deixar mensagens na fila
      await this.startMessageBridgeConsumer(handlers.onWhatsAppMessage);
      await this.startInstanceQueueConsumer(handlers);

      this.isRunning = true;
      logger.info(`✅ UnifiedConsumer iniciado (${this.instanceId})`);
    } catch (error) {
      logger.error(`🔴 Erro ao iniciar UnifiedConsumer (${this.instanceId}):`, error);
      throw error;
    }
  }

  private async startSendCommandsConsumer(handler?: (command: SendMessageCommand) => Promise<void>): Promise<void> {
    await this.channel.consume(this.queues.sendCommands, async (msg: any) => {
      if (msg) {
        try {
          const command: SendMessageCommand = JSON.parse(msg.content.toString());
          logger.info(`📤 Processando comando de envio:`, {
            eventId: command.eventId,
            instanceId: command.instanceId,
            command: command.command
          });

          if (handler) {
            await handler(command);
          } else {
            // Handler padrão para envio de mensagem
            await this.handleSendMessage(command);
          }

          this.channel.ack(msg);
        } catch (error) {
          await this.handleMessageError(msg, error, 'send-command');
        }
      }
    });
  }

  private async startEmpresaQueuesConsumer(handler?: (command: SendMessageCommand) => Promise<void>): Promise<void> {
    const filasEmpresas = this.empresaConfig.getAllFilasEmpresas();
    
    for (const filaEmpresa of filasEmpresas) {
      await this.channel.consume(filaEmpresa, async (msg: any) => {
        if (msg) {
          try {
            const command: SendMessageCommand = JSON.parse(msg.content.toString());
            logger.info(`🏢 Processando comando empresa (${filaEmpresa}):`, {
              eventId: command.eventId,
              fila: filaEmpresa,
              command: command.command
            });

            if (handler) {
              await handler(command);
            } else {
              // Handler específico para empresas que resolve a instância correta
              await this.handleSendMessageEmpresa(command, filaEmpresa);
            }

            this.channel.ack(msg);
          } catch (error) {
            await this.handleMessageError(msg, error, `empresa-${filaEmpresa}`);
          }
        }
      });
      
      logger.info(`🎧 Consumindo fila de empresa: ${filaEmpresa}`);
    }
  }

  private async startMessageBridgeConsumer(handler?: (message: WhatsAppMessageEvent) => Promise<void>): Promise<void> {
    await this.channel.consume(this.queues.messageBridge, async (msg: any) => {
      if (msg) {
        try {
          const messageEvent: WhatsAppMessageEvent = JSON.parse(msg.content.toString());
          logger.info(`📥 Processando mensagem recebida:`, {
            eventId: messageEvent.eventId,
            sessionId: messageEvent.sessionId,
            messageType: messageEvent.messageType
          });

          if (handler) {
            await handler(messageEvent);
          } else {
            // Handler padrão para salvar mensagem
            await this.handleWhatsAppMessage(messageEvent);
          }

          this.channel.ack(msg);
        } catch (error) {
          await this.handleMessageError(msg, error, 'whatsapp-message');
        }
      }
    });
  }

  private async startInstanceQueueConsumer(handlers: MessageHandlers): Promise<void> {
    const instanceQueue = this.queues.instanceQueue(this.instanceId);
    
    await this.channel.consume(instanceQueue, async (msg: any) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          const routingKey = msg.fields.routingKey;

          logger.info(`📥 Evento de instância recebido (${this.instanceId}):`, { routingKey, content });

          switch (routingKey) {
            case 'instance.create':
              if (handlers.onInstanceCreate) {
                await handlers.onInstanceCreate(content);
              }
              break;
            
            case 'instance.delete':
              if (handlers.onInstanceDelete) {
                await handlers.onInstanceDelete(content);
              }
              break;
            
            default:
              if (routingKey.startsWith(`instance.${this.instanceId}.`) && handlers.onInstanceMessage) {
                await handlers.onInstanceMessage(content);
              }
              break;
          }

          this.channel.ack(msg);
        } catch (error) {
          await this.handleMessageError(msg, error, 'instance-event');
        }
      }
    }, { noAck: false });
  }

  private async handleSendMessage(command: SendMessageCommand): Promise<void> {
    try {
      const { payload } = command;
      // Buscar a única sessão ativa
      const activeSessionIds = this.sessionManager.getActiveSessionIds();
      if (activeSessionIds.length !== 1) {
        throw new Error(`Esperado exatamente 1 sessão ativa, mas há ${activeSessionIds.length}. IDs: ${activeSessionIds.join(', ')}`);
      }
      const sessionId = activeSessionIds[0];
      const session = this.sessionManager.getSession(sessionId);
      if (!session || !session.user) {
        throw new Error(`Sessão ativa ${sessionId} não encontrada ou não conectada`);
      }

      // O campo 'to' do payload é o número de destino
      const destinatario = payload.to;
      if (!destinatario) {
        throw new Error(`Campo 'to' do payload não informado!`);
      }

      logger.info(`📱 Enviando mensagem via sessão ativa:`, {
        sessionId,
        to: destinatario,
        type: payload.type || 'text',
        eventId: command.eventId
      });

      // Enviar mensagem usando a única sessão ativa
      const result = await this.sessionManager.sendMessage(sessionId, destinatario, payload.message);

      logger.info(`✅ Mensagem enviada via sessão ativa:`, {
        eventId: command.eventId,
        messageId: result.key?.id,
        to: destinatario
      });

    } catch (error) {
      logger.error(`🔴 Erro ao enviar mensagem via sessão ativa:`, {
        eventId: command.eventId,
        error: error.message
      });
      throw error;
    }
  }

  private async handleSendMessageEmpresa(command: SendMessageCommand, queueName: string): Promise<void> {
    try {
      // Resolver qual instância usar baseado na fila
      const numeroEmpresa = this.empresaConfig.resolverInstanciaParaFila(queueName);
      if (!numeroEmpresa) {
        throw new Error(`Não foi possível resolver instância para fila: ${queueName}`);
      }

      // Buscar sessão ativa com o número da empresa
      const activeSessionIds = this.sessionManager.getActiveSessionIds();
      let sessionIdEmpresa: string | null = null;

      // Tentar encontrar sessão que corresponde ao número da empresa
      for (const sessionId of activeSessionIds) {
        const session = this.sessionManager.getSession(sessionId);
        if (session?.user?.id) {
          // Extrair número do user.id (formato: "5515991957645:XX@s.whatsapp.net")
          const sessionNumber = session.user.id.split(":")[0].split("@")[0].replace(/[^0-9]/g, '');
          if (sessionNumber === numeroEmpresa) {
            sessionIdEmpresa = sessionId;
            break;
          }
        }
      }

      if (!sessionIdEmpresa) {
        throw new Error(`Sessão não encontrada para empresa ${numeroEmpresa}. Sessões ativas: ${activeSessionIds.join(', ')}`);
      }

      const { payload } = command;

      // Ignorar o campo payload.to e usar sempre o número da empresa
      const destinatario = numeroEmpresa;

      logger.info(`🏢 Enviando mensagem via empresa:`, {
        fila: queueName,
        numeroEmpresa,
        sessionId: sessionIdEmpresa,
        to: destinatario,
        type: payload.type || 'text',
        eventId: command.eventId
      });

      // Enviar mensagem usando a sessão da empresa
      const result = await this.sessionManager.sendMessage(sessionIdEmpresa, destinatario, payload.message);

      logger.info(`✅ Mensagem enviada via empresa:`, {
        fila: queueName,
        numeroEmpresa,
        sessionId: sessionIdEmpresa,
        eventId: command.eventId,
        messageId: result.key?.id,
        to: destinatario
      });

    } catch (error) {
      logger.error(`🔴 Erro ao enviar mensagem via empresa:`, {
        fila: queueName,
        eventId: command.eventId,
        error: error.message
      });
      throw error;
    }
  }

  private async handleWhatsAppMessage(messageEvent: WhatsAppMessageEvent): Promise<void> {
    try {
      if (this.messageDatabase) {
        const savedMessage = await this.messageDatabase.saveMessage(messageEvent);
        
        if (savedMessage) {
          logger.info(`💾 Mensagem salva no banco: ${savedMessage.id}`);
          
          // Broadcast para WebSocket se disponível
          if (this.webSocketServer) {
            this.webSocketServer.broadcastNewMessage(messageEvent.sessionId, savedMessage);
          }
        } else {
          logger.warn(`⚠️ Falha ao salvar mensagem no banco: ${messageEvent.eventId}`);
        }
      }
    } catch (error) {
      logger.error(`🔴 Erro ao processar mensagem WhatsApp:`, error);
      throw error;
    }
  }

  private async handleMessageError(msg: any, error: any, context: string): Promise<void> {
    const errorAction = this.errorHandler.handleError(error, context, 
      msg.properties?.headers?.['x-retry-count'] || 0);
    
    try {
      const retryCount = msg.properties?.headers?.['x-retry-count'] || 0;
      
      if (errorAction.action === 'retry' && retryCount < this.config.maxRetries) {
        // Incrementar contador de retry e reenviar
        const headers = {
          ...msg.properties?.headers,
          'x-retry-count': retryCount + 1,
          'x-error-message': error.message,
          'x-failed-at': new Date().toISOString(),
          'x-error-type': errorAction.errorInfo.type
        };

        // Reenviar com delay
        setTimeout(() => {
          this.channel.publish(
            'baileys.events',
            'message.retry',
            msg.content,
            { headers, persistent: true }
          );
        }, errorAction.delay);

        logger.info(`🔄 Mensagem reenviada (tentativa ${retryCount + 1}/${this.config.maxRetries}) em ${errorAction.delay}ms`);
        this.channel.ack(msg);
      } else if (errorAction.action === 'dlq' && this.config.dlqEnabled) {
        // Enviar para DLQ com informações detalhadas
        const headers = {
          ...msg.properties?.headers,
          'x-retry-count': retryCount,
          'x-error-message': error.message,
          'x-failed-at': new Date().toISOString(),
          'x-error-type': errorAction.errorInfo.type,
          'x-final-error': true
        };

        await this.channel.publish(
          'baileys.dlx',
          'dead.letter',
          msg.content,
          { headers, persistent: true }
        );
        
        logger.error(`💀 Mensagem enviada para DLQ após ${retryCount} tentativas`);
        this.channel.ack(msg);
      } else {
        logger.error(`🔴 Mensagem descartada após ${retryCount} tentativas (${context})`);
        this.channel.nack(msg, false, false);
      }
    } catch (dlqError) {
      logger.error(`🔴 Erro ao processar mensagem com erro (${context}):`, dlqError);
      this.channel.nack(msg, false, false);
    }
  }

  public async stop(): Promise<void> {
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
      
      logger.info(`📴 UnifiedConsumer parado (${this.instanceId})`);
    } catch (error) {
      logger.error(`🔴 Erro ao parar UnifiedConsumer (${this.instanceId}):`, error);
    }
  }

  public isActive(): boolean {
    return this.isRunning && this.connection && this.channel;
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  // Método para obter estatísticas
  public async getStats(): Promise<any> {
    try {
      if (!this.channel) {
        return {
          connected: false,
          instanceId: this.instanceId,
          status: 'disconnected'
        };
      }

      const stats: any = {
        connected: true,
        instanceId: this.instanceId,
        status: this.isRunning ? 'running' : 'stopped',
        queues: {}
      };

      // Verificar estatísticas das filas
      try {
        const sendCommandsInfo = await this.channel.checkQueue(this.queues.sendCommands);
        stats.queues.sendCommands = {
          name: this.queues.sendCommands,
          messageCount: sendCommandsInfo.messageCount,
          consumerCount: sendCommandsInfo.consumerCount
        };
      } catch (e) {
        stats.queues.sendCommands = { error: 'Queue not accessible' };
      }

      try {
        const messageBridgeInfo = await this.channel.checkQueue(this.queues.messageBridge);
        stats.queues.messageBridge = {
          name: this.queues.messageBridge,
          messageCount: messageBridgeInfo.messageCount,
          consumerCount: messageBridgeInfo.consumerCount
        };
      } catch (e) {
        stats.queues.messageBridge = { error: 'Queue not accessible' };
      }

      // Estatísticas do banco de dados se disponível
      if (this.messageDatabase) {
        stats.database = await this.messageDatabase.getStatistics();
      }

      return stats;
    } catch (error) {
      return {
        connected: false,
        instanceId: this.instanceId,
        status: 'error',
        error: error.message
      };
    }
  }
} 