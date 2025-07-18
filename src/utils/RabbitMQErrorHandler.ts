import { rabbitMQConfig } from '../config/RabbitMQConfig';
import logger from './Logger';

/**
 * Tipos de erro específicos do RabbitMQ
 */
export enum RabbitMQErrorType {
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  ACCESS_REFUSED = 'ACCESS_REFUSED', // 403 Forbidden
  NOT_FOUND = 'NOT_FOUND', // 404
  PRECONDITION_FAILED = 'PRECONDITION_FAILED', // 406
  RESOURCE_LOCKED = 'RESOURCE_LOCKED', // 405
  CHANNEL_ERROR = 'CHANNEL_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUEUE_NOT_FOUND = 'QUEUE_NOT_FOUND',
  EXCHANGE_NOT_FOUND = 'EXCHANGE_NOT_FOUND',
  INVALID_ROUTING_KEY = 'INVALID_ROUTING_KEY',
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Interface para informações detalhadas do erro
 */
export interface RabbitMQErrorInfo {
  type: RabbitMQErrorType;
  code: number;
  message: string;
  context: string;
  timestamp: string;
  retryable: boolean;
  maxRetries?: number;
  retryDelay?: number;
  shouldReconnect: boolean;
  shouldUseDLQ: boolean;
  userMessage: string;
}

/**
 * Configuração de tratamento de erros
 */
export interface ErrorHandlingConfig {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff: boolean;
  dlqEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Classe para tratamento específico de erros do RabbitMQ
 */
export class RabbitMQErrorHandler {
  private config: ErrorHandlingConfig;

  constructor(config: Partial<ErrorHandlingConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      exponentialBackoff: config.exponentialBackoff !== false,
      dlqEnabled: config.dlqEnabled !== false,
      logLevel: config.logLevel || 'error'
    };
  }

