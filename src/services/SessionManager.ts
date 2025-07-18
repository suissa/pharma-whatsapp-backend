import makeWASocket, { 
  useMultiFileAuthState, 
  WASocket, 
  ConnectionState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto
} from '@whiskeysockets/baileys';
import { SessionTracer } from '../telemetry/SessionTracer';
// import makeInMemoryStore from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import MAIN_LOGGER from '@whiskeysockets/baileys/lib/Utils/logger';
import { MediaManager } from './MediaManager';
import { UnifiedProducer } from './UnifiedProducer';
import { MessageDatabaseConsumer } from './MessageDatabaseConsumer';
import { OpenAIService, AIResponse, MessageContext } from './OpenAIService';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import { RateLimiter } from '../utils/RateLimiter';
import { CircuitBreakerService } from './CircuitBreakerService';
import { MessageLogger, MessageLogEntry } from './MessageLogger';
import winstonLogger from '../utils/Logger';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });


const logger = MAIN_LOGGER.child({});
logger.level = 'info';

export interface SessionInfo {
  sessionId: string;
  status: 'connected' | 'connecting' | 'disconnected';
  user: any;
}

export class SessionManager {
  private activeSessions = new Map<string, WASocket>();
  private qrCodes = new Map<string, string>(); // Armazenar QR Codes por sessão
  private mediaManager: MediaManager;
  private messageDatabaseConsumer: MessageDatabaseConsumer;
  private openAIService: OpenAIService;
  private sessionRetryCount = new Map<string, number>();
  private maxRetries = 3;
  private retryDelays = [5000, 10000, 30000]; // Delays crescentes
  private rateLimiter: RateLimiter;
  private sendMessageCircuitBreaker: CircuitBreakerService;
  private messageLogger: MessageLogger;

  // Palavras-chave para ativar o processamento de IA
  private readonly AI_KEYWORDS = ['remédio', 'preço', 'pharma', 'medicamento', 'farmacia', 'farmacêutico'];

  constructor() {
    // Inicializar MediaManager
    this.mediaManager = new MediaManager('./downloads');
    
    // Inicializar MessageDatabaseConsumer (sem WebSocketServer por enquanto)
    this.messageDatabaseConsumer = new MessageDatabaseConsumer();
    
    // Inicializar OpenAI Service
    this.openAIService = new OpenAIService();
    
    // Inicializar Rate Limiter
    this.rateLimiter = RateLimiter.getInstance();
    
    // Circuit Breaker para envio de mensagens - 3 falhas, 45s de cooldown
    this.sendMessageCircuitBreaker = CircuitBreakerService.getInstance('SessionManager-Send', 3, 45000);
    
    // Inicializar MessageLogger
    this.messageLogger = MessageLogger.getInstance();
    
    // Limpeza automática a cada 5 minutos
    setInterval(() => {
      this.rateLimiter.cleanup();
    }, 5 * 60 * 1000);

    winstonLogger.info('🔍 Inicializando sessões existentes...');
    // Auto-inicializar sessão euhueue
    this.initializeExistingSessions();
  }

  // Método para configurar WebSocketServer depois da inicialização
  public setWebSocketServer(webSocketServer: any): void {
    // Recriar MessageDatabaseConsumer com a referência do WebSocketServer
    this.messageDatabaseConsumer = new MessageDatabaseConsumer(
      'amqp://admin:admin123@localhost:5672',
      './data/messages',
      webSocketServer
    );
    
    // Reinicializar o consumer
    this.initializeMessageDatabaseConsumer();
    winstonLogger.info('✅ WebSocketServer conectado ao MessageDatabaseConsumer para broadcasting');
  }

  private async initializeMessageDatabaseConsumer(): Promise<void> {
    try {
      winstonLogger.info('🌉 Inicializando sistema de mensageria...');
      // Garantir filas das empresas antes de inicializar o consumer
      await this.garantirFilasEmpresasRabbitMQ();
      await this.messageDatabaseConsumer.initialize();
      await this.messageDatabaseConsumer.start();
      winstonLogger.info('✅ Sistema de mensageria ativo: RabbitMQ → Banco');
    } catch (error) {
      winstonLogger.error('🔴 Erro ao inicializar sistema de mensageria:', error);
    }
  }

