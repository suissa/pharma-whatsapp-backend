import WebSocket from 'ws';
import { SessionManager } from '../services/SessionManager';
import { UnifiedProducer } from '../services/UnifiedProducer';
import { WebSocketTracer } from '../telemetry/WebSocketTracer';
import logger from '../utils/Logger';

export interface WebSocketCommand {
  type: 'messages:list' | 'messages:send' | 'messages:update';
  instanceId: string;
  payload?: any;
}

export interface SendMessagePayload {
  to: string;
  message: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'document';
}

export class WebSocketServer {
  private wss: WebSocket.Server;
  private sessionManager: SessionManager;
  private sendMessageProducer: UnifiedProducer;
  private port: number;
  private connectedClients: Map<WebSocket, Set<string>> = new Map(); // WebSocket -> Set de instanceIds

  constructor(sessionManager: SessionManager, port: number = 8899) {
    this.sessionManager = sessionManager;
    this.port = port;
    this.sendMessageProducer = UnifiedProducer.getInstance();
    
    this.wss = new WebSocket.Server({ 
      port: this.port,
      perMessageDeflate: false
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientIp = request.socket.remoteAddress;
      logger.info(`🔌 Nova conexão WebSocket de: ${clientIp}`);

      // 🔧 Tracing da conexão
      const connectionSpan = WebSocketTracer.traceConnection(ws, request);

      // Inicializar rastreamento do cliente
      this.connectedClients.set(ws, new Set<string>());

      // Enviar mensagem de boas-vindas
      this.sendResponse(ws, {
        type: 'connection',
        success: true,
        message: 'Conectado ao servidor WebSocket',
        timestamp: new Date().toISOString()
      });

      // Finalizar span de conexão
      connectionSpan.end();

      // Configurar handlers de mensagem
      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const rawMessage = data.toString();
          
          // Verificar se é heartbeat
          if (rawMessage === 'ping') {
            logger.info('💓 Heartbeat recebido, enviando pong');
            
            // 🔧 Tracing do heartbeat
            const heartbeatSpan = WebSocketTracer.traceHeartbeat('ping');
            this.sendResponse(ws, {
              type: 'heartbeat',
              success: true,
              message: 'pong',
              timestamp: new Date().toISOString()
            });
            heartbeatSpan.end();
            return;
          }
          
          // 🔧 Tracing da mensagem recebida
          const messageSpan = WebSocketTracer.traceMessageReceived(rawMessage);
          await this.handleMessage(ws, data);
          messageSpan.end();
        } catch (error) {
          logger.error('🔴 Erro ao processar mensagem WebSocket:', error);
          WebSocketTracer.markError(error, 'Erro ao processar mensagem WebSocket');
          this.sendError(ws, 'Erro interno do servidor', error.message);
        }
      });

      // Handler de fechamento de conexão
      ws.on('close', (code: number, reason: string) => {
        logger.info(`📴 Conexão WebSocket fechada - Code: ${code}, Reason: ${reason}`);
        
        // 🔧 Tracing da desconexão
        const disconnectSpan = WebSocketTracer.traceDisconnection(code, reason);
        
        // Remover cliente da lista de conectados
        this.connectedClients.delete(ws);
        
        // Log adicional para debug
        if (code !== 1000) { // 1000 = fechamento normal
          logger.warn(`⚠️ Conexão fechada com código não padrão: ${code}`);
        }
        
        disconnectSpan.end();
      });

