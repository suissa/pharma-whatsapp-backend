import { RateLimiter } from '../utils/RateLimiter';
import logger from '../utils/Logger';

export interface DeduplicateOptions {
  sessionId: string;
  recipient: string;
  messageContent: string;
  onBlocked?: (reason: string, timeRemaining?: number) => void;
}

/**
 * Decorator para deduplicação de mensagens
 */
export function Deduplicate(options: DeduplicateOptions) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const rateLimiter = RateLimiter.getInstance();
      
      const result = rateLimiter.canSendMessage(
        options.sessionId,
        options.recipient
      );

      if (!result.allowed) {
        logger.info(`🚫 [DEDUPLICATE] Mensagem bloqueada: ${result.reason}`);
        if (result.timeRemaining) {
          logger.info(`⏰ [DEDUPLICATE] Tempo restante: ${Math.ceil(result.timeRemaining / 1000)}s`);
        }
        
        if (options.onBlocked) {
          options.onBlocked(result.reason!, result.timeRemaining);
        }
        
        return {
          success: false,
          blocked: true,
          reason: result.reason,
          timeRemaining: result.timeRemaining
        };
      }

      logger.info(`✅ [DEDUPLICATE] Mensagem permitida`);
      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator para rate limiting
 */
export function RateLimit(options: {
  sessionId: string;
  recipient: string;
  messageContent: string;
  onBlocked?: (reason: string, timeRemaining?: number) => void;
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const rateLimiter = RateLimiter.getInstance();
      
      const result = rateLimiter.canSendMessage(
        options.sessionId,
        options.recipient
      );

      if (!result.allowed) {
        logger.info(`🚫 [RATE_LIMIT] Mensagem bloqueada: ${result.reason}`);
        if (result.timeRemaining) {
          logger.info(`⏰ [RATE_LIMIT] Tempo restante: ${Math.ceil(result.timeRemaining / 1000)}s`);
        }
        
        if (options.onBlocked) {
          options.onBlocked(result.reason!, result.timeRemaining);
        }
        
        return {
          success: false,
          blocked: true,
          reason: result.reason,
          timeRemaining: result.timeRemaining
        };
      }

      logger.info(`✅ [RATE_LIMIT] Mensagem permitida`);
      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
} 