const { ExpressApp } = require('../../src/config/ExpressApp');
const { createIndexRoutes } = require('../../src/controllers/indexController');
const { createSessionRoutes } = require('../../src/controllers/sessionController');
const { createHealthRoutes } = require('../../src/controllers/healthController');
const { createMediaRoutes } = require('../../src/controllers/mediaController');
const { createMessageRoutes } = require('../../src/controllers/messageController');

// Mock do SessionManager para testes
class MockSessionManager {
  constructor() {
    logger.info('🧪 Mock SessionManager inicializado para testes');
    this.sessions = new Map(); // Armazenar sessões criadas
    this.retryStats = new Map(); // Mock para estatísticas de retry
  }

  async createSession(sessionId) {
    logger.info(`🧪 Mock: Criando sessão ${sessionId}`);
    // Simular sucesso sempre para testes de validação
    const session = { id: sessionId, status: 'connected' };
    this.sessions.set(sessionId, session);
    return session;
  }

  async reconnectSession(sessionId) {
    logger.info(`🧪 Mock: Reconectando sessão ${sessionId}`);
    return { id: sessionId, status: 'connected' };
  }

  async sendMessage(sessionId, to, message, type = 'text') {
    logger.info(`🧪 Mock: Enviando mensagem de ${sessionId} para ${to}: ${message}`);
    
    // Validar formato do telefone para simular comportamento real
    if (!to || to.length < 10 || !/^[0-9]+$/.test(to)) {
      throw new Error('Formato de telefone inválido. Use apenas números ou formato WhatsApp');
    }
    
    return { success: true, messageId: 'mock-message-id' };
  }

  getSession(sessionId) {
    // Retornar a sessão se existir, null caso contrário
    return this.sessions.get(sessionId) || null;
  }

  getAllSessions() {
    // Retornar array de sessões no formato esperado pelo controller
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.id,
      status: session.status,
      user: null
    }));
  }

  getActiveSessionsCount() {
    return this.sessions.size;
  }

  getActiveSessionIds() {
    return Array.from(this.sessions.keys());
  }

  getQrCode(sessionId) {
    return null;
  }

  clearQrCode(sessionId) {
    // Mock method
  }

  setWebSocketServer(webSocketServer) {
    // Mock method
  }

  async forceCleanupSession(sessionId) {
    logger.info(`🧪 Mock: Forçando limpeza da sessão ${sessionId}`);
    // Simular sucesso sempre para testes de validação
    return Promise.resolve();
  }

  getSessionRetryStats() {
    logger.info('🧪 Mock: Obtendo estatísticas de retry');
    // Retornar objeto vazio para simular estatísticas
    return {};
  }

  resetSessionRetryCount(sessionId) {
    logger.info(`🧪 Mock: Resetando contador de retry para sessão ${sessionId}`);
    // Simular sucesso sempre para testes de validação
  }
}

// Criar instância da aplicação Express
const expressApp = new ExpressApp();
const sessionManager = new MockSessionManager();

// Configurar rotas
const routes = [
  { path: '/', router: createIndexRoutes(sessionManager) },
  { path: '/api/sessions', router: createSessionRoutes(sessionManager) },
  { path: '/api/health', router: createHealthRoutes(sessionManager) },
  { path: '/api/media', router: createMediaRoutes(sessionManager) },
  { path: '/api/messages', router: createMessageRoutes(sessionManager) }
];

expressApp.setupRoutes(routes);

// Exportar a aplicação Express para testes
module.exports = expressApp.app; 