  // Função utilitária para garantir as filas das empresas
  private async garantirFilasEmpresasRabbitMQ(): Promise<void> {
    const { EmpresaConfigManager } = await import('../config/EmpresaConfig');
    const amqp = await import('amqplib');
    const { rabbitMQConfig } = await import('../config/RabbitMQConfig');
    const empresaConfig = EmpresaConfigManager.getInstance();
    const empresas = empresaConfig.getEmpresasAtivas();
    winstonLogger.info('🔎 Empresas ativas encontradas:', empresas.map(e => e.id));
    const connection = await amqp.connect(rabbitMQConfig.url);
    const channel = await connection.createChannel();
    const dlqArgs = {
      'x-dead-letter-exchange': 'baileys.dlx',
      'x-dead-letter-routing-key': 'dead.letter'
    };
    for (const { id: empresaId } of empresas) {
      const filaEmpresa = empresaConfig.getFilaEmpresa(empresaId);
      winstonLogger.info(`🔎 Processando empresa: ${empresaId} | Fila: ${filaEmpresa}`);
      if (filaEmpresa) {
        await channel.assertQueue(filaEmpresa, {
          durable: true,
          arguments: dlqArgs
        });
        winstonLogger.info(`✅ Fila garantida: ${filaEmpresa}`);
      } else {
        winstonLogger.warn(`⚠️ Fila não encontrada para empresa: ${empresaId}`);
      }
    }
    await channel.close();
    await connection.close();
  }

  
  async initializeExistingSessions() {
    try {
      const files = readdirSync(process.cwd());
      const sessionIds = files
        .filter(f => f.startsWith('baileys_auth_info_') && statSync(join(process.cwd(), f)).isDirectory())
        .map(f => f.replace('baileys_auth_info_', ''));
      
      winstonLogger.info(`🔍 Encontradas ${sessionIds.length} sessões existentes:`, sessionIds);
      
      // 🔧 Tracing da inicialização
      const initSpan = SessionTracer.traceSessionInitialization(sessionIds.length);
      
      if (sessionIds.length === 0) {
        winstonLogger.info('ℹ️ Nenhuma sessão existente encontrada. O servidor iniciará sem sessões ativas.');
        winstonLogger.info('ℹ️ Para conectar uma sessão, use a API de criação de sessão.');
      }
      
      for (const sessionId of sessionIds) {
        try {
          await this.createSession(sessionId);
        } catch (error) {
          winstonLogger.error(`🔴 Erro ao inicializar sessão ${sessionId}:`, error);
          SessionTracer.markError(error, `Erro ao inicializar sessão ${sessionId}`);
        }
      }
      
      winstonLogger.info(`✅ Inicialização de sessões concluída. Sessões ativas: ${this.activeSessions.size}`);
      initSpan.end();
    } catch (err) {
      winstonLogger.error('🔴 Erro ao inicializar sessões existentes:', err);
      SessionTracer.markError(err as Error, 'Erro ao inicializar sessões existentes');
    }
  }

