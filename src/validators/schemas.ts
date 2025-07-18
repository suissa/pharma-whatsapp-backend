import Joi from 'joi';

// Schemas para Sessões
export const sessionSchemas = {
  // Criar sessão
  createSession: Joi.object({
    instanceId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'instanceId é obrigatório',
        'string.min': 'instanceId deve ter pelo menos 3 caracteres',
        'string.max': 'instanceId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'instanceId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'instanceId é obrigatório'
      })
  }),

  // Parâmetros de sessão (para rotas GET, DELETE)
  sessionId: Joi.object({
    sessionId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'sessionId é obrigatório',
        'string.min': 'sessionId deve ter pelo menos 3 caracteres',
        'string.max': 'sessionId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'sessionId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'sessionId é obrigatório'
      })
  }),

  // Enviar mensagem
  sendMessage: Joi.object({
    to: Joi.string()
      .required()
      .pattern(/^[0-9]+@s\.whatsapp\.net$|^[0-9]+$/)
      .messages({
        'string.empty': 'Número de telefone é obrigatório',
        'string.pattern.base': 'Formato de telefone inválido. Use apenas números ou formato WhatsApp',
        'any.required': 'Número de telefone é obrigatório'
      }),
    message: Joi.string()
      .required()
      .min(1)
      .max(4096)
      .messages({
        'string.empty': 'Mensagem é obrigatória',
        'string.min': 'Mensagem deve ter pelo menos 1 caractere',
        'string.max': 'Mensagem deve ter no máximo 4096 caracteres',
        'any.required': 'Mensagem é obrigatória'
      }),
    type: Joi.string()
      .valid('text', 'image', 'video', 'audio', 'document', 'sticker')
      .default('text')
      .messages({
        'any.only': 'Tipo deve ser: text, image, video, audio, document ou sticker',
        'string.empty': 'Tipo não pode ser vazio'
      }),
    mediaUrl: Joi.string()
      .uri()
      .optional()
      .messages({
        'string.uri': 'URL da mídia deve ser uma URL válida'
      }),
    caption: Joi.string()
      .max(1024)
      .optional()
      .messages({
        'string.max': 'Legenda deve ter no máximo 1024 caracteres'
      })
  }),

  // Forçar limpeza de sessão problemática
  forceCleanup: Joi.object({
    sessionId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'sessionId é obrigatório',
        'string.min': 'sessionId deve ter pelo menos 3 caracteres',
        'string.max': 'sessionId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'sessionId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'sessionId é obrigatório'
      })
  }),

  // Resetar contador de retry
  resetRetry: Joi.object({
    sessionId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'sessionId é obrigatório',
        'string.min': 'sessionId deve ter pelo menos 3 caracteres',
        'string.max': 'sessionId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'sessionId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'sessionId é obrigatório'
      })
  }),

  // Reconectar sessão específica
  reconnect: Joi.object({
    sessionId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'sessionId é obrigatório',
        'string.min': 'sessionId deve ter pelo menos 3 caracteres',
        'string.max': 'sessionId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'sessionId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'sessionId é obrigatório'
      })
  }),

  // Obter estatísticas de retry (não precisa de validação de parâmetros)
  retryStats: Joi.object({})
};

// Schemas para Mensagens
export const messageSchemas = {
  // Listar mensagens
  listMessages: Joi.object({
    sessionId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'sessionId é obrigatório',
        'string.min': 'sessionId deve ter pelo menos 3 caracteres',
        'string.max': 'sessionId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'sessionId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'sessionId é obrigatório'
      }),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(50)
      .messages({
        'number.base': 'Limit deve ser um número',
        'number.integer': 'Limit deve ser um número inteiro',
        'number.min': 'Limit deve ser pelo menos 1',
        'number.max': 'Limit deve ser no máximo 100'
      }),
    offset: Joi.number()
      .integer()
      .min(0)
      .default(0)
      .messages({
        'number.base': 'Offset deve ser um número',
        'number.integer': 'Offset deve ser um número inteiro',
        'number.min': 'Offset deve ser pelo menos 0'
      })
  }),

  // Buscar mensagem por ID
  getMessage: Joi.object({
    messageId: Joi.string()
      .required()
      .min(1)
      .max(100)
      .messages({
        'string.empty': 'messageId é obrigatório',
        'string.min': 'messageId deve ter pelo menos 1 caractere',
        'string.max': 'messageId deve ter no máximo 100 caracteres',
        'any.required': 'messageId é obrigatório'
      })
  }),

  // Enviar mensagem via API
  sendMessageAPI: Joi.object({
    sessionId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'sessionId é obrigatório',
        'string.min': 'sessionId deve ter pelo menos 3 caracteres',
        'string.max': 'sessionId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'sessionId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'sessionId é obrigatório'
      }),
    to: Joi.string()
      .required()
      .pattern(/^[0-9]+@s\.whatsapp\.net$|^[0-9]+$/)
      .messages({
        'string.empty': 'Número de telefone é obrigatório',
        'string.pattern.base': 'Formato de telefone inválido. Use apenas números ou formato WhatsApp',
        'any.required': 'Número de telefone é obrigatório'
      }),
    message: Joi.string()
      .required()
      .min(1)
      .max(4096)
      .messages({
        'string.empty': 'Mensagem é obrigatória',
        'string.min': 'Mensagem deve ter pelo menos 1 caractere',
        'string.max': 'Mensagem deve ter no máximo 4096 caracteres',
        'any.required': 'Mensagem é obrigatória'
      }),
    type: Joi.string()
      .valid('text', 'image', 'video', 'audio', 'document', 'sticker')
      .default('text')
      .messages({
        'any.only': 'Tipo deve ser: text, image, video, audio, document ou sticker',
        'string.empty': 'Tipo não pode ser vazio'
      }),
    mediaUrl: Joi.string()
      .uri()
      .optional()
      .messages({
        'string.uri': 'URL da mídia deve ser uma URL válida'
      }),
    caption: Joi.string()
      .max(1024)
      .optional()
      .messages({
        'string.max': 'Legenda deve ter no máximo 1024 caracteres'
      })
  })
};

