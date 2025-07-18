import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { schemas } from '../validators/schemas';
import logger from '../utils/Logger';

interface ValidationOptions {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export function validateRequest(options: ValidationOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: string[] = [];

      // Validar body
      if (options.body && req.body) {
        const { error } = options.body.validate(req.body, {
          abortEarly: false,
          stripUnknown: true
        });
        
        if (error) {
          errors.push(...error.details.map(detail => detail.message));
        }
      }

      // Validar query
      if (options.query && req.query) {
        const { error } = options.query.validate(req.query, {
          abortEarly: false,
          stripUnknown: true
        });
        
        if (error) {
          errors.push(...error.details.map(detail => detail.message));
        }
      }

      // Validar params
      if (options.params && req.params) {
        const { error } = options.params.validate(req.params, {
          abortEarly: false,
          stripUnknown: true
        });
        
        if (error) {
          errors.push(...error.details.map(detail => detail.message));
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Erro de validação',
          errors: errors
        });
      }

      next();
    } catch (error) {
      logger.error('Erro na validação:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno na validação'
      });
    }
  };
}

// Middlewares específicos para cada rota
export const sessionValidation = {
  create: validateRequest({ body: schemas.session.createSession }),
  getById: validateRequest({ params: schemas.session.sessionId }),
  delete: validateRequest({ params: schemas.session.sessionId }),
  sendMessage: validateRequest({ 
    params: schemas.session.sessionId,
    body: schemas.session.sendMessage 
  }),
  getQRCode: validateRequest({ params: schemas.session.sessionId }),
  getQRCodePNG: validateRequest({ params: schemas.session.sessionId }),
  getQRCodeSVG: validateRequest({ params: schemas.session.sessionId })
};

export const messageValidation = {
  list: validateRequest({ 
    params: schemas.message.listMessages,
    query: Joi.object({
      limit: schemas.message.listMessages.extract('limit'),
      offset: schemas.message.listMessages.extract('offset')
    })
  }),
  getById: validateRequest({ 
    params: Joi.object({
      sessionId: schemas.message.listMessages.extract('sessionId'),
      messageId: schemas.message.getMessage.extract('messageId')
    })
  }),
  send: validateRequest({ body: schemas.message.sendMessageAPI })
};

export const mediaValidation = {
  upload: validateRequest({ 
    params: schemas.media.uploadMedia,
    body: Joi.object({
      file: Joi.any().required().messages({
        'any.required': 'Arquivo é obrigatório'
      })
    })
  }),
  get: validateRequest({ params: schemas.media.getMedia })
};

export const websocketValidation = {
  command: validateRequest({ body: schemas.websocket.websocketCommand }),
  sendMessage: validateRequest({ body: schemas.websocket.websocketSendMessage })
};

export const rabbitMQValidation = {
  status: validateRequest({}),
  messages: validateRequest({ 
    params: schemas.rabbitmq.queueMessages,
    query: Joi.object({
      limit: schemas.rabbitmq.queueMessages.extract('limit')
    })
  })
}; 