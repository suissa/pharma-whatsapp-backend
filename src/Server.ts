import dotenv from 'dotenv';
import path from 'path';
import logger from './utils/Logger';
// ✅ CARREGAR VARIÁVEIS DE AMBIENTE NO INÍCIO
dotenv.config({ path: path.resolve(__dirname, '../.env') });


import { SessionManager } from './services/SessionManager';
import { ExpressApp } from './config/ExpressApp';
import { createIndexRoutes } from './controllers/indexController';
import { createSessionRoutes } from './controllers/sessionController';
import { createHealthRoutes } from './controllers/healthController';
import { createMediaRoutes } from './controllers/mediaController';
import { createMessageRoutes } from './controllers/messageController';
import { WebSocketServer } from './websocket/WebSocketServer';
import { UnifiedConsumer } from './services/UnifiedConsumer';
import { MessageBridge } from './services/MessageBridge';
import { OpenTelemetryConfig } from './telemetry/OpenTelemetryConfig';

class ModularServer {
  private sessionManager: SessionManager;
  private expressApp: ExpressApp;
  private webSocketServer: WebSocketServer;
  private messageConsumer: UnifiedConsumer;
  private messageBridge: MessageBridge;

  constructor() {
      logger.info('🚀 Inicializando servidor modular...');
  logger.info('⚙️ Configurações carregadas do .env');
    
    // 🔧 Inicializar OpenTelemetry
    OpenTelemetryConfig.getInstance().initialize();
    
    // Inicializar componentes
    this.sessionManager = new SessionManager();
    this.expressApp = new ExpressApp();
    this.webSocketServer = new WebSocketServer(this.sessionManager, 8899);
    this.messageConsumer = new UnifiedConsumer('default', this.sessionManager);
    this.messageBridge = new MessageBridge();
    
    // Conectar WebSocketServer ao MessageDatabaseConsumer para broadcasting automático
    this.sessionManager.setWebSocketServer(this.webSocketServer);
    
    this.setupRoutes();
    this.startWebSocketAndConsumer();
  }

  private setupRoutes(): void {
    logger.info('🔗 Configurando rotas...');
    
    // Configurar todas as rotas
    const routes = [
      { path: '/', router: createIndexRoutes(this.sessionManager) },
      { path: '/api/sessions', router: createSessionRoutes(this.sessionManager) },
      { path: '/api/health', router: createHealthRoutes(this.sessionManager) },
      { path: '/api/media', router: createMediaRoutes(this.sessionManager) },
      { path: '/api/messages', router: createMessageRoutes(this.sessionManager) }
    ];

    this.expressApp.setupRoutes(routes);
    logger.info('✅ Rotas configuradas com sucesso');
  }

  private async startWebSocketAndConsumer(): Promise<void> {
    try {
      logger.info('🌐 Inicializando WebSocket Server, MessageConsumer e MessageBridge...');
      
      // Inicializar WebSocket Server
      this.webSocketServer.start();
      
      // Inicializar UnifiedConsumer
      await this.messageConsumer.startConsuming();
      
      // Inicializar MessageBridge (ponte RabbitMQ → Redis → Banco)
      await this.messageBridge.start();
      
      logger.info('✅ WebSocket Server, MessageConsumer e MessageBridge inicializados com sucesso');
      logger.info('🔄 Fluxo completo: WebSocket → RabbitMQ → WhatsApp | WhatsApp → RabbitMQ → Redis → Banco');
    } catch (error) {
      logger.error('🔴 Erro ao inicializar WebSocket Server, MessageConsumer e MessageBridge:', error);
    }
  }

  async start(): Promise<void> {
    try {
      logger.info('🔧 Iniciando componentes do servidor...');
      
      // Aguardar um pouco para o SessionManager inicializar as sessões
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Iniciar servidor Express
      const PORT = parseInt(process.env.PORT || '3000', 10);
      await this.expressApp.listen(PORT);
      
      logger.info('🎯 Servidor modular iniciado com sucesso!');
      logger.info('📊 Componentes ativos:');
      logger.info('   ✅ SessionManager - Gerenciamento de sessões WhatsApp');
      logger.info('   ✅ ExpressApp - Servidor HTTP com middleware');
      logger.info('   ✅ WebSocketServer - Comandos via WebSocket na porta 8899');
      logger.info('   ✅ MessageConsumer - Processamento de comandos RabbitMQ');
      logger.info('   ✅ MessageDatabaseConsumer - Mensagens recebidas RabbitMQ → Database');
      logger.info('   ✅ Rotas modulares - Sessions, Health, Index');
      logger.info('   ✅ CORS configurado - Frontend integrado');
      logger.info('🌐 WebSocket disponível: ws://localhost:8899');
      logger.info('📨 Comandos WebSocket:');
      logger.info('   📋 {instanceID}:messages:list - Listar mensagens');
      logger.info('   📤 {instanceID}:messages:send {"to":"5511999999999","message":"texto"} - Enviar mensagem');
      logger.info('   🔄 {instanceID}:messages:update - Última mensagem recebida');
      
    } catch (error) {
      logger.error('🔴 Erro ao iniciar servidor modular:', error);
      process.exit(1);
    }
  }

  // Método para obter referências dos componentes (útil para testes)
  getComponents() {
    return {
      sessionManager: this.sessionManager,
      expressApp: this.expressApp,
      webSocketServer: this.webSocketServer,
      messageConsumer: this.messageConsumer
    };
  }
}

// Tratamento de sinais para graceful shutdown
process.on('SIGTERM', () => {
      logger.info('📴 Recebido SIGTERM, encerrando graciosamente...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('📴 Recebido SIGINT, encerrando graciosamente...');
  process.exit(0);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  logger.error('🔴 Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('🔴 Promise rejeitada não tratada:', reason);
  logger.error('Promise:', promise);
  process.exit(1);
});

// Inicializar servidor
const server = new ModularServer();
server.start().catch(error => {
  logger.error('🔴 Falha crítica ao iniciar aplicação modular:', error);
    process.exit(1);
});