      // Handler de erro
      ws.on('error', (error: Error) => {
        logger.error('🔴 Erro na conexão WebSocket:', error);
        // Remover cliente da lista de conectados em caso de erro
        this.connectedClients.delete(ws);
      });
    });

    this.wss.on('error', (error: Error) => {
      logger.error('🔴 Erro no servidor WebSocket:', error);
    });
  }

  private async handleMessage(ws: WebSocket, data: WebSocket.Data): Promise<void> {
    try {
      const rawMessage = data.toString();
      logger.info(`📨 Mensagem WebSocket recebida: ${rawMessage}`);

      // Parsear comando
      const command = this.parseCommand(rawMessage);
      
      if (!command) {
        this.sendError(ws, 'Comando inválido', 'Formato esperado: {instanceID}:messages:list, {instanceID}:messages:send {payload} ou {instanceID}:messages:update');
        return;
      }

      logger.info(`🎯 Comando processado:`, command);

      // 🔧 Tracing do processamento de comando
      const commandSpan = WebSocketTracer.traceCommandProcessing(command.type, command.instanceId);

      // Processar comando baseado no tipo
      switch (command.type) {
        case 'messages:list':
          await this.handleListMessages(ws, command);
          break;
          
        case 'messages:send':
          await this.handleSendMessage(ws, command);
          break;
          
        case 'messages:update':
          await this.handleUpdateMessages(ws, command);
          break;
          
        default:
          this.sendError(ws, 'Comando não reconhecido', `Tipo de comando inválido: ${command.type}`);
      }

      commandSpan.end();
    } catch (error) {
      logger.error('🔴 Erro ao processar comando WebSocket:', error);
      WebSocketTracer.markError(error, 'Erro ao processar comando WebSocket');
      this.sendError(ws, 'Erro ao processar comando', error.message);
    }
  }

  private parseCommand(rawMessage: string): WebSocketCommand | null {
    try {
      // Formato esperado: {instanceID}:messages:list ou {instanceID}:messages:send {payload JSON}
      const messageTrim = rawMessage.trim();
      
      // Verificar se contém ":"
      if (!messageTrim.includes(':')) {
        return null;
      }

      // Usar regex para extrair instanceId e comando de forma mais robusta
      const commandRegex = /^([^:]+):(messages):(list|send|update)(.*)$/;
      const match = messageTrim.match(commandRegex);
      
      if (!match) {
        return null;
      }

      const [, instanceId, prefix, action, remainder] = match;
      const commandType = `${prefix}:${action}`;

      // Verificar se é comando válido
      if (commandType === 'messages:list') {
        return {
          type: 'messages:list',
          instanceId
        };
      } else if (commandType === 'messages:send') {
        // O remainder contém o payload (pode estar vazio ou com espaços)
        const payloadString = remainder.trim();
        
        if (!payloadString) {
          throw new Error('Payload obrigatório para comando messages:send');
        }

        const payload = JSON.parse(payloadString);
        
        // Validar payload mínimo
        if (!payload.to || !payload.message) {
          throw new Error('Payload deve conter "to" e "message"');
        }
        
        return {
          type: 'messages:send',
          instanceId,
          payload
        };
      } else if (commandType === 'messages:update') {
        return {
          type: 'messages:update',
          instanceId
        };
      }

      return null;
    } catch (error) {
      logger.error('🔴 Erro ao parsear comando:', error);
      return null;
    }
  }

  private async handleListMessages(ws: WebSocket, command: WebSocketCommand): Promise<void> {
    try {
      logger.info(`📋 Buscando mensagens para instância: ${command.instanceId}`);
      
      // Verificar se a sessão existe e está ativa
      const session = this.sessionManager.getSession(command.instanceId);
      if (!session) {
        logger.warn(`⚠️ Sessão ${command.instanceId} não encontrada ou não ativa`);
        this.sendResponse(ws, {
          type: 'messages:list',
          success: true,
          instanceId: command.instanceId,
          messages: [],
          count: 0,
          info: 'Sessão não encontrada ou não ativa',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Registrar que este cliente está interessado nesta instância
      const clientInstances = this.connectedClients.get(ws);
      if (clientInstances) {
        clientInstances.add(command.instanceId);
      }
      
      // Buscar mensagens da instância no banco de dados
      const messages = await this.sessionManager.messageDatabase.getMessagesBySession(command.instanceId);
      
      this.sendResponse(ws, {
        type: 'messages:list',
        success: true,
        instanceId: command.instanceId,
        messages: messages,
        count: messages.length,
        timestamp: new Date().toISOString()
      });

      logger.info(`✅ Enviadas ${messages.length} mensagens para WebSocket`);
    } catch (error) {
      logger.error('🔴 Erro ao buscar mensagens:', error);
      this.sendError(ws, 'Erro ao buscar mensagens', error.message);
    }
  }

  private async handleSendMessage(ws: WebSocket, command: WebSocketCommand): Promise<void> {
    try {
      logger.info(`📤 Processando envio de mensagem para instância: ${command.instanceId}`);
      
      const payload = command.payload as SendMessagePayload;
      
      // Validar payload
      if (!payload || !payload.to || !payload.message) {
        this.sendError(ws, 'Payload inválido', 'Campos obrigatórios: to, message');
        return;
      }

      // Verificar se a sessão existe
      const session = this.sessionManager.getSession(command.instanceId);
      if (!session || !session.user) {
        this.sendError(ws, 'Sessão não encontrada', `Instância ${command.instanceId} não está conectada`);
        return;
      }

      // Criar evento de envio de mensagem para RabbitMQ
      const sendEvent = {
        command: 'send_message',
        instanceId: command.instanceId,
        payload: {
          to: payload.to,
          message: payload.message,
          type: payload.type || 'text'
        },
        timestamp: new Date().toISOString(),
        eventId: this.generateEventId()
      };

      // Enviar para RabbitMQ (fila de comandos de envio)
      await this.sendMessageProducer.connect();
      const published = await this.publishSendCommand(sendEvent);

      if (published) {
        this.sendResponse(ws, {
          type: 'messages:send',
          success: true,
          instanceId: command.instanceId,
          eventId: sendEvent.eventId,
          message: 'Comando de envio processado e enviado para fila',
          payload: sendEvent.payload,
          timestamp: new Date().toISOString()
        });

        logger.info(`✅ Comando de envio enviado para RabbitMQ: ${sendEvent.eventId}`);
      } else {
        this.sendError(ws, 'Falha ao enviar comando', 'Não foi possível enviar comando para fila RabbitMQ');
      }
    } catch (error) {
      logger.error('🔴 Erro ao processar envio de mensagem:', error);
      this.sendError(ws, 'Erro ao processar envio', error.message);
    }
  }

  private async handleUpdateMessages(ws: WebSocket, command: WebSocketCommand): Promise<void> {
    try {
      logger.info(`🔄 Buscando última mensagem para instância: ${command.instanceId}`);
      
      // Verificar se a sessão existe e está ativa
      const session = this.sessionManager.getSession(command.instanceId);
      if (!session) {
        logger.warn(`⚠️ Sessão ${command.instanceId} não encontrada ou não ativa`);
        this.sendResponse(ws, {
          type: 'messages:update',
          success: true,
          instanceId: command.instanceId,
          message: null,
          info: 'Sessão não encontrada ou não ativa',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Registrar que este cliente está interessado nesta instância
      const clientInstances = this.connectedClients.get(ws);
      if (clientInstances) {
        clientInstances.add(command.instanceId);
      }
      
      // Buscar a última mensagem da instância no banco de dados
      const latestMessage = await this.sessionManager.messageDatabase.getLatestMessage(command.instanceId);
      
      if (latestMessage) {
        this.sendResponse(ws, {
          type: 'messages:update',
          success: true,
          instanceId: command.instanceId,
          message: latestMessage,
          timestamp: new Date().toISOString()
        });

        logger.info(`✅ Última mensagem enviada para WebSocket: ${latestMessage.id}`);
      } else {
        this.sendResponse(ws, {
          type: 'messages:update',
          success: true,
          instanceId: command.instanceId,
          message: null,
          info: 'Nenhuma mensagem encontrada para esta instância',
          timestamp: new Date().toISOString()
        });

        logger.info(`ℹ️ Nenhuma mensagem encontrada para instância: ${command.instanceId}`);
      }
    } catch (error) {
      logger.error('🔴 Erro ao buscar última mensagem:', error);
      this.sendError(ws, 'Erro ao buscar última mensagem', error.message);
    }
  }

  private async publishSendCommand(sendEvent: any): Promise<boolean> {
    try {
      // Usar channel do MessageProducer para enviar comando para fila específica
      const channel = this.sendMessageProducer['channel'];
      
      if (!channel) {
        await this.sendMessageProducer.connect();
      }

      // Declarar exchange para DLQ se necessário
      await channel.assertExchange('baileys.dlx', 'direct', { durable: true });
      
      // Declarar fila para comandos de envio COM DLQ
      const queueName = 'whatsapp.send.commands';
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'baileys.dlx',
          'x-dead-letter-routing-key': 'dead.letter'
        }
      });

      const message = JSON.stringify(sendEvent);
      
      const published = channel.sendToQueue(
        queueName,
        Buffer.from(message),
        {
          persistent: true,
          messageId: sendEvent.eventId,
          timestamp: Date.now(),
          headers: {
            'command': sendEvent.command,
            'instance-id': sendEvent.instanceId
          }
        }
      );

      return published;
    } catch (error) {
      logger.error('🔴 Erro ao publicar comando de envio:', error);
      return false;
    }
  }

  private sendResponse(ws: WebSocket, response: any): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const responseString = JSON.stringify(response);
        ws.send(responseString);
        logger.info(`📤 Resposta enviada: ${response.type || 'unknown'}`);
      } else {
        logger.warn(`⚠️ Tentativa de enviar resposta para WebSocket não aberto. Estado: ${ws.readyState}`);
      }
    } catch (error) {
      logger.error('🔴 Erro ao enviar resposta WebSocket:', error);
      // Remover cliente da lista se não conseguir enviar
      this.connectedClients.delete(ws);
    }
  }

  private sendError(ws: WebSocket, message: string, details?: string): void {
    this.sendResponse(ws, {
      type: 'error',
      success: false,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  private generateEventId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `ws_${timestamp}_${random}`;
  }

  public start(): void {
    logger.info(`🚀 Servidor WebSocket iniciado na porta ${this.port}`);
    logger.info(`🔌 Pronto para receber conexões em ws://localhost:${this.port}`);
    logger.info(`📋 Comandos suportados:`);
    logger.info(`   - {instanceID}:messages:list`);
    logger.info(`   - {instanceID}:messages:send {"to":"number","message":"text"}`);
    logger.info(`   - {instanceID}:messages:update`);
  }

  // ✅ CORRIGIDO: Método para notificar clientes sobre nova mensagem
  public broadcastNewMessage(instanceId: string, message: any): void {
    logger.info(`📢 Broadcasting nova mensagem para instância: ${instanceId}`);
    
    let notifiedClients = 0;
    
    // Percorrer todos os clientes conectados
    this.connectedClients.forEach((instanceIds, ws) => {
      // Verificar se o cliente está interessado nesta instância
      if (instanceIds.has(instanceId) && ws.readyState === WebSocket.OPEN) {
        try {
          // ✅ CORREÇÃO: Verificar se message não é null antes de enviar
          if (message && message.messageId) {
            this.sendResponse(ws, {
              type: 'messages:update',
              success: true,
              instanceId: instanceId,
              message: message,
              isNewMessage: true, // Flag para indicar que é uma nova mensagem
              timestamp: new Date().toISOString()
            });
            notifiedClients++;
          } else {
            logger.warn(`⚠️ Mensagem inválida para broadcast:`, message);
          }
        } catch (error) {
          logger.error('🔴 Erro ao enviar broadcast para cliente:', error);
        }
      }
    });
    
    logger.info(`✅ ${notifiedClients} clientes notificados sobre nova mensagem`);
  }

  public stop(): void {
    this.wss.close(() => {
      logger.info('🛑 Servidor WebSocket parado');
    });
  }

  public getConnectedClients(): number {
    return this.wss.clients.size;
  }
}