// Interface para mensagens da fila RabbitMQ
export interface QueueMessage {
  id: string;
  content: string;
  timestamp: string;
  metadata: {
    sender: string;
    priority: 'high' | 'medium' | 'low';
    retryCount?: number;
    maxRetries?: number;
    originalQueue?: string;
  };
}

// Payload de entrada para o endpoint
export interface SendMessageRequest {
  queue: string;
  message: QueueMessage;
}

// Resposta de sucesso
export interface SendMessageResponse {
  success: boolean;
  messageId: string;
  queueName: string;
  timestamp: string;
  retryAttempt?: number;
  processingTime?: number;
}

// Configuração de fila
export interface QueueConfig {
  name: string;
  durable: boolean;
  autoDelete: boolean;
  exclusive: boolean;
  arguments?: Record<string, any>;
}

// Configuração de retry
export interface RetryConfig {
  maxRetries: number;
  retryDelay: number; // em milliseconds
  exponentialBackoff: boolean;
  dlqEnabled: boolean;
}

// Status da fila
export interface QueueStatus {
  name: string;
  messageCount: number;
  consumerCount: number;
  exists: boolean;
  lastActivity?: string;
}

// Erro de validação
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// Resultado de validação
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Configuração padrão para filas
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  name: '',
  durable: true,
  autoDelete: false,
  exclusive: false,
  arguments: {}
};

// Configuração padrão de retry
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  dlqEnabled: true
};

// Prioridades de mensagem
export const MESSAGE_PRIORITIES = {
  high: 3,
  medium: 2,
  low: 1
} as const;

// Constantes de filas
export const QUEUE_CONSTANTS = {
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1MB
  MAX_QUEUE_NAME_LENGTH: 255,
  MIN_QUEUE_NAME_LENGTH: 1,
  VALID_QUEUE_NAME_PATTERN: /^[a-zA-Z0-9._-]+$/,
  MESSAGE_ID_PATTERN: /^[a-zA-Z0-9._-]+$/
} as const; 