  /**
   * Analisa um erro do RabbitMQ e retorna informações detalhadas
   */
  public analyzeError(error: any, context: string = 'unknown'): RabbitMQErrorInfo {
    const errorInfo: RabbitMQErrorInfo = {
      type: RabbitMQErrorType.UNKNOWN_ERROR,
      code: 0,
      message: error.message || 'Unknown error',
      context,
      timestamp: new Date().toISOString(),
      retryable: false,
      shouldReconnect: false,
      shouldUseDLQ: false,
      userMessage: 'Erro desconhecido no RabbitMQ'
    };

    // Analisar código de erro específico
    if (error.code) {
      errorInfo.code = error.code;
      
      switch (error.code) {
        case 403:
          errorInfo.type = RabbitMQErrorType.ACCESS_REFUSED;
          errorInfo.retryable = false;
          errorInfo.shouldReconnect = false;
          errorInfo.shouldUseDLQ = true;
          errorInfo.userMessage = 'Acesso negado ao RabbitMQ. Verifique as credenciais e permissões.';
          break;
          
        case 404:
          errorInfo.type = RabbitMQErrorType.NOT_FOUND;
          errorInfo.retryable = false;
          errorInfo.shouldReconnect = false;
          errorInfo.shouldUseDLQ = true;
          errorInfo.userMessage = 'Recurso não encontrado no RabbitMQ (fila ou exchange inexistente).';
          break;
          
        case 406:
          errorInfo.type = RabbitMQErrorType.PRECONDITION_FAILED;
          errorInfo.retryable = false;
          errorInfo.shouldReconnect = false;
          errorInfo.shouldUseDLQ = true;
          errorInfo.userMessage = 'Falha de pré-condição no RabbitMQ. Verifique a configuração da fila.';
          break;
          
        case 405:
          errorInfo.type = RabbitMQErrorType.RESOURCE_LOCKED;
          errorInfo.retryable = true;
          errorInfo.shouldReconnect = false;
          errorInfo.shouldUseDLQ = false;
          errorInfo.retryDelay = 5000;
          errorInfo.userMessage = 'Recurso bloqueado no RabbitMQ. Tentando novamente em breve.';
          break;
          
        case 503:
          errorInfo.type = RabbitMQErrorType.CONNECTION_REFUSED;
          errorInfo.retryable = true;
          errorInfo.shouldReconnect = true;
          errorInfo.shouldUseDLQ = false;
          errorInfo.retryDelay = 2000;
          errorInfo.userMessage = 'Conexão recusada pelo RabbitMQ. Tentando reconectar.';
          break;
          
        default:
          errorInfo.type = RabbitMQErrorType.UNKNOWN_ERROR;
          errorInfo.retryable = true;
          errorInfo.shouldReconnect = true;
          errorInfo.shouldUseDLQ = true;
          errorInfo.userMessage = `Erro ${error.code} no RabbitMQ: ${error.message}`;
      }
    }

    // Analisar mensagem de erro para casos específicos
    if (error.message) {
      const message = error.message.toLowerCase();
      
      if (message.includes('access refused') || message.includes('403')) {
        errorInfo.type = RabbitMQErrorType.ACCESS_REFUSED;
        errorInfo.code = 403;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Acesso negado ao RabbitMQ. Verifique as credenciais e permissões.';
      } else if (message.includes('not found') || message.includes('404')) {
        errorInfo.type = RabbitMQErrorType.NOT_FOUND;
        errorInfo.code = 404;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Recurso não encontrado no RabbitMQ (fila ou exchange inexistente).';
      } else if (message.includes('precondition failed') || message.includes('406')) {
        errorInfo.type = RabbitMQErrorType.PRECONDITION_FAILED;
        errorInfo.code = 406;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Falha de pré-condição no RabbitMQ. Verifique a configuração da fila.';
      } else if (message.includes('resource locked') || message.includes('405')) {
        errorInfo.type = RabbitMQErrorType.RESOURCE_LOCKED;
        errorInfo.code = 405;
        errorInfo.retryable = true;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = false;
        errorInfo.retryDelay = 5000;
        errorInfo.userMessage = 'Recurso bloqueado no RabbitMQ. Tentando novamente em breve.';
      } else if (message.includes('connection refused') || message.includes('503')) {
        errorInfo.type = RabbitMQErrorType.CONNECTION_REFUSED;
        errorInfo.code = 503;
        errorInfo.retryable = true;
        errorInfo.shouldReconnect = true;
        errorInfo.shouldUseDLQ = false;
        errorInfo.retryDelay = 2000;
        errorInfo.userMessage = 'Conexão recusada pelo RabbitMQ. Tentando reconectar.';
      } else if (message.includes('permission denied')) {
        errorInfo.type = RabbitMQErrorType.PERMISSION_DENIED;
        errorInfo.code = 403;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Permissão negada no RabbitMQ. Verifique as permissões do usuário.';
      } else if (message.includes('queue not found')) {
        errorInfo.type = RabbitMQErrorType.QUEUE_NOT_FOUND;
        errorInfo.code = 404;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Fila não encontrada no RabbitMQ.';
      } else if (message.includes('exchange not found')) {
        errorInfo.type = RabbitMQErrorType.EXCHANGE_NOT_FOUND;
        errorInfo.code = 404;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Exchange não encontrado no RabbitMQ.';
      } else if (message.includes('invalid routing key')) {
        errorInfo.type = RabbitMQErrorType.INVALID_ROUTING_KEY;
        errorInfo.code = 406;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Routing key inválida no RabbitMQ.';
      } else if (message.includes('message too large')) {
        errorInfo.type = RabbitMQErrorType.MESSAGE_TOO_LARGE;
        errorInfo.code = 406;
        errorInfo.retryable = false;
        errorInfo.shouldReconnect = false;
        errorInfo.shouldUseDLQ = true;
        errorInfo.userMessage = 'Mensagem muito grande para o RabbitMQ.';
      }
    }

    return errorInfo;
  }

  /**
   * Registra o erro com o nível apropriado
   */
  public logError(errorInfo: RabbitMQErrorInfo, additionalData?: any): void {
    const logData = {
      ...errorInfo,
      additionalData
    };

    switch (this.config.logLevel) {
      case 'debug':
        logger.debug(`🔍 [DEBUG] RabbitMQ Error:`, logData);
        break;
      case 'info':
                  logger.info(`ℹ️ [INFO] RabbitMQ Error:`, logData);
        break;
      case 'warn':
        logger.warn(`⚠️ [WARN] RabbitMQ Error:`, logData);
        break;
      case 'error':
      default:
        logger.error(`🔴 [ERROR] RabbitMQ Error:`, logData);
        break;
    }
  }

