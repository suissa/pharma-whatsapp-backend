import { 
  QueueMessage, 
  SendMessageRequest, 
  ValidationError, 
  ValidationResult, 
  QUEUE_CONSTANTS 
} from '../utils/QueueMessage';

export class MessageValidator {
  
  /**
   * Valida uma requisição completa de envio de mensagem
   */
  static validateSendRequest(request: SendMessageRequest): ValidationResult {
    const errors: ValidationError[] = [];

    // Validar estrutura básica
    if (!request) {
      errors.push({
        field: 'request',
        message: 'Requisição não pode estar vazia'
      });
      return { isValid: false, errors };
    }

    // Validar nome da fila
    const queueValidation = this.validateQueueName(request.queue);
    if (!queueValidation.isValid) {
      errors.push(...queueValidation.errors);
    }

    // Validar mensagem
    const messageValidation = this.validateMessage(request.message);
    if (!messageValidation.isValid) {
      errors.push(...messageValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida o nome da fila
   */
  static validateQueueName(queueName: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (!queueName) {
      errors.push({
        field: 'queue',
        message: 'Nome da fila é obrigatório',
        value: queueName
      });
    } else {
      // Verificar comprimento
      if (queueName.length < QUEUE_CONSTANTS.MIN_QUEUE_NAME_LENGTH) {
        errors.push({
          field: 'queue',
          message: `Nome da fila deve ter pelo menos ${QUEUE_CONSTANTS.MIN_QUEUE_NAME_LENGTH} caractere`,
          value: queueName
        });
      }

      if (queueName.length > QUEUE_CONSTANTS.MAX_QUEUE_NAME_LENGTH) {
        errors.push({
          field: 'queue',
          message: `Nome da fila não pode exceder ${QUEUE_CONSTANTS.MAX_QUEUE_NAME_LENGTH} caracteres`,
          value: queueName
        });
      }

      // Verificar padrão
      if (!QUEUE_CONSTANTS.VALID_QUEUE_NAME_PATTERN.test(queueName)) {
        errors.push({
          field: 'queue',
          message: 'Nome da fila deve conter apenas letras, números, pontos, underscores e hífens',
          value: queueName
        });
      }

      // Verificar se não começa ou termina com pontos ou hífens
      if (queueName.startsWith('.') || queueName.startsWith('-') || 
          queueName.endsWith('.') || queueName.endsWith('-')) {
        errors.push({
          field: 'queue',
          message: 'Nome da fila não pode começar ou terminar com pontos ou hífens',
          value: queueName
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida a mensagem
   */
  static validateMessage(message: QueueMessage): ValidationResult {
    const errors: ValidationError[] = [];

    if (!message) {
      errors.push({
        field: 'message',
        message: 'Mensagem é obrigatória'
      });
      return { isValid: false, errors };
    }

    // Validar ID da mensagem
    const idValidation = this.validateMessageId(message.id);
    if (!idValidation.isValid) {
      errors.push(...idValidation.errors);
    }

    // Validar conteúdo
    const contentValidation = this.validateContent(message.content);
    if (!contentValidation.isValid) {
      errors.push(...contentValidation.errors);
    }

    // Validar timestamp
    const timestampValidation = this.validateTimestamp(message.timestamp);
    if (!timestampValidation.isValid) {
      errors.push(...timestampValidation.errors);
    }

    // Validar metadata
    const metadataValidation = this.validateMetadata(message.metadata);
    if (!metadataValidation.isValid) {
      errors.push(...metadataValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida o ID da mensagem
   */
  static validateMessageId(id: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (!id) {
      errors.push({
        field: 'message.id',
        message: 'ID da mensagem é obrigatório',
        value: id
      });
    } else {
      if (typeof id !== 'string') {
        errors.push({
          field: 'message.id',
          message: 'ID da mensagem deve ser uma string',
          value: id
        });
      } else {
        if (id.length < 1 || id.length > 255) {
          errors.push({
            field: 'message.id',
            message: 'ID da mensagem deve ter entre 1 e 255 caracteres',
            value: id
          });
        }

        if (!QUEUE_CONSTANTS.MESSAGE_ID_PATTERN.test(id)) {
          errors.push({
            field: 'message.id',
            message: 'ID da mensagem deve conter apenas letras, números, pontos, underscores e hífens',
            value: id
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida o conteúdo da mensagem
   */
  static validateContent(content: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (!content) {
      errors.push({
        field: 'message.content',
        message: 'Conteúdo da mensagem é obrigatório',
        value: content
      });
    } else {
      if (typeof content !== 'string') {
        errors.push({
          field: 'message.content',
          message: 'Conteúdo da mensagem deve ser uma string',
          value: content
        });
      } else {
        const contentSize = content.length;
        if (contentSize > QUEUE_CONSTANTS.MAX_MESSAGE_SIZE) {
          errors.push({
            field: 'message.content',
            message: `Conteúdo da mensagem não pode exceder ${QUEUE_CONSTANTS.MAX_MESSAGE_SIZE} bytes`,
            value: `${contentSize} bytes`
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida o timestamp
   */
  static validateTimestamp(timestamp: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (!timestamp) {
      errors.push({
        field: 'message.timestamp',
        message: 'Timestamp é obrigatório',
        value: timestamp
      });
    } else {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        errors.push({
          field: 'message.timestamp',
          message: 'Timestamp deve ser uma data válida no formato ISO 8601',
          value: timestamp
        });
      } else {
        // Verificar se a data não é muito no futuro (mais de 1 hora)
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        
        if (date > oneHourFromNow) {
          errors.push({
            field: 'message.timestamp',
            message: 'Timestamp não pode ser mais de 1 hora no futuro',
            value: timestamp
          });
        }

        // Verificar se a data não é muito antiga (mais de 1 ano)
        const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        
        if (date < oneYearAgo) {
          errors.push({
            field: 'message.timestamp',
            message: 'Timestamp não pode ser mais de 1 ano no passado',
            value: timestamp
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida os metadados
   */
  static validateMetadata(metadata: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!metadata) {
      errors.push({
        field: 'message.metadata',
        message: 'Metadata é obrigatório',
        value: metadata
      });
      return { isValid: false, errors };
    }

    // Validar sender
    if (!metadata.sender) {
      errors.push({
        field: 'message.metadata.sender',
        message: 'Sender é obrigatório',
        value: metadata.sender
      });
    } else if (typeof metadata.sender !== 'string') {
      errors.push({
        field: 'message.metadata.sender',
        message: 'Sender deve ser uma string',
        value: metadata.sender
      });
    } else if (metadata.sender.length < 1 || metadata.sender.length > 255) {
      errors.push({
        field: 'message.metadata.sender',
        message: 'Sender deve ter entre 1 e 255 caracteres',
        value: metadata.sender
      });
    }

    // Validar priority
    if (!metadata.priority) {
      errors.push({
        field: 'message.metadata.priority',
        message: 'Priority é obrigatório',
        value: metadata.priority
      });
    } else if (['high', 'medium', 'low'].indexOf(metadata.priority) === -1) {
      errors.push({
        field: 'message.metadata.priority',
        message: 'Priority deve ser "high", "medium" ou "low"',
        value: metadata.priority
      });
    }

    // Validar retryCount (se presente)
    if (metadata.retryCount !== undefined) {
      if (typeof metadata.retryCount !== 'number' || metadata.retryCount < 0) {
        errors.push({
          field: 'message.metadata.retryCount',
          message: 'RetryCount deve ser um número não negativo',
          value: metadata.retryCount
        });
      }
    }

    // Validar maxRetries (se presente)
    if (metadata.maxRetries !== undefined) {
      if (typeof metadata.maxRetries !== 'number' || metadata.maxRetries < 0) {
        errors.push({
          field: 'message.metadata.maxRetries',
          message: 'MaxRetries deve ser um número não negativo',
          value: metadata.maxRetries
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Gera um ID único para mensagem se não fornecido
   */
  static generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `msg_${timestamp}_${random}`;
  }

  /**
   * Normaliza uma mensagem adicionando valores padrão
   */
  static normalizeMessage(message: Partial<QueueMessage>): QueueMessage {
    return {
      id: message.id || this.generateMessageId(),
      content: message.content || '',
      timestamp: message.timestamp || new Date().toISOString(),
      metadata: {
        sender: message.metadata?.sender || 'unknown',
        priority: message.metadata?.priority || 'medium',
        retryCount: message.metadata?.retryCount || 0,
        maxRetries: message.metadata?.maxRetries || 3,
        originalQueue: message.metadata?.originalQueue
      }
    };
  }
} 