  async createSession(sessionId: string): Promise<WASocket> {
    try {
      winstonLogger.info(`🔄 Criando sessão: ${sessionId}`);
      
      // 🔧 Tracing da criação de sessão
      const creationSpan = SessionTracer.traceSessionCreation(sessionId);
      
      // Usar useMultiFileAuthState
      const { state, saveCreds } = await useMultiFileAuthState(`baileys_auth_info_${sessionId}`);
      
      // Criar store para salvar mensagens
      // const store = makeInMemoryStore({ logger });
      // store?.readFromFile(`./baileys_store_${sessionId}.json`);
      
      // Salvar store a cada 10 segundos
      // setInterval(() => {
      //   store?.writeToFile(`./baileys_store_${sessionId}.json`);
      // }, 10000);

      // Buscar última versão do WhatsApp Web
      const { version, isLatest } = await fetchLatestBaileysVersion();
      winstonLogger.info(`📱 Usando WA v${version.join('.')}, isLatest: ${isLatest} para sessão: ${sessionId}`);

      // Criar socket
      const socket = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
          // if (store) {
          //   const msg = await store.loadMessage(key.remoteJid!, key.id!);
          //   return msg?.message || undefined;
          // }
          return undefined;
        },
      });

      // Bind store ao socket
      // store?.bind(socket.ev);

      this.setupEventHandlers(socket, sessionId, saveCreds);
      
      this.activeSessions.set(sessionId, socket);
      
      // Finalizar span de criação
      creationSpan.end();
      
      return socket;
      
    } catch (error) {
      winstonLogger.error(`🔴 Erro ao criar sessão ${sessionId}:`, error);
      SessionTracer.markError(error, `Erro ao criar sessão ${sessionId}`);
      throw error;
    }
  }

  private setupEventHandlers(socket: WASocket, sessionId: string, saveCreds: () => void): void {
    // Event handlers
    socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;
      
      // 🚨 CAPTURAR QR CODE
      if (qr) {
        winstonLogger.info(`📱 QR Code gerado para sessão ${sessionId}: ${qr}`);
        this.qrCodes.set(sessionId, qr);
      }
      
      if (connection === 'close') {
        const error = lastDisconnect?.error as Boom;
        const statusCode = error?.output?.statusCode;
        const errorMessage = error?.output?.payload?.message || error?.message;
        
        winstonLogger.error(`🚨 Sessão ${sessionId}: conexão fechada`, {
          statusCode,
          errorMessage,
          error: error?.message
        });

        // Tratamento específico para erro 440 (Stream Errored - conflict)
        if (statusCode === 440) {
          winstonLogger.error(`🚨 Erro 440 detectado para sessão ${sessionId}: Stream Errored (conflict)`);
          this.handleStreamConflict(sessionId);
          return;
        }

        // Tratamento para outros erros
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        winstonLogger.info(`Sessão ${sessionId}: reconectando:`, shouldReconnect);
        
        if (shouldReconnect) {
          this.scheduleReconnect(sessionId);
        } else {
          this.activeSessions.delete(sessionId);
          this.sessionRetryCount.delete(sessionId);
        }
      } else if (connection === 'open') {
        winstonLogger.info(`✅ Sessão ${sessionId}: conexão aberta`);
        winstonLogger.info(`👤 Usuário conectado:`, socket.user);
        // Limpar QR Code e contador de retry quando conectado
        this.qrCodes.delete(sessionId);
        this.sessionRetryCount.delete(sessionId);
      }
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
      winstonLogger.info(`📨 Sessão ${sessionId}: recebido ${chats.length} chats, ${contacts.length} contatos, ${messages.length} msgs (is latest: ${isLatest})`);
    });

    socket.ev.on('messages.upsert', async (upsert) => {
      try {
        // Processar mensagens recebidas (notify) e enviadas pelo usuário (append)
        if (upsert.type !== 'notify' && upsert.type !== 'append') {
          // Ignorar apenas outros tipos como 'prepend' (histórico antigo)
          winstonLogger.info(`⏩ Ignorando mensagens do tipo: ${upsert.type}`);
          return;
        }
        
        const messageDirection = upsert.type === 'notify' ? 'recebida' : 'enviada';
        winstonLogger.info(`📩 Sessão ${sessionId}: nova mensagem ${messageDirection}`);
        
        // Processar cada mensagem
        for (const message of upsert.messages) {
          // Ignorar mensagens de status@broadcast
          if (message.key.remoteJid === 'status@broadcast') {
            winstonLogger.info('⏩ Ignorando mensagem de status@broadcast');
            continue;
          }
          
          // Log básico da mensagem
          const direction = message.key.fromMe ? '(enviada por mim)' : '(recebida)';
          winstonLogger.info(`📨 Mensagem de: ${message.key.remoteJid}, ID: ${message.key.id} ${direction}`);
          
          // Extrair informações da mensagem para o evento
          const messageInfo = UnifiedProducer.extractMessageInfo(message);
          
          // Verificar se tem mídia e baixar automaticamente (se habilitado)
          let downloadedMediaInfo = null;
          if (message.message && this.autoDownloadEnabled) {
            downloadedMediaInfo = await this.mediaManager.processMessage(socket, sessionId, message);
            if (downloadedMediaInfo) {
              winstonLogger.info(`🔽 Mídia baixada: ${downloadedMediaInfo.mediaType} - ${downloadedMediaInfo.fileName}`);
              winstonLogger.info(`📁 Salvo em: ${downloadedMediaInfo.filePath}`);
            }
          }
          
          // 🤖 PROCESSAMENTO DE IA - Verificar se a mensagem contém palavras-chave
          if (!message.key.fromMe && messageInfo.content) {
            winstonLogger.debug(`🤖 [DEBUG] Verificando mensagem para IA: "${messageInfo.content}"`);
            winstonLogger.debug(`🤖 [DEBUG] fromMe: ${message.key.fromMe}`);
            winstonLogger.debug(`🤖 [DEBUG] content: ${messageInfo.content}`);
            
            const shouldProcessWithAI = this.shouldProcessWithAI(messageInfo.content);
            
            if (shouldProcessWithAI) {
              winstonLogger.debug(`🤖 [DEBUG] Palavra-chave detectada! Processando com IA: "${messageInfo.content}"`);
              
              try {
                const aiResponse = await this.processMessageWithAI(sessionId, message, messageInfo);
                if (aiResponse.blocked) {
                  winstonLogger.warn(`⚠️ [DEBUG] Mensagem bloqueada para ${message.key.remoteJid}: ${aiResponse.reason}`);
                  return;
                }
                    
                if (aiResponse.success && aiResponse.response) {
                  // Enviar resposta da IA automaticamente
                  const recipient = message.key.remoteJid;
                  await this.sendMessage(sessionId, recipient, aiResponse.response);
                  
                  winstonLogger.info(`✅ [DEBUG] Resposta da IA enviada automaticamente para ${recipient}`);
                  winstonLogger.debug(`📊 [DEBUG] Uso de tokens: ${JSON.stringify(aiResponse.usage)}`);
                } else {
                  winstonLogger.warn(`⚠️ [DEBUG] Falha no processamento de IA: ${aiResponse.error}`);
                }
              } catch (aiError) {
                winstonLogger.error(`🔴 [DEBUG] Erro ao processar mensagem com IA:`, aiError);
              }
            } else {
              winstonLogger.debug(`🤖 [DEBUG] Mensagem não contém palavras-chave, ignorando IA`);
            }
          } else {
            winstonLogger.debug(`🤖 [DEBUG] Mensagem não elegível para IA: fromMe=${message.key.fromMe}, content=${!!messageInfo.content}`);
          }
          
          // Criar evento de mensagem para o sistema de mensageria
          const messageEvent = {
            sessionId,
            messageId: message.key.id || 'unknown',
            fromUser: message.key.remoteJid || 'unknown',
            toUser: message.key.fromMe ? message.key.remoteJid : undefined, // Se foi enviada por mim, definir destinatário
            timestamp: new Date((message.messageTimestamp as number) * 1000),
            messageType: messageInfo.messageType || 'other',
            content: messageInfo.content,
            mediaInfo: downloadedMediaInfo ? {
              fileName: downloadedMediaInfo.fileName,
              filePath: downloadedMediaInfo.filePath,
              mimeType: downloadedMediaInfo.mimeType,
              fileSize: downloadedMediaInfo.fileSize,
              mediaType: downloadedMediaInfo.mediaType,
              downloaded: true,
              // URL pública para acessar a imagem no servidor de mídia dedicado
              publicUrl: `http://localhost:3001/media/${encodeURIComponent(downloadedMediaInfo.fileName)}`
            } : messageInfo.mediaInfo,
            originalMessage: message
          };

          // Enviar para o fluxo RabbitMQ → Banco
          try {
            const messageProducer = UnifiedProducer.getInstance();
            const published = await messageProducer.publishWhatsAppMessage(messageEvent);
            if (published) {
              winstonLogger.info(`📤 Mensagem enviada para sistema de mensageria: ${messageEvent.messageId}`);
            } else {
              winstonLogger.warn(`⚠️ Falha ao enviar mensagem para sistema de mensageria: ${messageEvent.messageId}`);
            }
          } catch (messagingError) {
            winstonLogger.error(`🔴 Erro no sistema de mensageria:`, messagingError);
          }
          
          // Log adicional se mídia foi baixada
          if (downloadedMediaInfo) {
            winstonLogger.info(`📊 Tamanho: ${(downloadedMediaInfo.fileSize! / 1024 / 1024).toFixed(2)} MB`);
          }
        }
      } catch (error) {
        winstonLogger.error(`🔴 Erro ao processar mensagens da sessão ${sessionId}:`, error);
      }
    });
  }

  /**
   * Trata especificamente o erro 440 (Stream Errored - conflict)
   */
  private async handleStreamConflict(sessionId: string): Promise<void> {
    const retryCount = this.sessionRetryCount.get(sessionId) || 0;
    
    winstonLogger.info(`🔄 Tentativa ${retryCount + 1}/${this.maxRetries} para resolver conflito de stream na sessão ${sessionId}`);
    
    if (retryCount >= this.maxRetries) {
      winstonLogger.error(`🔴 Máximo de tentativas atingido para sessão ${sessionId}. Removendo sessão.`);
      this.activeSessions.delete(sessionId);
      this.sessionRetryCount.delete(sessionId);
      return;
    }

    // Incrementar contador de retry
    this.sessionRetryCount.set(sessionId, retryCount + 1);

    // Remover sessão atual
    this.activeSessions.delete(sessionId);

    // Delay crescente baseado no número de tentativas
    const delay = this.retryDelays[Math.min(retryCount, this.retryDelays.length - 1)];
    
    winstonLogger.info(`⏰ Aguardando ${delay}ms antes de tentar reconectar sessão ${sessionId}...`);
    
    setTimeout(async () => {
      try {
        winstonLogger.info(`🔄 Tentando recriar sessão ${sessionId} após conflito de stream...`);
        await this.createSession(sessionId);
      } catch (error) {
        winstonLogger.error(`🔴 Erro ao recriar sessão ${sessionId} após conflito:`, error);
        // Tentar novamente se ainda não atingiu o máximo
        if (retryCount + 1 < this.maxRetries) {
          this.handleStreamConflict(sessionId);
        }
      }
    }, delay);
  }

  /**
   * Agenda reconexão com delay crescente
   */
  private scheduleReconnect(sessionId: string): void {
    const retryCount = this.sessionRetryCount.get(sessionId) || 0;
    
    if (retryCount >= this.maxRetries) {
      winstonLogger.error(`🔴 Máximo de tentativas atingido para sessão ${sessionId}`);
      this.activeSessions.delete(sessionId);
      this.sessionRetryCount.delete(sessionId);
      return;
    }

    // Incrementar contador de retry
    this.sessionRetryCount.set(sessionId, retryCount + 1);

    // Delay crescente
    const delay = this.retryDelays[Math.min(retryCount, this.retryDelays.length - 1)];
    
    winstonLogger.info(`⏰ Agendando reconexão da sessão ${sessionId} em ${delay}ms (tentativa ${retryCount + 1}/${this.maxRetries})`);
    
    setTimeout(async () => {
      try {
        await this.createSession(sessionId);
      } catch (error) {
        winstonLogger.error(`🚨 Erro ao reconectar sessão ${sessionId}:`, error);
        // Tentar novamente se ainda não atingiu o máximo
        if (retryCount + 1 < this.maxRetries) {
          this.scheduleReconnect(sessionId);
        }
      }
    }, delay);
  }

  /**
   * Força limpeza de uma sessão problemática
   */
  public async forceCleanupSession(sessionId: string): Promise<void> {
    winstonLogger.info(`🧹 Forçando limpeza da sessão ${sessionId}`);
    
    // Remover sessão ativa
    this.activeSessions.delete(sessionId);
    
    // Limpar contadores
    this.sessionRetryCount.delete(sessionId);
    this.qrCodes.delete(sessionId);
    
    // Aguardar um pouco antes de tentar recriar
    setTimeout(async () => {
      try {
        winstonLogger.info(`🔄 Recriando sessão ${sessionId} após limpeza forçada...`);
        await this.createSession(sessionId);
      } catch (error) {
        winstonLogger.error(`🔴 Erro ao recriar sessão ${sessionId} após limpeza:`, error);
      }
    }, 10000);
  }

  /**
   * Obtém estatísticas de retry das sessões
   */
  public getSessionRetryStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [sessionId, retryCount] of this.sessionRetryCount.entries()) {
      stats[sessionId] = retryCount;
    }
    return stats;
  }

  /**
   * Reseta contadores de retry para uma sessão
   */
  public resetSessionRetryCount(sessionId: string): void {
    this.sessionRetryCount.delete(sessionId);
    winstonLogger.info(`🔄 Contador de retry resetado para sessão ${sessionId}`);
  }

  // �� NOVO MÉTODO: Obter QR Code de uma sessão
  getQrCode(sessionId: string): string | null {
    return this.qrCodes.get(sessionId) || null;
  }

  // 🚨 NOVO MÉTODO: Limpar QR Code de uma sessão
  clearQrCode(sessionId: string): void {
    this.qrCodes.delete(sessionId);
    winstonLogger.info(`🔧 QR Code limpo para sessão: ${sessionId}`);
  }

  getSession(sessionId: string): WASocket | undefined {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      winstonLogger.warn(`⚠️ Sessão ${sessionId} não encontrada. Sessões ativas:`, Array.from(this.activeSessions.keys()));
    }
    return session;
  }

  getAllSessions(): SessionInfo[] {
    const sessions: SessionInfo[] = Array.from(this.activeSessions.entries()).map(([id, socket]) => ({
      sessionId: id,
      status: socket.user ? 'connected' : 'connecting' as const,
      user: socket.user || null
    }));
    
    winstonLogger.info(`📊 Status das sessões: ${sessions.length} sessões ativas`);
    sessions.forEach(session => {
      winstonLogger.info(`   - ${session.sessionId}: ${session.status}`);
    });
    
    return sessions;
  }

  /**
   * Envia mensagem com rate limiting e deduplicação
   */
  async sendMessage(sessionId: string, to: string, content: string, messageType: string = 'text'): Promise<any> {
    try {
      winstonLogger.info(`📤 [SessionManager] Tentando enviar mensagem para ${to}`);
      
      // Verificar rate limiting
      const rateLimitKey = `${sessionId}:${to}`;
      const result = this.rateLimiter.canSendMessage(rateLimitKey, content);
      
      if (!result.allowed) {
        if (result.timeRemaining) {
          winstonLogger.warn(`⏰ [RATE_LIMIT] Tempo restante: ${Math.ceil(result.timeRemaining / 1000)}s`);
        }
        
        return {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: result.reason,
          retryAfter: result.retryAfter,
          timeRemaining: result.timeRemaining
        };
      }

      // Verificar se a sessão existe
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Sessão ${sessionId} não encontrada`);
      }

      // Enviar mensagem com proteção do Circuit Breaker
      const messageResult = await this.sendMessageCircuitBreaker.execute(async () => {
        return await session.sendMessage(to, {
          text: content
        });
      });

      winstonLogger.info(`✅ [SessionManager] Mensagem enviada com sucesso para ${to}`);

      // Log de mensagem enviada
      this.messageLogger.logMessage({
        timestamp: new Date().toISOString(),
        sessionId,
        messageId: messageResult.key.id,
        direction: 'outgoing',
        fromUser: session.user?.id || 'unknown',
        toUser: to,
        messageType,
        content,
        status: 'success',
      });
      
      return {
        success: true,
        messageId: messageResult.key.id,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      winstonLogger.error(`❌ [SessionManager] Erro ao enviar mensagem:`, error);
      // Log de erro de envio
      this.messageLogger.logMessage({
        timestamp: new Date().toISOString(),
        sessionId,
        messageId: error?.messageId || `error_${Date.now()}`,
        direction: 'outgoing',
        fromUser: 'unknown',
        toUser: to,
        messageType,
        content,
        status: 'error',
        errorMessage: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Envia mensagem com rate limiting e deduplicação
   */
  async sendMessageWithRateLimit(sessionId: string, to: string, message: string): Promise<any> {
    const rateLimiter = RateLimiter.getInstance();
    
    const result = rateLimiter.canSendMessage(sessionId, to);
    
    if (!result.allowed) {
      winstonLogger.warn(`🚫 [RATE_LIMIT] Mensagem bloqueada para ${to}: ${result.reason}`);
      if (result.timeRemaining) {
        winstonLogger.warn(`⏰ [RATE_LIMIT] Tempo restante: ${Math.ceil(result.timeRemaining / 1000)}s`);
      }
      
      return {
        success: false,
        blocked: true,
        reason: result.reason,
        timeRemaining: result.timeRemaining
      };
    }

    winstonLogger.info(`✅ [RATE_LIMIT] Mensagem permitida para ${to}`);
    return await this.sendMessage(sessionId, to, message);
  }

  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  // Métodos para gerenciamento de mídia
  getMediaDownloadStats(): any {
    return this.mediaManager.getDownloadStats();
  }

  // Permitir configurar se o download automático está ativo
  private autoDownloadEnabled: boolean = true;

  setAutoDownload(enabled: boolean): void {
    this.autoDownloadEnabled = enabled;
    winstonLogger.info(`🔧 Download automático de mídia: ${enabled ? 'ATIVADO' : 'DESATIVADO'}`);
  }

  isAutoDownloadEnabled(): boolean {
    return this.autoDownloadEnabled;
  }

  // Métodos para acessar funcionalidades do MessageDatabaseConsumer
  async getMessageStats(): Promise<any> {
    return await this.messageDatabaseConsumer.getStats();
  }

  async getRecentMessages(hours: number = 24): Promise<any[]> {
    return await this.messageDatabaseConsumer.getRecentMessages(hours);
  }

  async searchMessages(query: string, limit: number = 50): Promise<any[]> {
    return await this.messageDatabaseConsumer.searchMessages(query);
  }

  async createMessageBackup(): Promise<string | null> {
    return await this.messageDatabaseConsumer.backup();
  }

  get messageBridgeRunning(): boolean {
    return this.messageDatabaseConsumer.isConsumerRunning();
  }

  get messageDatabase() {
    return this.messageDatabaseConsumer.database;
  }

  get messageSystem() {
    return this.messageDatabaseConsumer;
  }

  /**
   * Verifica se a mensagem deve ser processada com IA
   */
  private shouldProcessWithAI(content: string): boolean {
    winstonLogger.debug(`🔍 [DEBUG] Verificando se deve processar com IA: "${content}"`);
    
    if (!content || typeof content !== 'string') {
      winstonLogger.debug(`❌ [DEBUG] Conteúdo inválido: ${typeof content}`);
      return false;
    }

    const lowerContent = content.toLowerCase();
    winstonLogger.debug(`🔍 [DEBUG] Conteúdo em minúsculas: "${lowerContent}"`);
    winstonLogger.debug(`🔍 [DEBUG] Palavras-chave disponíveis: ${JSON.stringify(this.AI_KEYWORDS)}`);
    
    // Verificar se contém alguma das palavras-chave
    const hasKeyword = this.AI_KEYWORDS.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      const contains = lowerContent.includes(keywordLower);
      winstonLogger.debug(`🔍 [DEBUG] Verificando "${keywordLower}": ${contains}`);
      return contains;
    });
    
    winstonLogger.debug(`🤖 [DEBUG] Resultado da verificação: ${hasKeyword ? 'SIM' : 'NÃO'}`);
    return hasKeyword;
  }

  /**
   * Processa mensagem com IA
   */
  private async processMessageWithAI(sessionId: string, message: any, messageInfo: any): Promise<AIResponse> {
    try {
      const content = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
      
      if (!content) {
        return {
          success: false,
          error: 'Conteúdo da mensagem vazio'
        };
      }

      // Verificar rate limiting para IA
      const rateLimitKey = `ai:${sessionId}:${message.key.remoteJid}`;
      const rateLimitResult = this.rateLimiter.canSendMessage(rateLimitKey, content);
      
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          blocked: true,
          error: 'Rate limit atingido para IA',
          reason: rateLimitResult.reason,
          timeRemaining: rateLimitResult.timeRemaining
        };
      }

      // Preparar contexto para IA
      const context: MessageContext = {
        sessionId,
        messageId: message.key.id || `msg_${Date.now()}`,
        fromUser: message.key.remoteJid,
        content,
        messageType: 'text',
        timestamp: new Date(),
        conversationHistory: messageInfo.conversationHistory || []
      };

      // Processar com IA
      const aiResponse = await this.openAIService.processMessage(context);
      
      return aiResponse;

    } catch (error: any) {
      winstonLogger.error('❌ Erro ao processar mensagem com IA:', error);
      return {
        success: false,
        error: error.message || 'Erro desconhecido ao processar com IA'
      };
    }
  }

  /**
   * Processa mensagem recebida
   */
  private async handleIncomingMessage(sessionId: string, message: any): Promise<void> {
    try {
      const startTime = Date.now();
      const content = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
      const recipient = message.key.remoteJid;
      
      if (!content || !recipient) return;

      winstonLogger.info(`📥 [SessionManager] Mensagem recebida: "${content}" de ${recipient}`);

      // Registrar mensagem recebida
      const logEntry: MessageLogEntry = {
        timestamp: new Date().toISOString(),
        sessionId,
        messageId: message.key.id || `msg_${Date.now()}`,
        direction: 'incoming',
        fromUser: recipient,
        toUser: message.key.fromMe ? recipient : undefined,
        messageType: UnifiedProducer.extractMessageInfo(message).messageType || 'text',
        content,
        mediaInfo: UnifiedProducer.extractMessageInfo(message).mediaInfo ? {
          type: UnifiedProducer.extractMessageInfo(message).mediaInfo?.mimeType || 'unknown',
          filename: UnifiedProducer.extractMessageInfo(message).mediaInfo?.fileName,
          size: UnifiedProducer.extractMessageInfo(message).mediaInfo?.fileSize
        } : undefined,
        status: 'success',
        metadata: {
          pushName: message.pushName,
          broadcast: message.broadcast,
          messageStubType: message.messageStubType,
          messageStubParameters: message.messageStubParameters,
          quotedMessageId: message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id,
          quotedMessage: message.message?.extendedTextMessage?.contextInfo?.quotedMessage,
          contextInfo: message.message?.extendedTextMessage?.contextInfo
        }
      };
      this.messageLogger.logMessage(logEntry);

      // Verificar se deve processar com IA
      if (this.shouldProcessWithAI(content)) {
        winstonLogger.info(`🤖 [SessionManager] Processando com IA: "${content}"`);
        
        try {
          const messageInfo = {
            conversationHistory: [] // Você pode implementar histórico aqui
          };

          const aiResponse: AIResponse = await this.processMessageWithAI(sessionId, message, messageInfo);
          
          if (aiResponse.blocked) {
            winstonLogger.warn(`⚠️ [DEBUG] Mensagem bloqueada para ${message.key.remoteJid}: ${aiResponse.reason}`);
            return;
          }
          
          if (aiResponse.success && aiResponse.response) {
            winstonLogger.info(`🤖 [SessionManager] Resposta da IA: "${aiResponse.response}"`);
            
            // Enviar resposta da IA
            await this.sendMessage(sessionId, recipient, aiResponse.response);
            
            // Log de uso se disponível
            if (aiResponse.usage) {
              winstonLogger.debug(`📊 [DEBUG] Uso de tokens: ${JSON.stringify(aiResponse.usage)}`);
            }
          } else {
            winstonLogger.error(`❌ [SessionManager] IA retornou erro: ${aiResponse.error || 'Erro desconhecido'}`);
          }
        } catch (aiError) {
          winstonLogger.error(`❌ [SessionManager] Erro ao processar com IA:`, aiError);
        }
      }

      // Criar evento de mensagem para o sistema de mensageria
      const messageEvent = {
        sessionId,
        messageId: message.key.id || 'unknown',
        fromUser: message.key.remoteJid || 'unknown',
        toUser: message.key.fromMe ? message.key.remoteJid : undefined, // Se foi enviada por mim, definir destinatário
        timestamp: new Date((message.messageTimestamp as number) * 1000),
        messageType: UnifiedProducer.extractMessageInfo(message).messageType || 'other',
        content: UnifiedProducer.extractMessageInfo(message).content || '',
        mediaInfo: UnifiedProducer.extractMessageInfo(message).mediaInfo,
        originalMessage: message
      };

      // Enviar para o fluxo RabbitMQ → Banco
      try {
        const messageProducer = UnifiedProducer.getInstance();
        const published = await messageProducer.publishWhatsAppMessage(messageEvent);
        if (published) {
          winstonLogger.info(`📤 Mensagem enviada para sistema de mensageria: ${messageEvent.messageId}`);
        } else {
          winstonLogger.warn(`⚠️ Falha ao enviar mensagem para sistema de mensageria: ${messageEvent.messageId}`);
        }
      } catch (messagingError) {
        winstonLogger.error(`🔴 Erro no sistema de mensageria:`, messagingError);
      }
      
      // Log adicional se mídia foi baixada
      if (UnifiedProducer.extractMessageInfo(message).mediaInfo) {
        winstonLogger.info(`📊 Tamanho: ${(UnifiedProducer.extractMessageInfo(message).mediaInfo.fileSize! / 1024 / 1024).toFixed(2)} MB`);
      }

    } catch (error) {
      winstonLogger.error(`❌ [SessionManager] Erro ao processar mensagem:`, error);
    }
  }

  /**
   * Obtém estatísticas do serviço de IA
   */
  public getAIStats(): any {
    return this.openAIService.getStats();
  }

  /**
   * Testa a conexão com a OpenAI
   */
  public async testAIConnection(): Promise<{ success: boolean; error?: string }> {
    return await this.openAIService.testConnection();
  }

  /**
   * Atualiza a configuração da IA
   */
  public updateAIConfiguration(config: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }): void {
    this.openAIService.updateConfiguration(config);
  }

  /**
   * Adiciona uma nova palavra-chave para ativação da IA
   */
  public addAIKeyword(keyword: string): void {
    if (!this.AI_KEYWORDS.includes(keyword.toLowerCase())) {
      this.AI_KEYWORDS.push(keyword.toLowerCase());
      winstonLogger.info(`🔧 Nova palavra-chave adicionada para IA: ${keyword}`);
    }
  }

  /**
   * Remove uma palavra-chave da IA
   */
  public removeAIKeyword(keyword: string): void {
    const index = this.AI_KEYWORDS.indexOf(keyword.toLowerCase());
    if (index > -1) {
      this.AI_KEYWORDS.splice(index, 1);
      winstonLogger.info(`🔧 Palavra-chave removida da IA: ${keyword}`);
    }
  }

  /**
   * Obtém a lista de palavras-chave da IA
   */
  public getAIKeywords(): string[] {
    return [...this.AI_KEYWORDS];
  }

  /**
   * Obtém estatísticas do rate limiter
   */
  public getRateLimitStats(): any {
    return this.rateLimiter.getStats();
  }

  /**
   * Reseta rate limiter para um destinatário
   */
  public resetRateLimit(sessionId: string, recipient: string): void {
    this.rateLimiter.resetForRecipient(sessionId, recipient);
    winstonLogger.info(`🔄 [RATE_LIMIT] Rate limit resetado para ${sessionId}:${recipient}`);
  }
} 