  /**
   * Determina se deve tentar novamente baseado no tipo de erro
   */
  public shouldRetry(errorInfo: RabbitMQErrorInfo, currentRetryCount: number = 0): boolean {
    if (!errorInfo.retryable) return false;
    if (currentRetryCount >= this.config.maxRetries) return false;
    
    // Erros específicos que não devem ser retryados
    if (errorInfo.type === RabbitMQErrorType.ACCESS_REFUSED) return false;
    if (errorInfo.type === RabbitMQErrorType.PERMISSION_DENIED) return false;
    if (errorInfo.type === RabbitMQErrorType.MESSAGE_TOO_LARGE) return false;
    
    return true;
  }

  /**
   * Calcula o delay para retry com backoff exponencial
   */
  public calculateRetryDelay(errorInfo: RabbitMQErrorInfo, currentRetryCount: number = 0): number {
    if (errorInfo.retryDelay) {
      return errorInfo.retryDelay;
    }

    if (this.config.exponentialBackoff) {
      return this.config.retryDelay * Math.pow(2, currentRetryCount);
    }

    return this.config.retryDelay;
  }

  /**
   * Trata erro específico do RabbitMQ e retorna ação recomendada
   */
  public handleError(error: any, context: string = 'unknown', currentRetryCount: number = 0): {
    errorInfo: RabbitMQErrorInfo;
    action: 'retry' | 'reconnect' | 'dlq' | 'discard' | 'log';
    delay?: number;
  } {
    const errorInfo = this.analyzeError(error, context);
    
    // Log do erro
    this.logError(errorInfo, { currentRetryCount });

    // Determinar ação baseada no tipo de erro
    if (errorInfo.type === RabbitMQErrorType.ACCESS_REFUSED) {
      return {
        errorInfo,
        action: 'log',
        delay: 0
      };
    }

    if (errorInfo.type === RabbitMQErrorType.PERMISSION_DENIED) {
      return {
        errorInfo,
        action: 'log',
        delay: 0
      };
    }

    if (errorInfo.shouldReconnect) {
      return {
        errorInfo,
        action: 'reconnect',
        delay: this.calculateRetryDelay(errorInfo, currentRetryCount)
      };
    }

    if (this.shouldRetry(errorInfo, currentRetryCount)) {
      return {
        errorInfo,
        action: 'retry',
        delay: this.calculateRetryDelay(errorInfo, currentRetryCount)
      };
    }

    if (errorInfo.shouldUseDLQ && this.config.dlqEnabled) {
      return {
        errorInfo,
        action: 'dlq',
        delay: 0
      };
    }

    return {
      errorInfo,
      action: 'discard',
      delay: 0
    };
  }

  /**
   * Valida se as credenciais e permissões estão corretas
   */
  public async validatePermissions(channel: any): Promise<{
    canRead: boolean;
    canWrite: boolean;
    canConfigure: boolean;
    errors: string[];
  }> {
    const result = {
      canRead: false,
      canWrite: false,
      canConfigure: false,
      errors: [] as string[]
    };

    try {
      // Testar permissão de leitura
      await channel.checkQueue('test.read.permission');
      result.canRead = true;
    } catch (error) {
      result.errors.push('Sem permissão de leitura');
    }

    try {
      // Testar permissão de escrita
      await channel.publish('test.exchange', 'test.routing.key', Buffer.from('test'));
      result.canWrite = true;
    } catch (error) {
      result.errors.push('Sem permissão de escrita');
    }

    try {
      // Testar permissão de configuração
      await channel.assertQueue('test.configure.permission', { durable: true });
      await channel.deleteQueue('test.configure.permission');
      result.canConfigure = true;
    } catch (error) {
      result.errors.push('Sem permissão de configuração');
    }

    return result;
  }
}

/**
 * Instância padrão do error handler
 */
export const defaultErrorHandler = new RabbitMQErrorHandler({
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  dlqEnabled: true,
  logLevel: 'error'
}); 