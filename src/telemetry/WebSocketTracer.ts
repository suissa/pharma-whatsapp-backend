import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import WebSocket from 'ws';

export class WebSocketTracer {
  private static tracer = trace.getTracer('pharma-whatsapp-websocket');

  /**
   * Criar span para conexão WebSocket
   */
  public static traceConnection(ws: WebSocket, request: any): any {
    const clientIp = request.socket.remoteAddress;
    
    return WebSocketTracer.tracer.startSpan('websocket.connection', {
      kind: SpanKind.SERVER,
      attributes: {
        'websocket.client.ip': clientIp,
        'websocket.client.port': request.socket.remotePort,
        'websocket.url': request.url,
        'websocket.protocol': request.headers['sec-websocket-protocol'] || 'unknown',
        'websocket.user.agent': request.headers['user-agent'] || 'unknown',
      },
    });
  }

  /**
   * Criar span para mensagem WebSocket recebida
   */
  public static traceMessageReceived(rawMessage: string, command?: any): any {
    const span = WebSocketTracer.tracer.startSpan('websocket.message.received', {
      kind: SpanKind.SERVER,
      attributes: {
        'websocket.message.size': rawMessage.length,
        'websocket.message.type': 'text',
      },
    });

    if (command) {
      span.setAttributes({
        'websocket.command.type': command.type,
        'websocket.command.instanceId': command.instanceId,
        'websocket.command.hasPayload': !!command.payload,
      });
    }

    return span;
  }

  /**
   * Criar span para processamento de comando
   */
  public static traceCommandProcessing(commandType: string, instanceId: string): any {
    return WebSocketTracer.tracer.startSpan(`websocket.command.${commandType}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'websocket.command.type': commandType,
        'websocket.command.instanceId': instanceId,
        'websocket.command.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Criar span para envio de resposta
   */
  public static traceResponseSent(responseType: string, success: boolean): any {
    const span = WebSocketTracer.tracer.startSpan('websocket.response.sent', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'websocket.response.type': responseType,
        'websocket.response.success': success,
        'websocket.response.timestamp': new Date().toISOString(),
      },
    });

    if (!success) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    return span;
  }

  /**
   * Criar span para desconexão WebSocket
   */
  public static traceDisconnection(code: number, reason: string): any {
    const span = WebSocketTracer.tracer.startSpan('websocket.disconnection', {
      kind: SpanKind.SERVER,
      attributes: {
        'websocket.disconnect.code': code,
        'websocket.disconnect.reason': reason,
        'websocket.disconnect.wasClean': code === 1000,
        'websocket.disconnect.timestamp': new Date().toISOString(),
      },
    });

    if (code !== 1000) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Disconnect code: ${code}` });
    }

    return span;
  }

  /**
   * Criar span para broadcast de mensagem
   */
  public static traceBroadcast(instanceId: string, messageId: string, clientCount: number): any {
    return WebSocketTracer.tracer.startSpan('websocket.broadcast', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'websocket.broadcast.instanceId': instanceId,
        'websocket.broadcast.messageId': messageId,
        'websocket.broadcast.clientCount': clientCount,
        'websocket.broadcast.timestamp': new Date().toISOString(),
      },
    });
  }

  /**
   * Criar span para heartbeat
   */
  public static traceHeartbeat(type: 'ping' | 'pong'): any {
    return WebSocketTracer.tracer.startSpan(`websocket.heartbeat.${type}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'websocket.heartbeat.type': type,
        'websocket.heartbeat.timestamp': new Date().toISOString(),
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