// Schemas para Mídia
export const mediaSchemas = {
  // Upload de mídia
  uploadMedia: Joi.object({
    sessionId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'sessionId é obrigatório',
        'string.min': 'sessionId deve ter pelo menos 3 caracteres',
        'string.max': 'sessionId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'sessionId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'sessionId é obrigatório'
      }),
    type: Joi.string()
      .required()
      .valid('image', 'video', 'audio', 'document', 'sticker')
      .messages({
        'string.empty': 'Tipo de mídia é obrigatório',
        'any.only': 'Tipo deve ser: image, video, audio, document ou sticker',
        'any.required': 'Tipo de mídia é obrigatório'
      })
  }),

  // Buscar mídia
  getMedia: Joi.object({
    mediaId: Joi.string()
      .required()
      .min(1)
      .max(100)
      .messages({
        'string.empty': 'mediaId é obrigatório',
        'string.min': 'mediaId deve ter pelo menos 1 caractere',
        'string.max': 'mediaId deve ter no máximo 100 caracteres',
        'any.required': 'mediaId é obrigatório'
      })
  })
};

// Schemas para WebSocket
export const websocketSchemas = {
  // Comando WebSocket
  websocketCommand: Joi.object({
    type: Joi.string()
      .required()
      .valid('messages:list', 'messages:send', 'messages:update')
      .messages({
        'string.empty': 'Tipo de comando é obrigatório',
        'any.only': 'Tipo deve ser: messages:list, messages:send ou messages:update',
        'any.required': 'Tipo de comando é obrigatório'
      }),
    instanceId: Joi.string()
      .required()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .messages({
        'string.empty': 'instanceId é obrigatório',
        'string.min': 'instanceId deve ter pelo menos 3 caracteres',
        'string.max': 'instanceId deve ter no máximo 50 caracteres',
        'string.pattern.base': 'instanceId deve conter apenas letras, números, hífens e underscores',
        'any.required': 'instanceId é obrigatório'
      }),
    payload: Joi.object().optional()
  }),

  // Payload para envio de mensagem via WebSocket
  websocketSendMessage: Joi.object({
    to: Joi.string()
      .required()
      .pattern(/^[0-9]+@s\.whatsapp\.net$|^[0-9]+$/)
      .messages({
        'string.empty': 'Número de telefone é obrigatório',
        'string.pattern.base': 'Formato de telefone inválido. Use apenas números ou formato WhatsApp',
        'any.required': 'Número de telefone é obrigatório'
      }),
    message: Joi.string()
      .required()
      .min(1)
      .max(4096)
      .messages({
        'string.empty': 'Mensagem é obrigatória',
        'string.min': 'Mensagem deve ter pelo menos 1 caractere',
        'string.max': 'Mensagem deve ter no máximo 4096 caracteres',
        'any.required': 'Mensagem é obrigatória'
      }),
    type: Joi.string()
      .valid('text', 'image', 'video', 'audio', 'document', 'sticker')
      .default('text')
      .messages({
        'any.only': 'Tipo deve ser: text, image, video, audio, document ou sticker',
        'string.empty': 'Tipo não pode ser vazio'
      })
  })
};

// Schemas para Health Check
export const healthSchemas = {
  // Health check não precisa de validação específica
  healthCheck: Joi.object({})
};

// Schemas para RabbitMQ
export const rabbitMQSchemas = {
  // Status das filas
  queueStatus: Joi.object({}),
  
  // Mensagens da fila
  queueMessages: Joi.object({
    queueName: Joi.string()
      .required()
      .min(1)
      .max(100)
      .messages({
        'string.empty': 'Nome da fila é obrigatório',
        'string.min': 'Nome da fila deve ter pelo menos 1 caractere',
        'string.max': 'Nome da fila deve ter no máximo 100 caracteres',
        'any.required': 'Nome da fila é obrigatório'
      }),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .messages({
        'number.base': 'Limit deve ser um número',
        'number.integer': 'Limit deve ser um número inteiro',
        'number.min': 'Limit deve ser pelo menos 1',
        'number.max': 'Limit deve ser no máximo 100'
      })
  })
};

// Exportar todos os schemas
export const schemas = {
  session: sessionSchemas,
  message: messageSchemas,
  media: mediaSchemas,
  websocket: websocketSchemas,
  health: healthSchemas,
  rabbitmq: rabbitMQSchemas
}; 