import logger from '../utils/Logger';

interface CircuitBreakerConfig {
  threshold: number;
  cooldownTime: number;
  serviceName: string;
}

interface CircuitBreakerState {
  failureCount: number;
  isOpen: boolean;
  nextTryTime: number;
  lastFailureTime: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreakerService {
  private static instances = new Map<string, CircuitBreakerService>();
  private failureCount: number = 0;
  private threshold: number;
  private cooldownTime: number;
  private isOpen: boolean = false;
  private nextTryTime: number = 0;
  private serviceName: string;
  private lastFailureTime: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;

  constructor(config: CircuitBreakerConfig) {
    this.threshold = config.threshold;
    this.cooldownTime = config.cooldownTime;
    this.serviceName = config.serviceName;
  }

  /**
   * Obtém ou cria uma instância do Circuit Breaker para um serviço específico
   */
  static getInstance(serviceName: string, threshold: number = 3, cooldownTime: number = 30000): CircuitBreakerService {
    if (!CircuitBreakerService.instances.has(serviceName)) {
      CircuitBreakerService.instances.set(serviceName, new CircuitBreakerService({
        threshold,
        cooldownTime,
        serviceName
      }));
    }
    return CircuitBreakerService.instances.get(serviceName)!;
  }

  /**
   * Executa uma ação protegida pelo circuit breaker
   */
  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.isOpen && Date.now() < this.nextTryTime) {
      const remainingTime = Math.ceil((this.nextTryTime - Date.now()) / 1000);
      logger.warn(`🚫 [${this.serviceName}] Circuito aberto. Tentando novamente em ${remainingTime}s`);
      throw new Error(`Circuit breaker aberto para ${this.serviceName}. Tente novamente em ${remainingTime}s`);
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Executa uma ação síncrona protegida pelo circuit breaker
   */
  executeSync<T>(action: () => T): T {
    if (this.isOpen && Date.now() < this.nextTryTime) {
      const remainingTime = Math.ceil((this.nextTryTime - Date.now()) / 1000);
      logger.warn(`🚫 [${this.serviceName}] Circuito aberto. Tentando novamente em ${remainingTime}s`);
      throw new Error(`Circuit breaker aberto para ${this.serviceName}. Tente novamente em ${remainingTime}s`);
    }

    try {
      const result = action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.isOpen = false;
    this.totalSuccesses++;
    logger.info(`✅ [${this.serviceName}] Circuit breaker resetado após sucesso`);
  }

  private onFailure(error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    
    logger.error(`❌ [${this.serviceName}] Falha #${this.failureCount}:`, error.message || error);

    if (this.failureCount >= this.threshold) {
      this.open();
    }
  }

  private open(): void {
    logger.warn(`⚡ [${this.serviceName}] Circuit breaker aberto após ${this.threshold} falhas`);
    this.isOpen = true;
    this.nextTryTime = Date.now() + this.cooldownTime;
  }

  /**
   * Força o reset do circuit breaker
   */
  forceReset(): void {
    this.failureCount = 0;
    this.isOpen = false;
    this.nextTryTime = 0;
    logger.info(`🔄 [${this.serviceName}] Circuit breaker forçadamente resetado`);
  }

  /**
   * Obtém o estado atual do circuit breaker
   */
  getState(): CircuitBreakerState {
    return {
      failureCount: this.failureCount,
      isOpen: this.isOpen,
      nextTryTime: this.nextTryTime,
      lastFailureTime: this.lastFailureTime,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }

  /**
   * Obtém estatísticas de todos os circuit breakers
   */
  static getAllStats(): Record<string, CircuitBreakerState> {
    const stats: Record<string, CircuitBreakerState> = {};
    for (const [serviceName, instance] of CircuitBreakerService.instances) {
      stats[serviceName] = instance.getState();
    }
    return stats;
  }
}