import request from 'supertest';
import app from './index';

describe('Session Error Handling - Erro 440', () => {
  describe('POST /api/sessions/:sessionId/force-cleanup', () => {
    it('deve retornar 200 para limpeza forçada de sessão com erro 440', async () => {
      const resp = await request(app)
        .post('/api/sessions/abc/force-cleanup'); // Mudado de 'ae' para 'abc' (3 caracteres)

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe('abc');
      expect(resp.body.message).toContain('Limpeza forçada da sessão');
    });

    it('deve retornar 400 para sessionId inválido na limpeza forçada', async () => {
      const resp = await request(app)
        .post('/api/sessions/a/force-cleanup');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
    });

    it('deve retornar 400 para sessionId com caracteres especiais na limpeza forçada', async () => {
      const resp = await request(app)
        .post('/api/sessions/test@session/force-cleanup');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
    });
  });

  describe('GET /api/sessions/retry-stats', () => {
    it('deve retornar estatísticas de retry válidas', async () => {
      const resp = await request(app)
        .get('/api/sessions/retry-stats');

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body).toHaveProperty('retryStats');
      expect(resp.body).toHaveProperty('totalSessionsWithRetries');
      expect(typeof resp.body.totalSessionsWithRetries).toBe('number');
      expect(resp.body.totalSessionsWithRetries).toBeGreaterThanOrEqual(0);
    });

    it('deve retornar objeto retryStats válido', async () => {
      const resp = await request(app)
        .get('/api/sessions/retry-stats');

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(typeof resp.body.retryStats).toBe('object');
      expect(resp.body.retryStats).not.toBeNull();
    });
  });

  describe('POST /api/sessions/:sessionId/reset-retry', () => {
    it('deve resetar contador de retry para sessão válida', async () => {
      const resp = await request(app)
        .post('/api/sessions/abc/reset-retry'); // Mudado de 'ae' para 'abc'

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe('abc');
      expect(resp.body.message).toContain('Contador de retry resetado');
    });

    it('deve retornar 400 para sessionId inválido no reset de retry', async () => {
      const resp = await request(app)
        .post('/api/sessions/ab/reset-retry');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
    });

    it('deve retornar 400 para sessionId com caracteres especiais no reset de retry', async () => {
      const resp = await request(app)
        .post('/api/sessions/test$session/reset-retry');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
    });
  });

  describe('POST /api/sessions/:sessionId/reconnect', () => {
    it('deve reconectar sessão com erro 440', async () => {
      const resp = await request(app)
        .post('/api/sessions/abc/reconnect'); // Mudado de 'ae' para 'abc'

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe('abc');
      expect(resp.body.message).toContain('Reconexão da sessão');
    });

    it('deve retornar 400 para sessionId inválido na reconexão', async () => {
      const resp = await request(app)
        .post('/api/sessions/ab/reconnect');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
    });
  });

  describe('Validação de Schemas - Casos Extremos', () => {
    it('deve rejeitar sessionId com 51 caracteres', async () => {
      const longSessionId = 'a'.repeat(51);
      const resp = await request(app)
        .post(`/api/sessions/${longSessionId}/force-cleanup`);

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve ter no máximo 50 caracteres');
    });

    it('deve aceitar sessionId com exatamente 50 caracteres', async () => {
      const maxSessionId = 'a'.repeat(50);
      const resp = await request(app)
        .post(`/api/sessions/${maxSessionId}/force-cleanup`);

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe(maxSessionId);
    });

    it('deve aceitar sessionId com exatamente 3 caracteres', async () => {
      const minSessionId = 'abc';
      const resp = await request(app)
        .post(`/api/sessions/${minSessionId}/force-cleanup`);

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe(minSessionId);
    });

    it('deve rejeitar sessionId com 2 caracteres', async () => {
      const shortSessionId = 'ab';
      const resp = await request(app)
        .post(`/api/sessions/${shortSessionId}/force-cleanup`);

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve ter pelo menos 3 caracteres');
    });
  });

  describe('Validação de Caracteres Especiais', () => {
    // Testar apenas caracteres que não causam problemas de roteamento
    const safeInvalidCharacters = ['@', '$', '&', '*', '+', '=', '!', '~', '`', ':', ';', '"', "'", '<', '>', ',', '.', ' '];

    safeInvalidCharacters.forEach(char => {
      it(`deve rejeitar sessionId com caractere especial: ${char}`, async () => {
        const invalidSessionId = `test${char}session`;
        const resp = await request(app)
          .post(`/api/sessions/${encodeURIComponent(invalidSessionId)}/force-cleanup`);

        expect(resp.statusCode).toBe(400);
        expect(resp.body.success).toBe(false);
        expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
      });
    });

    it('deve aceitar sessionId com hífen', async () => {
      const resp = await request(app)
        .post('/api/sessions/test-session/force-cleanup');

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe('test-session');
    });

    it('deve aceitar sessionId com underscore', async () => {
      const resp = await request(app)
        .post('/api/sessions/test_session/force-cleanup');

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe('test_session');
    });

    it('deve aceitar sessionId com números', async () => {
      const resp = await request(app)
        .post('/api/sessions/test123session/force-cleanup');

      expect(resp.statusCode).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.sessionId).toBe('test123session');
    });

    // Testes específicos para caracteres problemáticos usando URL encoding
    it('deve rejeitar sessionId com barra (URL encoded)', async () => {
      const resp = await request(app)
        .post('/api/sessions/test%2Fsession/force-cleanup');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
    });

    it('deve rejeitar sessionId com barra invertida (URL encoded)', async () => {
      const resp = await request(app)
        .post('/api/sessions/test%5Csession/force-cleanup');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
    });

    it('deve rejeitar sessionId com hashtag (URL encoded)', async () => {
      const resp = await request(app)
        .post('/api/sessions/test%23session/force-cleanup');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
    });

    it('deve rejeitar sessionId com porcentagem (URL encoded)', async () => {
      const resp = await request(app)
        .post('/api/sessions/test%25session/force-cleanup');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
    });

    it('deve rejeitar sessionId com interrogação (URL encoded)', async () => {
      const resp = await request(app)
        .post('/api/sessions/test%3Fsession/force-cleanup');

      expect(resp.statusCode).toBe(400);
      expect(resp.body.success).toBe(false);
      expect(resp.body.errors).toContain('sessionId deve conter apenas letras, números, hífens e underscores');
    });
  });
}); 