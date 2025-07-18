import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { WhatsAppMessageEvent } from '../services/UnifiedProducer';
import logger from '../utils/Logger';

export interface MessageRecord extends WhatsAppMessageEvent {
  id: string;
  savedAt: Date;
  processed: boolean;
  retryCount?: number;
  lastError?: string;
}

export interface DatabaseStats {
  totalMessages: number;
  messagesByType: Record<string, number>;
  messagesBySession: Record<string, number>;
  messagesLast24h: number;
  messagesLast7d: number;
  processingErrors: number;
}

export class MessageDatabase {
  private dbPath: string;
  private dbDir: string;
  private cache: Map<string, MessageRecord> = new Map();
  private isInitialized = false;

  constructor(dbDirectory: string = './data/messages') {
    this.dbDir = dbDirectory;
    this.dbPath = join(dbDirectory, 'messages.json');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!existsSync(this.dbDir)) {
      mkdirSync(this.dbDir, { recursive: true });
      logger.info(`📁 Diretório de banco criado: ${this.dbDir}`);
    }
  }

  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) return;

      logger.info('🔧 Inicializando MessageDatabase...');
      
      // Carregar dados existentes se o arquivo existir
      if (existsSync(this.dbPath)) {
        await this.loadFromDisk();
      } else {
        // Criar arquivo vazio
        await this.saveToDisk();
      }

      this.isInitialized = true;
      logger.info(`✅ MessageDatabase inicializado com ${this.cache.size} mensagens`);
    } catch (error) {
      logger.error('🔴 Erro ao inicializar MessageDatabase:', error);
      throw error;
    }
  }

  async saveMessage(messageEvent: WhatsAppMessageEvent): Promise<MessageRecord> {
    try {
      await this.initialize();

      // Gerar ID único para a mensagem
      const id = this.generateId(messageEvent);
      
      // Verificar se a mensagem já existe
      if (this.cache.has(id)) {
        logger.warn(`⚠️ Mensagem já existe no banco: ${id}`);
        return this.cache.get(id)!;
      }

      const messageRecord: MessageRecord = {
        ...messageEvent,
        id,
        savedAt: new Date(),
        processed: true,
        retryCount: 0
      };

      // Adicionar ao cache
      this.cache.set(id, messageRecord);

      // Persistir no disco
      await this.saveToDisk();

      logger.info(`💾 Mensagem salva no banco:`, {
        id: messageRecord.id,
        sessionId: messageRecord.sessionId,
        messageType: messageRecord.messageType,
        fromUser: messageRecord.fromUser,
        savedAt: messageRecord.savedAt.toISOString()
      });

      return messageRecord;
    } catch (error) {
      logger.error('🔴 Erro ao salvar mensagem no banco:', error);
      throw error;
    }
  }

  async getMessage(id: string): Promise<MessageRecord | null> {
    await this.initialize();
    return this.cache.get(id) || null;
  }

  async getMessagesBySession(sessionId: string, limit: number = 500): Promise<MessageRecord[]> {
    await this.initialize();
    
    const messages = Array.from(this.cache.values())
      .filter(msg => msg.sessionId === sessionId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return messages;
  }

  async getLatestMessage(sessionId: string): Promise<MessageRecord | null> {
    await this.initialize();
    
    const messages = Array.from(this.cache.values())
      .filter(msg => msg.sessionId === sessionId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return messages.length > 0 ? messages[0] : null;
  }

  async getMessagesByUser(fromUser: string, limit: number = 500): Promise<MessageRecord[]> {
    await this.initialize();
    
    const messages = Array.from(this.cache.values())
      .filter(msg => msg.fromUser === fromUser)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return messages;
  }

  async getMessagesByType(messageType: string, limit: number = 500): Promise<MessageRecord[]> {
    await this.initialize();
    
    const messages = Array.from(this.cache.values())
      .filter(msg => msg.messageType === messageType)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return messages;
  }

  async getRecentMessages(hours: number = 24): Promise<MessageRecord[]> {
    await this.initialize();
    
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    const messages = Array.from(this.cache.values())
      .filter(msg => new Date(msg.timestamp) > cutoff)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return messages;
  }

  async searchMessages(query: string, limit: number = 50): Promise<MessageRecord[]> {
    await this.initialize();
    
    const lowerQuery = query.toLowerCase();
    
    const messages = Array.from(this.cache.values())
      .filter(msg => {
        return (
          msg.content?.toLowerCase().includes(lowerQuery) ||
          msg.fromUser.includes(lowerQuery) ||
          msg.sessionId.toLowerCase().includes(lowerQuery) ||
          msg.messageType.toLowerCase().includes(lowerQuery)
        );
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return messages;
  }

  async getStatistics(): Promise<DatabaseStats> {
    await this.initialize();
    
    const messages = Array.from(this.cache.values());
    const now = new Date();
    const last24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const last7d = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    const stats: DatabaseStats = {
      totalMessages: messages.length,
      messagesByType: {},
      messagesBySession: {},
      messagesLast24h: 0,
      messagesLast7d: 0,
      processingErrors: 0
    };

    messages.forEach(msg => {
      // Por tipo
      stats.messagesByType[msg.messageType] = (stats.messagesByType[msg.messageType] || 0) + 1;
      
      // Por sessão
      stats.messagesBySession[msg.sessionId] = (stats.messagesBySession[msg.sessionId] || 0) + 1;
      
      // Por período
      const msgDate = new Date(msg.timestamp);
      if (msgDate > last24h) {
        stats.messagesLast24h++;
      }
      if (msgDate > last7d) {
        stats.messagesLast7d++;
      }
      
      // Erros
      if (msg.lastError) {
        stats.processingErrors++;
      }
    });

    return stats;
  }

  async markMessageAsError(id: string, error: string): Promise<void> {
    await this.initialize();
    
    const message = this.cache.get(id);
    if (message) {
      message.processed = false;
      message.lastError = error;
      message.retryCount = (message.retryCount || 0) + 1;
      
      this.cache.set(id, message);
      await this.saveToDisk();
      
      logger.error(`🔴 Mensagem marcada com erro: ${id} - ${error}`);
    }
  }

  async deleteMessage(id: string): Promise<boolean> {
    await this.initialize();
    
    const deleted = this.cache.delete(id);
    if (deleted) {
      await this.saveToDisk();
      logger.info(`🗑️ Mensagem deletada: ${id}`);
    }
    
    return deleted;
  }

  async clearOldMessages(days: number = 30): Promise<number> {
    await this.initialize();
    
    const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const initialSize = this.cache.size;
    
    for (const [id, message] of this.cache.entries()) {
      if (new Date(message.timestamp) < cutoff) {
        this.cache.delete(id);
      }
    }
    
    const deleted = initialSize - this.cache.size;
    
    if (deleted > 0) {
      await this.saveToDisk();
      logger.info(`🧹 ${deleted} mensagens antigas removidas (>${days} dias)`);
    }
    
    return deleted;
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const data = readFileSync(this.dbPath, 'utf8');
      const messages: MessageRecord[] = JSON.parse(data);
      
      this.cache.clear();
      messages.forEach(msg => {
        // Converter strings de data de volta para objetos Date
        msg.timestamp = new Date(msg.timestamp);  
        msg.savedAt = new Date(msg.savedAt);
        this.cache.set(msg.id, msg);
      });
      
      logger.info(`📖 ${messages.length} mensagens carregadas do disco`);
    } catch (error) {
      logger.error('🔴 Erro ao carregar mensagens do disco:', error);
      // Se houver erro na leitura, reinicializar com cache vazio
      this.cache.clear();
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const messages = Array.from(this.cache.values());
      const data = JSON.stringify(messages, null, 2);
      writeFileSync(this.dbPath, data, 'utf8');
    } catch (error) {
      logger.error('🔴 Erro ao salvar mensagens no disco:', error);
      throw error;
    }
  }

  private generateId(messageEvent: WhatsAppMessageEvent): string {
    // Gerar ID baseado em sessionId + messageId + timestamp para garantir unicidade
    const timestamp = messageEvent.timestamp instanceof Date 
      ? messageEvent.timestamp.getTime() 
      : new Date(messageEvent.timestamp).getTime();
    return `${messageEvent.sessionId}_${messageEvent.messageId}_${timestamp}`;
  }

  // Método para backup manual
  async createBackup(): Promise<string> {
    await this.initialize();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(this.dbDir, `messages_backup_${timestamp}.json`);
    
    const messages = Array.from(this.cache.values());
    const data = JSON.stringify(messages, null, 2);
    writeFileSync(backupPath, data, 'utf8');
    
    logger.info(`💾 Backup criado: ${backupPath}`);
    return backupPath;
  }

  // Getters para informações rápidas
  get messageCount(): number {
    return this.cache.size;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }
} 