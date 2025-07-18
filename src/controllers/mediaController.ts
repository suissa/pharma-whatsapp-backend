import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { SessionManager } from '../services/SessionManager';
import logger from '../utils/Logger';

export function createMediaRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  // Middleware para servir arquivos de mídia
  router.get('/media/:fileName', async (req: Request, res: Response) => {
    try {
      const { fileName } = req.params;
      
      if (!fileName) {
        return res.status(400).json({
          success: false,
          message: 'Nome do arquivo é obrigatório'
        });
      }

      // Decodificar nome do arquivo
      const decodedFileName = decodeURIComponent(fileName);
      
      // Procurar o arquivo em todas as pastas de download
      const downloadsPath = './downloads';
      let filePath: string | null = null;
      
      // Lista de possíveis caminhos onde o arquivo pode estar
      const possiblePaths = [
        join(downloadsPath, decodedFileName),
        join(downloadsPath, '*', 'images', decodedFileName),
        join(downloadsPath, '*', 'videos', decodedFileName),
        join(downloadsPath, '*', 'audios', decodedFileName),
        join(downloadsPath, '*', 'documents', decodedFileName),
        join(downloadsPath, '*', 'stickers', decodedFileName)
      ];

      // Buscar arquivo recursivamente
      const findFile = (basePath: string, targetFile: string): string | null => {
        const fs = require('fs');
        const path = require('path');
        
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
          logger.error('Erro ao buscar arquivo:', error);
        }
        
        return null;
      };

      filePath = findFile(downloadsPath, decodedFileName);

      if (!filePath || !existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo não encontrado'
        });
      }

      // Determinar content-type baseado na extensão
      const extension = extname(filePath).toLowerCase();
      const contentTypeMap: { [key: string]: string } = {
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
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };

      const contentType = contentTypeMap[extension] || 'application/octet-stream';

      // Configurar headers apropriados
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 24 horas
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Enviar arquivo
      res.sendFile(filePath, { root: '/' }, (error) => {
        if (error) {
          logger.error('Erro ao enviar arquivo:', error);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Erro ao enviar arquivo'
            });
          }
        }
      });

    } catch (error) {
      logger.error('Erro no endpoint de mídia:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  });

  // Listar arquivos de mídia disponíveis
  router.get('/media', async (req: Request, res: Response) => {
    try {
      const { instanceId } = req.query;
      
      const fs = require('fs');
      const path = require('path');
      const downloadsPath = './downloads';
      
      let files: any[] = [];
      
      const scanDirectory = (dir: string, instance?: string) => {
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
                    mediaType: item.slice(0, -1), // Remove 's' do final (images -> image)
                    size: fileStat.size,
                    instance: instance || 'unknown',
                    url: `/api/media/${encodeURIComponent(file)}`,
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
          logger.error('Erro ao escanear diretório:', error);
        }
      };

      if (instanceId) {
        // Escanear apenas uma instância específica
        const instancePath = path.join(downloadsPath, instanceId as string);
        scanDirectory(instancePath, instanceId as string);
      } else {
        // Escanear todas as instâncias
        scanDirectory(downloadsPath);
      }

      res.json({
        success: true,
        files: files.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
        count: files.length
      });

    } catch (error) {
      logger.error('Erro ao listar arquivos de mídia:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  });

  // Obter estatísticas de downloads
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = sessionManager.getMediaDownloadStats();
      
      res.json({
        success: true,
        stats,
        autoDownloadEnabled: sessionManager.isAutoDownloadEnabled()
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas de mídia:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  });

  // Configurar download automático
  router.post('/auto-download', (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Parâmetro "enabled" deve ser um boolean'
        });
      }

      sessionManager.setAutoDownload(enabled);
      
      res.json({
        success: true,
        message: `Download automático ${enabled ? 'ativado' : 'desativado'}`,
        autoDownloadEnabled: enabled
      });
    } catch (error) {
      logger.error('Erro ao configurar download automático:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  });

  // Obter status do download automático
  router.get('/auto-download', (req: Request, res: Response) => {
    try {
      const enabled = sessionManager.isAutoDownloadEnabled();
      
      res.json({
        success: true,
        autoDownloadEnabled: enabled,
        message: `Download automático está ${enabled ? 'ativado' : 'desativado'}`
      });
    } catch (error) {
      logger.error('Erro ao obter status do download automático:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  });

  // Documentação das rotas de mídia
  router.get('/docs', (req: Request, res: Response) => {
    res.json({
      title: 'Media Download API Documentation',
      description: 'API para gerenciamento de downloads de mídia do WhatsApp',
      baseUrl: `${req.protocol}://${req.get('host')}/api/media`,
      endpoints: {
        'GET /stats': {
          description: 'Obter estatísticas de downloads de mídia',
          response: {
            success: true,
            stats: {
              totalDownloads: 0,
              downloadsByType: {},
              downloadsBySession: {}
            },
            autoDownloadEnabled: true
          }
        },
        'GET /auto-download': {
          description: 'Verificar status do download automático',
          response: {
            success: true,
            autoDownloadEnabled: true,
            message: 'Download automático está ativado'
          }
        },
        'POST /auto-download': {
          description: 'Configurar download automático',
          body: {
            enabled: true
          },
          response: {
            success: true,
            message: 'Download automático ativado',
            autoDownloadEnabled: true
          }
        }
      },
      mediaTypes: [
        'image', 
        'video', 
        'audio', 
        'document', 
        'sticker'
      ],
      downloadStructure: {
        'downloads/': {
          'images/': 'Imagens (JPG, PNG, GIF, WebP)',
          'videos/': 'Vídeos (MP4, AVI, MOV, WebM)',
          'audios/': 'Áudios (MP3, OGG, WAV, AAC)',
          'documents/': 'Documentos (PDF, DOC, XLS, TXT, ZIP)',
          'stickers/': 'Stickers (WebP, TGS)'
        }
      }
    });
  });

  return router;
} 