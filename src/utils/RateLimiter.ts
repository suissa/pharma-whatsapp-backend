import dotenv from 'dotenv';
import path from 'path';
import logger from './Logger';
// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env') });


interface RateLimitEntry {
  lastMessageTime: number;
  messageCount: number;
  lastMessageContent: string;
}

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  timeRemaining?: number; // Adicionado para compatibilidade
}

export class RateLimiter {
  private static instance: RateLimiter;
  private rateLimitMap = new Map<string, RateLimitEntry>();
  
  // Pegar configurações do .env com fallbacks
  private readonly RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '30000');
  private readonly MAX_MESSAGES_PER_WINDOW = parseInt(process.env.MAX_MESSAGES_PER_WINDOW || '1');

  private constructor() {
    logger.info(`⏰ RateLimiter configurado: ${this.MAX_MESSAGES_PER_WINDOW} msg a cada ${this.RATE_LIMIT_WINDOW}ms`);
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Verifica se pode enviar mensagem
   */
  public canSendMessage(key: string, content: string): RateLimitResult {
    const now = Date.now();
    const entry = this.rateLimitMap.get(key);

    // Se não há entrada, pode enviar
    if (!entry) {
      this.rateLimitMap.set(key, {
        lastMessageTime: now,
        messageCount: 1,
        lastMessageContent: content
      });
      return { allowed: true };
    }

    // Verificar se está dentro da janela de tempo
    const timeSinceLastMessage = now - entry.lastMessageTime;
    
    if (timeSinceLastMessage < this.RATE_LIMIT_WINDOW) {
      // Verificar deduplicação
      if (entry.lastMessageContent === content) {
        const timeRemaining = this.RATE_LIMIT_WINDOW - timeSinceLastMessage;
        return {
          allowed: false,
          reason: 'Mensagem duplicada detectada',
          retryAfter: timeRemaining,
          timeRemaining: timeRemaining
        };
      }

      // Verificar limite de mensagens
      if (entry.messageCount >= this.MAX_MESSAGES_PER_WINDOW) {
        const timeRemaining = this.RATE_LIMIT_WINDOW - timeSinceLastMessage;
        return {
          allowed: false,
          reason: 'Limite de mensagens atingido',
          retryAfter: timeRemaining,
          timeRemaining: timeRemaining
        };
      }

      // Atualizar contador
      entry.messageCount++;
      entry.lastMessageTime = now;
      entry.lastMessageContent = content;
      return { allowed: true };
    }

    // Reset da janela de tempo
    this.rateLimitMap.set(key, {
      lastMessageTime: now,
      messageCount: 1,
      lastMessageContent: content
    });
    return { allowed: true };
  }

  /**
   * Reset para um destinatário específico
   */
  public resetForRecipient(sessionId: string, recipient: string): void {
    const key = `${sessionId}:${recipient}`;
    this.rateLimitMap.delete(key);
    logger.info(` RateLimiter: Reset para ${recipient}`);
  }

  /**
   * Reset geral
   */
  public reset(): void {
    this.rateLimitMap.clear();
    logger.info(` RateLimiter: Reset completo`);
  }

  /**
   * Obtém configuração
   */
  public getConfig(): any {
    return {
      rateLimitWindow: this.RATE_LIMIT_WINDOW,
      maxMessagesPerWindow: this.MAX_MESSAGES_PER_WINDOW,
      activeEntries: this.rateLimitMap.size
    };
  }

  /**
   * Limpa entradas antigas
   */
  public cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.rateLimitMap.entries()) {
      if (now - entry.lastMessageTime > this.RATE_LIMIT_WINDOW * 2) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.rateLimitMap.delete(key));
    
    if (keysToDelete.length > 0) {
      logger.info(`🧹 RateLimiter: Limpou ${keysToDelete.length} entradas antigas`);
    }
  }

  /**
   * Obtém estatísticas
   */
  public getStats(): any {
    return {
      activeEntries: this.rateLimitMap.size,
      rateLimitWindow: this.RATE_LIMIT_WINDOW,
      maxMessagesPerWindow: this.MAX_MESSAGES_PER_WINDOW
    };
  }
} 