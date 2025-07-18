import request from 'supertest';
import app from './index';

describe('POST /api/sessions/create', () => {
  it('retorna 400 para instanceId ausente', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({});

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('instanceId é obrigatório');
  });

  it('retorna 201 para instanceId válido', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: 'test-instance-123' });

    expect(resp.statusCode).toBe(201);
    expect(resp.body.success).toBe(true);
    expect(resp.body.data.instanceId).toBe('test-instance-123');
  });

  it('retorna 400 para instanceId muito curto', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: 'ab' });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('instanceId deve ter pelo menos 3 caracteres');
  });

  it('retorna 400 para instanceId muito longo', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: 'a'.repeat(51) });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('instanceId deve ter no máximo 50 caracteres');
  });

  it('retorna 400 para instanceId com caracteres inválidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: 'test@instance#123' });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('instanceId deve conter apenas letras, números, hífens e underscores');
  });

  it('retorna 400 para instanceId vazio', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: '' });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('instanceId é obrigatório');
  });

  it('retorna 400 para instanceId com espaços', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: 'test instance 123' });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('instanceId deve conter apenas letras, números, hífens e underscores');
  });

  it('retorna 201 para instanceId com caracteres especiais permitidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: 'test-instance_123' });

    expect(resp.statusCode).toBe(201);
    expect(resp.body.success).toBe(true);
    expect(resp.body.data.instanceId).toBe('test-instance_123');
  });

  it('retorna 201 para instanceId apenas números', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: '123456789' });

    expect(resp.statusCode).toBe(201);
    expect(resp.body.success).toBe(true);
    expect(resp.body.data.instanceId).toBe('123456789');
  });

  it('retorna 201 para instanceId apenas letras', async () => {
    const resp = await request(app)
      .post('/api/sessions/create')
      .send({ instanceId: 'testinstance' });

    expect(resp.statusCode).toBe(201);
    expect(resp.body.success).toBe(true);
    expect(resp.body.data.instanceId).toBe('testinstance');
  });
});

describe('POST /api/sessions/:sessionId/reconnect', () => {
  it('retorna 200 para sessionId válido', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/reconnect');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('test-session-123');
  });

  it('retorna 400 para sessionId muito curto', async () => {
    const resp = await request(app)
      .post('/api/sessions/ab/reconnect');

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
  });

  it('retorna 400 para sessionId muito longo', async () => {
    const resp = await request(app)
      .post(`/api/sessions/${'a'.repeat(51)}/reconnect`);

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve ter no máximo 50 caracteres');
  });

  it('retorna 400 para sessionId com caracteres inválidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/test$session*123/reconnect');

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
  });

  it('retorna 200 para sessionId com caracteres especiais permitidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session_123/reconnect');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('test-session_123');
  });

  it('retorna 200 para sessionId apenas números', async () => {
    const resp = await request(app)
      .post('/api/sessions/123456789/reconnect');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('123456789');
  });

  it('retorna 200 para sessionId apenas letras', async () => {
    const resp = await request(app)
      .post('/api/sessions/testsession/reconnect');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('testsession');
  });
});

describe('POST /api/sessions/:sessionId/send', () => {
  it('retorna 200 para dados válidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de mensagem válida',
        type: 'text'
      });

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
  });

  it('retorna 400 para sessionId inválido', async () => {
    const resp = await request(app)
      .post('/api/sessions/ab/send')
      .send({
        to: '5511999999999',
        message: 'Teste de mensagem',
        type: 'text'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
  });

  it('retorna 400 para campo "to" ausente', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        message: 'Teste de mensagem',
        type: 'text'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('Número de telefone é obrigatório');
  });

  it('retorna 400 para campo "to" vazio', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '',
        message: 'Teste de mensagem',
        type: 'text'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('Número de telefone é obrigatório');
  });

  it('retorna 400 para campo "to" com formato inválido', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '123',
        message: 'Teste de mensagem',
        type: 'text'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('Formato de telefone inválido. Use apenas números ou formato WhatsApp');
  });

  it('retorna 400 para campo "message" ausente', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        type: 'text'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('Mensagem é obrigatória');
  });

  it('retorna 400 para campo "message" vazio', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: '',
        type: 'text'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('Mensagem é obrigatória');
  });

  it('retorna 400 para campo "message" muito longo', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'a'.repeat(4097),
        type: 'text'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('Mensagem deve ter no máximo 4096 caracteres');
  });

  it('retorna 400 para campo "type" inválido', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de mensagem',
        type: 'invalid'
      });

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('Tipo deve ser: text, image, video, audio, document ou sticker');
  });

  it('retorna 200 para tipo "text" (padrão)', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de mensagem'
      });

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
  });

  it('retorna 200 para tipo "image"', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de imagem',
        type: 'image'
      });

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
  });

  it('retorna 200 para tipo "video"', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de vídeo',
        type: 'video'
      });

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
  });

  it('retorna 200 para tipo "audio"', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de áudio',
        type: 'audio'
      });

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
  });

  it('retorna 200 para tipo "document"', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de documento',
        type: 'document'
      });

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
  });

  it('retorna 200 para tipo "sticker"', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/send')
      .send({
        to: '5511999999999',
        message: 'Teste de sticker',
        type: 'sticker'
      });

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
  });
});

