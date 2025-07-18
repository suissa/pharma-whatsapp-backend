import { Request, Response, NextFunction } from 'express';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

export class TraceMiddleware {
  private static tracer = trace.getTracer('pharma-whatsapp-http');

  /**
   * Middleware para tracing de rotas HTTP
   */
  public static traceRequest(req: Request, res: Response, next: NextFunction): void {
    const span = TraceMiddleware.tracer.startSpan(`${req.method} ${req.path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        [SemanticAttributes.HTTP_METHOD]: req.method,
        [SemanticAttributes.HTTP_URL]: req.url,
        [SemanticAttributes.HTTP_TARGET]: req.path,
        [SemanticAttributes.HTTP_HOST]: req.get('host') || 'unknown',
        [SemanticAttributes.HTTP_USER_AGENT]: req.get('user-agent') || 'unknown',
        'http.request.content.type': req.get('content-type') || 'unknown',
        'http.request.id': req.headers['x-request-id'] || 'unknown',
        'http.client.ip': req.ip || req.connection.remoteAddress || 'unknown',
      },
    });

    // Adicionar span ao contexto da requisição
    (req as any).span = span;

    // Interceptar o final da resposta
    const originalSend = res.send;
    res.send = function(body: any) {
      span.setAttributes({
        [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
        'http.response.content.type': res.get('content-type') || 'unknown',
        'http.response.size': JSON.stringify(body).length,
      });

      if (res.statusCode >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
      return originalSend.call(this, body);
    };

    // Interceptar erros
    const originalError = res.status;
    res.status = function(code: number) {
      if (code >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${code}` });
      }
      return originalError.call(this, code);
    };

    next();
  }

  /**
   * Middleware para tracing de erros
   */
  public static traceError(error: Error, req: Request, res: Response, next: NextFunction): void {
    const span = (req as any).span;
    
    if (span) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      
      span.recordException(error);
      span.end();
    }

    next(error);
  }

  /**
   * Função utilitária para criar spans personalizados
   */
  public static createSpan(name: string, attributes?: Record<string, any>) {
    return TraceMiddleware.tracer.startSpan(name, {
      attributes,
    });
  }

  /**
   * Função utilitária para adicionar eventos ao span atual
   */
  public static addEvent(name: string, attributes?: Record<string, any>) {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.addEvent(name, attributes);
    }
  }

  /**
   * Função utilitária para adicionar atributos ao span atual
   */
  public static addAttributes(attributes: Record<string, any>) {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.setAttributes(attributes);
    }
  }
} 