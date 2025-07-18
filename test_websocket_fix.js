const WebSocket = require('ws');

logger.info('🧪 Testando correções do WebSocket...');

// Teste 1: Conexão básica
async function testBasicConnection() {
  logger.info('\n📋 Teste 1: Conexão básica');
  
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8899');
    
    ws.on('open', () => {
      logger.info('✅ Conexão estabelecida com sucesso');
      ws.close();
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      logger.info('📨 Mensagem recebida:', message.type);
      
      if (message.type === 'connection') {
        logger.info('✅ Mensagem de boas-vindas recebida');
      }
    });
    
    ws.on('close', (code, reason) => {
      logger.info(`🔌 Conexão fechada: ${code} - ${reason}`);
      resolve(true);
    });
    
    ws.on('error', (error) => {
      logger.error('❌ Erro na conexão:', error.message);
      resolve(false);
    });
  });
}

// Teste 2: Heartbeat
async function testHeartbeat() {
  logger.info('\n📋 Teste 2: Heartbeat');
  
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8899');
    let heartbeatReceived = false;
    
    ws.on('open', () => {
      logger.info('✅ Conexão estabelecida para teste de heartbeat');
      
      // Enviar ping após 1 segundo
      setTimeout(() => {
        ws.send('ping');
        logger.info('💓 Ping enviado');
      }, 1000);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'heartbeat' && message.message === 'pong') {
        logger.info('✅ Heartbeat funcionando corretamente');
        heartbeatReceived = true;
        ws.close();
      }
    });
    
    ws.on('close', () => {
      logger.info('🔌 Conexão de teste fechada');
      resolve(heartbeatReceived);
    });
    
    ws.on('error', (error) => {
      logger.error('❌ Erro no teste de heartbeat:', error.message);
      resolve(false);
    });
  });
}

// Teste 3: Comando com sessão inexistente
async function testNonExistentSession() {
  logger.info('\n📋 Teste 3: Comando com sessão inexistente');
  
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8899');
    let responseReceived = false;
    
    ws.on('open', () => {
      logger.info('✅ Conexão estabelecida para teste de sessão inexistente');
      
      // Enviar comando para sessão que não existe
      setTimeout(() => {
        ws.send('sessao_inexistente:messages:list');
        logger.info('📤 Comando enviado para sessão inexistente');
      }, 1000);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'messages:list' && message.info) {
        logger.info('✅ Resposta adequada para sessão inexistente:', message.info);
        responseReceived = true;
        ws.close();
      }
    });
    
    ws.on('close', () => {
      logger.info('🔌 Conexão de teste fechada');
      resolve(responseReceived);
    });
    
    ws.on('error', (error) => {
      logger.error('❌ Erro no teste de sessão inexistente:', error.message);
      resolve(false);
    });
  });
}

// Executar todos os testes
async function runAllTests() {
  logger.info('🚀 Iniciando testes das correções do WebSocket...\n');
  
  const results = {
    basicConnection: await testBasicConnection(),
    heartbeat: await testHeartbeat(),
    nonExistentSession: await testNonExistentSession()
  };
  
  logger.info('\n📊 Resultados dos testes:');
  logger.info('   ✅ Conexão básica:', results.basicConnection ? 'PASSOU' : 'FALHOU');
  logger.info('   💓 Heartbeat:', results.heartbeat ? 'PASSOU' : 'FALHOU');
  logger.info('   ⚠️ Sessão inexistente:', results.nonExistentSession ? 'PASSOU' : 'FALHOU');
  
  const allPassed = Object.values(results).every(result => result);
  
  if (allPassed) {
    logger.info('\n🎉 Todos os testes passaram! As correções estão funcionando.');
  } else {
    logger.info('\n⚠️ Alguns testes falharam. Verificar implementação.');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Executar testes
runAllTests().catch(error => {
  logger.error('❌ Erro ao executar testes:', error);
  process.exit(1);
}); 