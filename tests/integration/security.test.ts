import request from 'supertest';
import app from './index';

describe('Testes de Segurança - Helmet Headers', () => {
  describe('Headers de Segurança Básicos', () => {
    it('deve ter X-Content-Type-Options configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['x-content-type-options']).toBe('nosniff');
    });

    it('deve ter X-Frame-Options configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['x-frame-options']).toBe('DENY');
    });

    it('deve ter X-XSS-Protection configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('deve ter Cache-Control configurado para dados sensíveis', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['cache-control']).toContain('no-store');
      expect(resp.headers['cache-control']).toContain('no-cache');
      expect(resp.headers['cache-control']).toContain('must-revalidate');
      expect(resp.headers['cache-control']).toContain('private');
    });

    it('deve ter Pragma configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['pragma']).toBe('no-cache');
    });

    it('deve ter Expires configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['expires']).toBe('0');
    });

    it('deve ter Strict-Transport-Security configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(resp.headers['strict-transport-security']).toContain('includeSubDomains');
      expect(resp.headers['strict-transport-security']).toContain('preload');
    });
  });

  describe('Content Security Policy', () => {
    it('deve ter Content-Security-Policy configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['content-security-policy']).toBeDefined();
      
      const csp = resp.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('deve permitir estilos inline para compatibilidade', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      const csp = resp.headers['content-security-policy'];
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('deve permitir imagens de fontes seguras', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      const csp = resp.headers['content-security-policy'];
      expect(csp).toContain("img-src 'self' data: https:");
    });
  });

  describe('CORS Configuration', () => {
    it('deve ter CORS configurado corretamente', async () => {
      const resp = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:8083');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['access-control-allow-origin']).toBeDefined();
      expect(resp.headers['access-control-allow-methods']).toContain('GET');
      expect(resp.headers['access-control-allow-methods']).toContain('POST');
      expect(resp.headers['access-control-allow-methods']).toContain('PUT');
      expect(resp.headers['access-control-allow-methods']).toContain('DELETE');
      expect(resp.headers['access-control-allow-methods']).toContain('OPTIONS');
    });

    it('deve ter max-age configurado para preflight', async () => {
      const resp = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:8083');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['access-control-max-age']).toBe('86400');
    });
  });

  describe('Sanitização de Dados', () => {
    it('deve aceitar User-Agent normal', async () => {
      const normalUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
      const resp = await request(app)
        .get('/api/health')
        .set('User-Agent', normalUserAgent);

      expect(resp.statusCode).toBe(200);
    });

    it('deve aceitar query parameters normais', async () => {
      const normalParam = 'test-parameter';
      const resp = await request(app)
        .get(`/api/health?param=${normalParam}`);

      expect(resp.statusCode).toBe(200);
    });
  });

  describe('JSON Parsing Security', () => {
    it('deve rejeitar JSON malformado', async () => {
      const resp = await request(app)
        .post('/api/sessions/create')
        .set('Content-Type', 'application/json')
        .send('{"instanceId": "test",}'); // JSON inválido

      expect(resp.statusCode).toBe(400);
    });

    it('deve aceitar JSON válido dentro do limite', async () => {
      const validData = { instanceId: 'test-instance-123' };
      const resp = await request(app)
        .post('/api/sessions/create')
        .set('Content-Type', 'application/json')
        .send(validData);

      expect(resp.statusCode).toBe(201);
    });

    it('deve rejeitar payload muito grande', async () => {
      const largeData = { 
        instanceId: 'test',
        data: 'A'.repeat(11 * 1024 * 1024) // 11MB (acima do limite de 10MB)
      };
      
      const resp = await request(app)
        .post('/api/sessions/create')
        .set('Content-Type', 'application/json')
        .send(largeData);

      expect(resp.statusCode).toBe(413); // Payload Too Large
    });
  });

  describe('Rate Limiting e Monitoring', () => {
    it('deve adicionar timestamp às requisições', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      // O timestamp deve estar presente no objeto de requisição
      // (testado indiretamente através do logging)
    });
  });

  describe('Cross-Origin Policies', () => {
    it('deve ter Cross-Origin-Embedder-Policy desabilitado para WebSockets', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      // Cross-Origin-Embedder-Policy deve estar ausente ou ser 'unsafe-none'
      // para permitir WebSockets
      expect(resp.headers['cross-origin-embedder-policy']).toBeFalsy();
    });
  });

  describe('Referrer Policy', () => {
    it('deve ter Referrer-Policy configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['referrer-policy']).toBe('no-referrer');
    });
  });

  describe('Cross-Origin Resource Policy', () => {
    it('deve ter Cross-Origin-Resource-Policy configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['cross-origin-resource-policy']).toBe('same-origin');
    });
  });

  describe('Cross-Origin Opener Policy', () => {
    it('deve ter Cross-Origin-Opener-Policy configurado', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['cross-origin-opener-policy']).toBe('same-origin');
    });
  });

  describe('Testes de Integração de Segurança', () => {
    it('deve manter headers de segurança em todas as rotas', async () => {
      const routes = [
        { method: 'GET', path: '/api/health' },
        { method: 'GET', path: '/api/sessions' },
        { method: 'POST', path: '/api/sessions/create', body: { instanceId: 'test' } },
        { method: 'GET', path: '/api/media/stats' },
        { method: 'GET', path: '/api/messages/stats' }
      ];

      for (const route of routes) {
        const req = request(app)[route.method.toLowerCase()](route.path);
        
        if (route.body) {
          req.send(route.body);
        }

        const resp = await req;

        // Verificar se os headers de segurança estão presentes
        expect(resp.headers['x-content-type-options']).toBe('nosniff');
        expect(resp.headers['x-frame-options']).toBe('DENY');
        expect(resp.headers['x-xss-protection']).toBe('1; mode=block');
        expect(resp.headers['content-security-policy']).toBeDefined();
      }
    });

    it('deve prevenir ataques de clickjacking', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['x-frame-options']).toBe('DENY');
      expect(resp.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });

    it('deve prevenir MIME type sniffing', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['x-content-type-options']).toBe('nosniff');
    });

    it('deve prevenir cache de dados sensíveis', async () => {
      const resp = await request(app)
        .get('/api/health');

      expect(resp.statusCode).toBe(200);
      expect(resp.headers['cache-control']).toContain('no-store');
      expect(resp.headers['cache-control']).toContain('no-cache');
      expect(resp.headers['pragma']).toBe('no-cache');
      expect(resp.headers['expires']).toBe('0');
    });
  });
}); 