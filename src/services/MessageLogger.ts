import logger from './WinstonLogger';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MessageLogEntry {
  timestamp: string;
  sessionId: string;
  messageId: string;
  direction: 'incoming' | 'outgoing';
  fromUser: string;
  toUser: string;
  messageType: string;
  content?: string;
  mediaInfo?: {
    type: string;
    url?: string;
    filename?: string;
    size?: number;
  };
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
  metadata?: {
    pushName?: string;
    broadcast?: boolean;
    messageStubType?: number;
    messageStubParameters?: string[];
    quotedMessageId?: string;
    quotedMessage?: any;
    contextInfo?: any;
  };
  processingTime?: number;
  aiProcessed?: boolean;
  aiResponse?: string;
  rateLimited?: boolean;
  circuitBreakerOpen?: boolean;
}

export class MessageLogger {
  private static instance: MessageLogger;

  private constructor() {}

  public static getInstance(): MessageLogger {
    if (!MessageLogger.instance) {
      MessageLogger.instance = new MessageLogger();
    }
    return MessageLogger.instance;
  }

  public logMessage(entry: MessageLogEntry): void {
    try {
      // Log estruturado em JSON
      logger.info({
        ...entry,
        logType: 'whatsapp-message',
      });

      // Log legível para humanos
      if (process.env.NODE_ENV !== 'production') {
        logger.info(this.formatHumanReadableLog(entry));
      }

      // Log de erro se houver
      if (entry.status === 'error') {
        logger.error({
          ...entry,
          logType: 'whatsapp-message',
        });
      }
    } catch (error) {
      logger.error('🔴 Erro ao registrar mensagem:', error);
    }
  }

  private formatHumanReadableLog(entry: MessageLogEntry): string {
    const timestamp = format(new Date(entry.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
    const direction = entry.direction === 'incoming' ? '📩 RECEBIDA' : '📤 ENVIADA';
    const status = entry.status === 'success' ? '✅' : entry.status === 'error' ? '❌' : '⏳';
    
    let log = `[${timestamp}] ${direction} ${status} | Sessão: ${entry.sessionId} | ID: ${entry.messageId}\n`;
    log += `   De: ${entry.fromUser} | Para: ${entry.toUser} | Tipo: ${entry.messageType}\n`;
    
    if (entry.content) {
      log += `   Conteúdo: ${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}\n`;
    }
    
    if (entry.mediaInfo) {
      log += `   Mídia: ${entry.mediaInfo.type}${entry.mediaInfo.filename ? ` - ${entry.mediaInfo.filename}` : ''}\n`;
    }
    
    if (entry.processingTime) {
      log += `   Tempo de Processamento: ${entry.processingTime}ms\n`;
    }
    
    if (entry.aiProcessed) {
      log += `   🤖 Processado por IA: ${entry.aiResponse ? 'Sim' : 'Não'}\n`;
    }
    
    if (entry.rateLimited) {
      log += `   ⚠️ Rate Limited\n`;
    }
    
    if (entry.circuitBreakerOpen) {
      log += `   🔌 Circuit Breaker Aberto\n`;
    }
    
    if (entry.errorMessage) {
      log += `   ❌ Erro: ${entry.errorMessage}\n`;
    }
    
    if (entry.metadata) {
      if (entry.metadata.pushName) {
        log += `   👤 Nome: ${entry.metadata.pushName}\n`;
      }
      if (entry.metadata.broadcast) {
        log += `   📢 Broadcast\n`;
      }
      if (entry.metadata.quotedMessageId) {
        log += `   💬 Resposta para: ${entry.metadata.quotedMessageId}\n`;
      }
    }
    
    log += `   ${'─'.repeat(80)}\n`;
    
    return log;
  }
} 