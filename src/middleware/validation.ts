import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export const validate = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];

    // Validar body
    if (schema.body) {
      const { error } = schema.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        errors.push(...error.details.map(detail => detail.message));
      }
    }

    // Validar query
    if (schema.query) {
      const { error } = schema.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        errors.push(...error.details.map(detail => detail.message));
      }
    }

    // Validar params
    if (schema.params) {
      const { error } = schema.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        errors.push(...error.details.map(detail => detail.message));
      }
    }

    // Se há erros, retornar erro de validação
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Erro de validação',
        errors: errors,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

// Middleware para validar apenas body
export const validateBody = (schema: Joi.ObjectSchema) => {
  return validate({ body: schema });
};

// Middleware para validar apenas query
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return validate({ query: schema });
};

// Middleware para validar apenas params
export const validateParams = (schema: Joi.ObjectSchema) => {
  return validate({ params: schema });
};

// Middleware para validar body e query
export const validateBodyAndQuery = (bodySchema: Joi.ObjectSchema, querySchema: Joi.ObjectSchema) => {
  return validate({ body: bodySchema, query: querySchema });
};

// Middleware para validar body e params
export const validateBodyAndParams = (bodySchema: Joi.ObjectSchema, paramsSchema: Joi.ObjectSchema) => {
  return validate({ body: bodySchema, params: paramsSchema });
};

// Middleware para validar query e params
export const validateQueryAndParams = (querySchema: Joi.ObjectSchema, paramsSchema: Joi.ObjectSchema) => {
  return validate({ query: querySchema, params: paramsSchema });
}; 