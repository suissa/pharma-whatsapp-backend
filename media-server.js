const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuração do Redis
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Conectar ao Redis
async function connectRedis() {
  try {
    await redisClient.connect();
    console.log('📡 Conectado ao Redis para logging de acesso');
  } catch (error) {
    console.error('🔴 Erro ao conectar no Redis:', error.message);
    console.log('⚠️  Servidor continuará sem logging Redis');
  }
}

// Função para logar acesso aos arquivos
async function logMediaAccess(data) {
  try {
    if (redisClient.isOpen) {
      await redisClient.xAdd('media_access_logs', '*', data);
    }
  } catch (error) {
    console.error('🔴 Erro ao logar acesso no Redis:', error.message);
  }
}

// Conectar ao Redis na inicialização
connectRedis();

// Middleware de logging
app.use((req, res, next) => {
  console.log(`📁 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// CORS para permitir acesso de qualquer origem
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  credentials: false,
  optionsSuccessStatus: 200
}));

// Função para determinar content-type baseado na extensão
function getContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const contentTypeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.zip': 'application/zip'
  };
  
  return contentTypeMap[extension] || 'application/octet-stream';
}

// Função para buscar arquivo recursivamente
function findFile(basePath, targetFile) {
  if (!fs.existsSync(basePath)) return null;
  
  try {
    const items = fs.readdirSync(basePath);
    
    for (const item of items) {
      const itemPath = path.join(basePath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Verificar se é uma das pastas de mídia
        const mediaFolders = ['images', 'videos', 'audios', 'documents', 'stickers'];
        if (mediaFolders.includes(item)) {
          const targetPath = path.join(itemPath, targetFile);
          if (fs.existsSync(targetPath)) {
            return targetPath;
          }
        } else {
          // Buscar recursivamente em subdiretórios (pastas de instância)
          const found = findFile(itemPath, targetFile);
          if (found) return found;
        }
      } else if (item === targetFile) {
        return itemPath;
      }
    }
  } catch (error) {
    console.error('🔴 Erro ao buscar arquivo:', error);
  }
  
  return null;
}

// Endpoint para servir arquivos de mídia
app.get('/media/:fileName', async (req, res) => {
  const startTime = Date.now();
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const { fileName } = req.params;
  
  // Dados básicos do log
  const logData = {
    timestamp: new Date().toISOString(),
    fileName: fileName || 'undefined',
    clientIP,
    userAgent,
    method: req.method,
    referer: req.headers.referer || 'direct'
  };

  try {
    if (!fileName) {
      logData.status = '400';
      logData.error = 'Nome do arquivo é obrigatório';
      logData.responseTime = Date.now() - startTime;
      await logMediaAccess(logData);
      
      return res.status(400).json({
        success: false,
        message: 'Nome do arquivo é obrigatório'
      });
    }

    // Decodificar nome do arquivo
    const decodedFileName = decodeURIComponent(fileName);
    logData.decodedFileName = decodedFileName;
    
    // Procurar o arquivo na pasta downloads
    const downloadsPath = './downloads';
    const filePath = findFile(downloadsPath, decodedFileName);

    if (!filePath || !fs.existsSync(filePath)) {
      logData.status = '404';
      logData.error = 'Arquivo não encontrado';
      logData.responseTime = Date.now() - startTime;
      await logMediaAccess(logData);
      
      console.log(`🔴 Arquivo não encontrado: ${decodedFileName} | IP: ${clientIP}`);
      return res.status(404).json({
        success: false,
        message: 'Arquivo não encontrado',
        fileName: decodedFileName
      });
    }

    // Obter informações do arquivo
    const stats = fs.statSync(filePath);
    const contentType = getContentType(filePath);

    // Adicionar dados do arquivo ao log
    logData.filePath = filePath;
    logData.fileSize = stats.size;
    logData.contentType = contentType;
    logData.lastModified = stats.mtime.toISOString();

    // Configurar headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 24 horas
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Last-Modified', stats.mtime.toUTCString());

    console.log(`✅ Servindo arquivo: ${decodedFileName} (${stats.size} bytes) | IP: ${clientIP}`);

    // Criar stream de leitura e pipe para response
    const readStream = fs.createReadStream(filePath);
    
    readStream.on('error', async (error) => {
      logData.status = '500';
      logData.error = `Erro ao ler arquivo: ${error.message}`;
      logData.responseTime = Date.now() - startTime;
      await logMediaAccess(logData);
      
      console.error('🔴 Erro ao ler arquivo:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Erro ao ler arquivo'
        });
      }
    });

    readStream.on('end', async () => {
      logData.status = '200';
      logData.success = true;
      logData.responseTime = Date.now() - startTime;
      await logMediaAccess(logData);
    });

    readStream.pipe(res);

  } catch (error) {
    logData.status = '500';
    logData.error = `Erro interno: ${error.message}`;
    logData.responseTime = Date.now() - startTime;
    await logMediaAccess(logData);
    
    console.error('🔴 Erro no endpoint de mídia:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// Endpoint para visualizar logs de acesso
app.get('/logs', async (req, res) => {
  try {
    const { limit = 50, filter } = req.query;
    
    if (!redisClient.isOpen) {
      return res.status(503).json({
        success: false,
        message: 'Redis não disponível'
      });
    }

    // Buscar logs do Redis Stream
    const logs = await redisClient.xRevRange('media_access_logs', '+', '-', {
      COUNT: parseInt(limit)
    });

    // Processar logs para formato mais legível
    const processedLogs = logs.map(log => {
      const data = {};
      // Converter array de Redis para objeto
      for (let i = 0; i < log.message.length; i += 2) {
        data[log.message[i]] = log.message[i + 1];
      }
      
      return {
        id: log.id,
        timestamp: data.timestamp,
        fileName: data.decodedFileName || data.fileName,
        clientIP: data.clientIP,
        status: data.status,
        fileSize: data.fileSize ? parseInt(data.fileSize) : null,
        responseTime: data.responseTime ? parseInt(data.responseTime) : null,
        userAgent: data.userAgent,
        error: data.error || null,
        success: data.success === 'true'
      };
    });

    // Filtrar se necessário
    let filteredLogs = processedLogs;
    if (filter) {
      filteredLogs = processedLogs.filter(log => 
        log.fileName.toLowerCase().includes(filter.toLowerCase()) ||
        log.clientIP.includes(filter) ||
        log.status.includes(filter)
      );
    }

    // Estatísticas
    const stats = {
      totalLogs: filteredLogs.length,
      successfulAccess: filteredLogs.filter(log => log.status === '200').length,
      notFoundErrors: filteredLogs.filter(log => log.status === '404').length,
      serverErrors: filteredLogs.filter(log => log.status === '500').length,
      uniqueIPs: [...new Set(filteredLogs.map(log => log.clientIP))].length,
      averageResponseTime: filteredLogs
        .filter(log => log.responseTime)
        .reduce((sum, log, _, arr) => sum + log.responseTime / arr.length, 0)
    };

    res.json({
      success: true,
      logs: filteredLogs,
      stats,
      streamInfo: {
        name: 'media_access_logs',
        limit: parseInt(limit),
        filter: filter || null
      }
    });

  } catch (error) {
    console.error('🔴 Erro ao buscar logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar logs',
      error: error.message
    });
  }
});

// Endpoint para estatísticas de acesso em tempo real
app.get('/analytics', async (req, res) => {
  try {
    if (!redisClient.isOpen) {
      return res.status(503).json({
        success: false,
        message: 'Redis não disponível'
      });
    }

    // Buscar últimos 1000 logs para estatísticas
    const logs = await redisClient.xRevRange('media_access_logs', '+', '-', {
      COUNT: 1000
    });

    const processedLogs = logs.map(log => {
      const data = {};
      for (let i = 0; i < log.message.length; i += 2) {
        data[log.message[i]] = log.message[i + 1];
      }
      return data;
    });

    // Calcular estatísticas
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentLogs = processedLogs.filter(log => 
      new Date(log.timestamp) > oneHourAgo
    );

    const dailyLogs = processedLogs.filter(log => 
      new Date(log.timestamp) > oneDayAgo
    );

    const topFiles = {};
    const topIPs = {};
    
    processedLogs.forEach(log => {
      const fileName = log.decodedFileName || log.fileName;
      const ip = log.clientIP;
      
      topFiles[fileName] = (topFiles[fileName] || 0) + 1;
      topIPs[ip] = (topIPs[ip] || 0) + 1;
    });

    res.json({
      success: true,
      analytics: {
        totalAccess: processedLogs.length,
        lastHour: recentLogs.length,
        last24Hours: dailyLogs.length,
        successRate: processedLogs.length > 0 ? 
          (processedLogs.filter(log => log.status === '200').length / processedLogs.length * 100).toFixed(2) + '%' : '0%',
        uniqueIPs: [...new Set(processedLogs.map(log => log.clientIP))].length,
        topFiles: Object.entries(topFiles)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([file, count]) => ({ file, count })),
        topIPs: Object.entries(topIPs)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([ip, count]) => ({ ip, count }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔴 Erro ao calcular estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas',
      error: error.message
    });
  }
});

// Endpoint para listar arquivos disponíveis
app.get('/media', (req, res) => {
  try {
    const { instanceId } = req.query;
    const downloadsPath = './downloads';
    let files = [];
    
    function scanDirectory(dir, instance) {
      if (!fs.existsSync(dir)) return;
      
      try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            const mediaFolders = ['images', 'videos', 'audios', 'documents', 'stickers'];
            if (mediaFolders.includes(item)) {
              // É uma pasta de mídia, listar arquivos
              const mediaFiles = fs.readdirSync(itemPath);
              for (const file of mediaFiles) {
                const filePath = path.join(itemPath, file);
                const fileStat = fs.statSync(filePath);
                files.push({
                  fileName: file,
                  mediaType: item.slice(0, -1), // Remove 's' do final
                  size: fileStat.size,
                  instance: instance || 'unknown',
                  url: `/media/${encodeURIComponent(file)}`,
                  lastModified: fileStat.mtime
                });
              }
            } else if (!instance) {
              // É uma pasta de instância, escanear recursivamente
              scanDirectory(itemPath, item);
            }
          }
        }
      } catch (error) {
        console.error('🔴 Erro ao escanear diretório:', error);
      }
    }

    if (instanceId) {
      const instancePath = path.join(downloadsPath, instanceId);
      scanDirectory(instancePath, instanceId);
    } else {
      scanDirectory(downloadsPath);
    }

    files.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    res.json({
      success: true,
      files,
      count: files.length,
      serverInfo: {
        name: 'WhatsApp Media Server',
        version: '1.0.0',
        port: PORT
      }
    });

  } catch (error) {
    console.error('🔴 Erro ao listar arquivos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar arquivos',
      error: error.message
    });
  }
});

// Endpoint de health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Servidor de mídia funcionando',
    timestamp: new Date().toISOString(),
    port: PORT,
    uptime: process.uptime()
  });
});

// Endpoint raiz com informações do servidor
app.get('/', (req, res) => {
  res.json({
    name: 'WhatsApp Media Server',
    version: '1.0.0',
    description: 'Servidor dedicado para servir arquivos de mídia do WhatsApp',
    port: PORT,
    endpoints: {
      'GET /media/:fileName': 'Servir arquivo específico',
      'GET /media': 'Listar todos os arquivos disponíveis',
      'GET /logs': 'Visualizar logs de acesso (query: limit, filter)',
      'GET /analytics': 'Estatísticas de acesso em tempo real',
      'GET /health': 'Health check do servidor'
    },
    mediaTypes: ['images', 'videos', 'audios', 'documents', 'stickers'],
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n🎥 ===== SERVIDOR DE MÍDIA WHATSAPP =====');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📁 Servindo arquivos de: ./downloads/`);
  console.log(`🌐 URL base: http://localhost:${PORT}`);
      console.log('📂 Endpoints disponíveis:');
    console.log(`   GET  http://localhost:${PORT}/media/:fileName - Servir arquivo`);
    console.log(`   GET  http://localhost:${PORT}/media - Listar arquivos`);
    console.log(`   GET  http://localhost:${PORT}/logs - Logs de acesso`);
    console.log(`   GET  http://localhost:${PORT}/analytics - Analytics em tempo real`);
    console.log(`   GET  http://localhost:${PORT}/health - Health check`);
    console.log('🔗 CORS habilitado para todas as origens');
    console.log('📊 Redis Streams para logging habilitado');
    console.log('⚡ Pronto para servir mídia!\n');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Servidor de mídia sendo finalizado...');
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('📡 Conexão Redis fechada');
    }
  } catch (error) {
    console.error('🔴 Erro ao fechar Redis:', error.message);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Servidor de mídia sendo finalizado...');
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('📡 Conexão Redis fechada');
    }
  } catch (error) {
    console.error('🔴 Erro ao fechar Redis:', error.message);
  }
  process.exit(0);
}); 