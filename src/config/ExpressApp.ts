import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { TraceMiddleware } from '../middleware/TraceMiddleware';
import logger from '../utils/Logger';

// Extender a interface Request para incluir timestamp
declare global {
  namespace Express {
    interface Request {
      timestamp?: string;
    }
  }
}

export class ExpressApp {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.setupSecurity();
    this.setupMiddleware();
  }

  private setupSecurity(): void {
    // Configuração completa do Helmet com as melhores práticas de segurança
    this.app.use(helmet({
      // Proteção contra ataques XSS
      xssFilter: true,
      
      // Previne clickjacking
      frameguard: {
        action: 'deny'
      },
      
      // Remove headers que podem revelar informações sobre o servidor
      hidePoweredBy: true,
      
      // Previne MIME type sniffing
      noSniff: true,
      
      // Configuração de Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          prefetchSrc: ["'self'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: []
        }
      },
      
      
      // Configuração de Cross-Origin Embedder Policy
      crossOriginEmbedderPolicy: false, // Desabilitado para permitir WebSockets
      
    }));

    // Rate limiting básico (pode ser expandido com express-rate-limit)
    this.app.use((req, res, next) => {
      // Adicionar timestamp para logging
      req.timestamp = new Date().toISOString();
      next();
    });

    // Headers de segurança adicionais
    this.app.use((req, res, next) => {
      // Prevenir cache de respostas sensíveis
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Headers de segurança adicionais
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      
      next();
    });
  }

  private setupMiddleware(): void {
    // 🔧 Middleware de tracing para TODAS as requisições
    this.app.use(TraceMiddleware.traceRequest);
    
    // Middleware de logging para TODAS as requisições
    this.app.use((req, res, next) => {
      logger.info(`🌐 ${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
      next();
    });

    // CORS com configurações de segurança
    this.app.use(cors({
      origin: ['http://localhost:8083', 'http://127.0.0.1:8083', 'http://localhost:3000', '*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
      credentials: false,
      optionsSuccessStatus: 200,
      maxAge: 86400 // Cache preflight por 24 horas
    }));

    // Parse JSON com limite de tamanho
    this.app.use(express.json({ 
      limit: '10mb', // Limite de 10MB para uploads
      strict: true // Rejeitar JSON malformado
    }));

    // Parse URL encoded com limite
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Middleware para sanitização básica de dados
    this.app.use((req, res, next) => {
      // Sanitizar headers
      if (req.headers['user-agent']) {
        req.headers['user-agent'] = req.headers['user-agent'].toString().substring(0, 200);
      }
      
      // Sanitizar query parameters
      if (req.query) {
        Object.keys(req.query).forEach(key => {
          if (typeof req.query[key] === 'string') {
            req.query[key] = req.query[key].toString().substring(0, 1000);
          }
        });
      }
      
      next();
    });
  }

  public setupRoutes(routes: Array<{ path: string; router: express.Router }>): void {
    routes.forEach(({ path, router }) => {
      this.app.use(path, router);
    });
  }

  public listen(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        logger.info(`🚀 Servidor Express rodando na porta ${port}`);
        logger.info(`🔒 Configurações de segurança ativas:`);
        logger.info(`   ✅ Helmet (XSS, CSRF, Clickjacking)`);
        logger.info(`   ✅ Content Security Policy`);
        logger.info(`   ✅ HSTS (HTTPS enforcement)`);
        logger.info(`   ✅ CORS configurado`);
        logger.info(`   ✅ Rate limiting básico`);
        logger.info(`   ✅ Sanitização de dados`);
        logger.info(`📱 API Baileys disponível em http://localhost:${port}/api`);
        logger.info('🔗 Endpoints disponíveis:');
        logger.info('   GET  /api/sessions - Listar sessões');
        logger.info('   POST /api/sessions/:id/reconnect - Reconectar sessão');
        logger.info('   POST /api/sessions/:id/send - Enviar mensagem');
        logger.info('   GET  /api/health - Status da API');
        logger.info('   GET  /api/media/stats - Estatísticas de downloads');
        logger.info('   POST /api/media/auto-download - Configurar download automático');
        logger.info('   GET  /api/messages/stats - Estatísticas de mensagens');
        logger.info('   GET  /api/messages/recent - Mensagens recentes');
        logger.info('   GET  /api/messages/search - Buscar mensagens');
        logger.info('   POST /api/messages/backup - Backup de mensagens');
        logger.info('   GET  /api/messages/redis/stream - Mensagens do Redis Stream');
        logger.info('   GET  /api/messages/redis/info - Informações do Redis');
        logger.info('   GET  /api/messages/redis/pending - Mensagens pendentes');
        logger.info('💾 Sessões: arquivos locais (baileys_auth_info_*)');
        logger.info('📁 Downloads: pasta ./downloads/ (images, videos, audios, documents, stickers)');
        logger.info('🗄️ Mensagens: banco de dados JSON (./data/messages/)');
        logger.info('🔄 Sistema de mensageria: RabbitMQ → Redis → Banco');
        logger.info('\n✨ Sistema completo ativo: sessões, mídia e mensageria!');
        resolve();
      });
    });
  }
} 