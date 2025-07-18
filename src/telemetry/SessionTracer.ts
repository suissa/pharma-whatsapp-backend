import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

export class SessionTracer {
  private static tracer = trace.getTracer('pharma-whatsapp-session');

  /**
   * Criar span para criação de sessão
   */
  public static traceSessionCreation(sessionId: string): any {
    return SessionTracer.tracer.startSpan('session.creation', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.creation.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Criar span para inicialização de sessões existentes
   */
  public static traceSessionInitialization(sessionCount: number): any {
    return SessionTracer.tracer.startSpan('session.initialization', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.initialization.count': sessionCount,
        'session.initialization.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Criar span para evento de conexão
   */
  public static traceConnectionEvent(sessionId: string, connectionStatus: string, user?: any): any {
    const span = SessionTracer.tracer.startSpan('session.connection.event', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.connection.status': connectionStatus,
        'session.connection.timestamp': new Date().toISOString(),
      },
    });

    if (user) {
      span.setAttributes({
        'session.user.id': user.id,
        'session.user.name': user.name,
      });
    }

    if (connectionStatus === 'close') {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    return span;
  }

  /**
   * Criar span para envio de mensagem
   */
  public static traceMessageSend(sessionId: string, recipient: string, messageType: string): any {
    return SessionTracer.tracer.startSpan('session.message.send', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.message.recipient': recipient,
        'session.message.type': messageType,
        'session.message.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Criar span para recebimento de mensagem
   */
  public static traceMessageReceive(sessionId: string, sender: string, messageId: string, messageType: string): any {
    return SessionTracer.tracer.startSpan('session.message.receive', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.message.sender': sender,
        'session.message.id': messageId,
        'session.message.type': messageType,
        'session.message.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Criar span para processamento de IA
   */
  public static traceAIProcessing(sessionId: string, messageId: string, content: string): any {
    return SessionTracer.tracer.startSpan('session.ai.processing', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.message.id': messageId,
        'session.ai.content.length': content.length,
        'session.ai.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Criar span para reconexão de sessão
   */
  public static traceSessionReconnect(sessionId: string, attempt: number, maxAttempts: number): any {
    const span = SessionTracer.tracer.startSpan('session.reconnect', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.reconnect.attempt': attempt,
        'session.reconnect.maxAttempts': maxAttempts,
        'session.reconnect.timestamp': new Date().toISOString(),
      },
    });

    if (attempt >= maxAttempts) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Max reconnection attempts reached' });
    }

    return span;
  }

  /**
   * Criar span para conflito de stream
   */
  public static traceStreamConflict(sessionId: string, attempt: number, maxAttempts: number): any {
    const span = SessionTracer.tracer.startSpan('session.stream.conflict', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.stream.conflict.attempt': attempt,
        'session.stream.conflict.maxAttempts': maxAttempts,
        'session.stream.conflict.timestamp': new Date().toISOString(),
      },
    });

    if (attempt >= maxAttempts) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Max stream conflict resolution attempts reached' });
    }

    return span;
  }

  /**
   * Criar span para download de mídia
   */
  public static traceMediaDownload(sessionId: string, messageId: string, mediaType: string, fileSize?: number): any {
    const span = SessionTracer.tracer.startSpan('session.media.download', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.message.id': messageId,
        'session.media.type': mediaType,
        'session.media.download.timestamp': new Date().toISOString(),
      },
    });

    if (fileSize) {
      span.setAttributes({
        'session.media.file.size': fileSize,
      });
    }

    return span;
  }

  /**
   * Criar span para rate limiting
   */
  public static traceRateLimit(sessionId: string, recipient: string, action: string, allowed: boolean): any {
    const span = SessionTracer.tracer.startSpan('session.rate.limit', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.rate.recipient': recipient,
        'session.rate.action': action,
        'session.rate.allowed': allowed,
        'session.rate.timestamp': new Date().toISOString(),
      },
    });

    if (!allowed) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Rate limit exceeded' });
    }

    return span;
  }

  /**
   * Criar span para operação de banco de dados
   */
  public static traceDatabaseOperation(operation: string, sessionId: string, table?: string): any {
    return SessionTracer.tracer.startSpan(`session.database.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'session.id': sessionId,
        'session.database.operation': operation,
        'session.database.table': table || 'unknown',
        'session.database.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Adicionar evento ao span atual
   */
  public static addEvent(name: string, attributes?: Record<string, any>): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.addEvent(name, attributes);
    }
  }

  /**
   * Adicionar atributos ao span atual
   */
  public static addAttributes(attributes: Record<string, any>): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.setAttributes(attributes);
    }
  }

  /**
   * Marcar span como erro
   */
  public static markError(error: Error, message?: string): void {
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      currentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: message || error.message,
      });
      currentSpan.recordException(error);
    }
  }
} 