describe('POST /api/sessions/:sessionId/force-cleanup', () => {
  it('retorna 200 para sessionId válido', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/force-cleanup');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('test-session-123');
    expect(resp.body.message).toContain('Limpeza forçada da sessão');
  });

  it('retorna 400 para sessionId muito curto', async () => {
    const resp = await request(app)
      .post('/api/sessions/ab/force-cleanup');

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
  });

  it('retorna 400 para sessionId muito longo', async () => {
    const resp = await request(app)
      .post(`/api/sessions/${'a'.repeat(51)}/force-cleanup`);

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve ter no máximo 50 caracteres');
  });

  it('retorna 400 para sessionId com caracteres inválidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/test$session*123/force-cleanup');

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
  });

  it('retorna 200 para sessionId com caracteres especiais permitidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session_123/force-cleanup');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('test-session_123');
  });

  it('retorna 200 para sessionId apenas números', async () => {
    const resp = await request(app)
      .post('/api/sessions/123456789/force-cleanup');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('123456789');
  });

  it('retorna 200 para sessionId apenas letras', async () => {
    const resp = await request(app)
      .post('/api/sessions/testsession/force-cleanup');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('testsession');
  });
});

describe('GET /api/sessions/retry-stats', () => {
  it('retorna 200 com estatísticas de retry', async () => {
    const resp = await request(app)
      .get('/api/sessions/retry-stats');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body).toHaveProperty('retryStats');
    expect(resp.body).toHaveProperty('totalSessionsWithRetries');
    expect(typeof resp.body.totalSessionsWithRetries).toBe('number');
  });

  it('retorna estrutura correta das estatísticas', async () => {
    const resp = await request(app)
      .get('/api/sessions/retry-stats');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(typeof resp.body.retryStats).toBe('object');
    expect(Array.isArray(Object.keys(resp.body.retryStats))).toBe(true);
  });
});

describe('POST /api/sessions/:sessionId/reset-retry', () => {
  it('retorna 200 para sessionId válido', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session-123/reset-retry');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('test-session-123');
    expect(resp.body.message).toContain('Contador de retry resetado');
  });

  it('retorna 400 para sessionId muito curto', async () => {
    const resp = await request(app)
      .post('/api/sessions/ab/reset-retry');

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
  });

  it('retorna 400 para sessionId muito longo', async () => {
    const resp = await request(app)
      .post(`/api/sessions/${'a'.repeat(51)}/reset-retry`);

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve ter no máximo 50 caracteres');
  });

  it('retorna 400 para sessionId com caracteres inválidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/test$session*123/reset-retry');

    expect(resp.statusCode).toBe(400);
    expect(resp.body.success).toBe(false);
    expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
  });

  it('retorna 200 para sessionId com caracteres especiais permitidos', async () => {
    const resp = await request(app)
      .post('/api/sessions/test-session_123/reset-retry');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('test-session_123');
  });

  it('retorna 200 para sessionId apenas números', async () => {
    const resp = await request(app)
      .post('/api/sessions/123456789/reset-retry');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('123456789');
  });

  it('retorna 200 para sessionId apenas letras', async () => {
    const resp = await request(app)
      .post('/api/sessions/testsession/reset-retry');

    expect(resp.statusCode).toBe(200);
    expect(resp.body.success).toBe(true);
    expect(resp.body.sessionId).toBe('testsession');
  });
}); 