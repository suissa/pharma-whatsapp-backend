import { WASocket, downloadMediaMessage, proto } from '@whiskeysockets/baileys';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { AudioConverter, ConversionResult } from './AudioConverter';
import { DocumentCategorizer, DocumentCategory, DocumentTypeInfo } from './DocumentCategorizer';
import logger from '../utils/Logger';

export interface MediaInfo {
  messageId: string;
  sessionId: string;
  fromUser: string;
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  fileName: string;
  filePath: string;
  timestamp: Date;
  originalName?: string;
  mimeType?: string;
  fileSize?: number;
  publicUrl?: string;
  downloaded?: boolean;
  // Informações específicas para áudio
  audioConversion?: {
    converted: boolean;
    originalFormat?: string;
    mp3Path?: string;
    mp3Size?: number;
    conversionTime?: number;
    conversionError?: string;
  };
  // Informações específicas para categorização de documentos
  documentCategory?: {
    category: DocumentCategory;
    subcategory: string;
    description: string;
    folder: string;
    isCode?: boolean;
    isExecutable?: boolean;
    isArchive?: boolean;
  };
}

export class MediaManager {
  private downloadsPath: string;
  private audioConverter: AudioConverter;

  constructor(baseDir: string = './downloads') {
    this.downloadsPath = baseDir;
    this.audioConverter = new AudioConverter(baseDir);
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    // Criar diretório base
    if (!existsSync(this.downloadsPath)) {
      mkdirSync(this.downloadsPath, { recursive: true });
    }

    logger.info(`📁 Diretório base de mídia criado em: ${this.downloadsPath}`);
  }

  private ensureInstanceDirectoriesExist(instancePhone: string): void {
    const mediaTypes = ['images', 'videos', 'audios', 'stickers'];
    const documentCategories = ['documents', 'codes', 'archives', 'applications', 'others'];
    
    // Criar diretório da instância
    const instancePath = join(this.downloadsPath, instancePhone);
    if (!existsSync(instancePath)) {
      mkdirSync(instancePath, { recursive: true });
      logger.info(`📁 Diretório criado para instância: ${instancePhone}`);
    }

    // Criar subdiretórios para cada tipo de mídia dentro da instância
    mediaTypes.forEach(type => {
      const typePath = join(instancePath, type);
      if (!existsSync(typePath)) {
        mkdirSync(typePath, { recursive: true });
      }
    });

    // Criar subdiretórios para categorias de documentos
    documentCategories.forEach(category => {
      const categoryPath = join(instancePath, category);
      if (!existsSync(categoryPath)) {
        mkdirSync(categoryPath, { recursive: true });
      }
    });

    logger.info(`📂 Estrutura de pastas criada para instância: ${instancePhone}`);
  }

  async processMessage(
    socket: WASocket, 
    sessionId: string,
    message: proto.IWebMessageInfo
  ): Promise<MediaInfo | null> {
    try {
      const messageContent = message.message;
      if (!messageContent) return null;

      const messageId = message.key.id || 'unknown';
      const fromUser = message.key.remoteJid || 'unknown';
      const timestamp = new Date((message.messageTimestamp as number) * 1000);

      // Obter número de telefone da instância (usuário do socket)
      const instancePhone = socket.user?.id?.split(":")[0].split("@")[0].replace(/[^0-9]/g, '') || sessionId;
      
      // Garantir que os diretórios existem para esta instância
      this.ensureInstanceDirectoriesExist(instancePhone);

      let mediaInfo: MediaInfo | null = null;

      // Verificar diferentes tipos de mídia
      if (messageContent.imageMessage) {
        mediaInfo = await this.downloadImage(socket, message, sessionId, messageId, fromUser, timestamp, instancePhone);
      } else if (messageContent.videoMessage) {
        mediaInfo = await this.downloadVideo(socket, message, sessionId, messageId, fromUser, timestamp, instancePhone);
      } else if (messageContent.audioMessage) {
        mediaInfo = await this.downloadAudio(socket, message, sessionId, messageId, fromUser, timestamp, instancePhone);
      } else if (messageContent.documentMessage) {
        mediaInfo = await this.downloadDocument(socket, message, sessionId, messageId, fromUser, timestamp, instancePhone);
      } else if (messageContent.stickerMessage) {
        mediaInfo = await this.downloadSticker(socket, message, sessionId, messageId, fromUser, timestamp, instancePhone);
      }

      if (mediaInfo) {
        logger.info(`✅ Mídia baixada: ${mediaInfo.mediaType} - ${mediaInfo.fileName}`);
        return mediaInfo;
      }

      return null;
    } catch (error) {
      logger.error(`🔴 Erro ao processar mídia:`, error);
      return null;
    }
  }

  private async downloadImage(
    socket: WASocket,
    message: proto.IWebMessageInfo,
    sessionId: string,
    messageId: string,
    fromUser: string,
    timestamp: Date,
    instancePhone: string
  ): Promise<MediaInfo | null> {
    try {
      const imageMessage = message.message?.imageMessage;
      if (!imageMessage) return null;

      // Validar se existe media key válida antes de tentar baixar
      if (!imageMessage.mediaKey || imageMessage.mediaKey.length === 0) {
        logger.warn(`⚠️ Imagem sem media key válida - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      // Validar se existe URL de download
      if (!imageMessage.url && !imageMessage.directPath) {
        logger.warn(`⚠️ Imagem sem URL de download - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      const buffer = await downloadMediaMessage(message, 'buffer', {}) as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer)) return null;

      const extension = this.getImageExtension(imageMessage.mimetype);
      const fileName = `${sessionId}_${messageId}_${timestamp.getTime()}${extension}`;
      const filePath = join(this.downloadsPath, instancePhone, 'images', fileName);

      writeFileSync(filePath, buffer);

      return {
        messageId,
        sessionId,
        fromUser,
        mediaType: 'image',
        fileName,
        filePath,
        timestamp,
        mimeType: imageMessage.mimetype,
        fileSize: buffer.length
      };
    } catch (error) {
      logger.error('🔴 Erro ao baixar imagem:', error);
      return null;
    }
  }

  private async downloadVideo(
    socket: WASocket,
    message: proto.IWebMessageInfo,
    sessionId: string,
    messageId: string,
    fromUser: string,
    timestamp: Date,
    instancePhone: string
  ): Promise<MediaInfo | null> {
    try {
      const videoMessage = message.message?.videoMessage;
      if (!videoMessage) return null;

      // Validar se existe media key válida antes de tentar baixar
      if (!videoMessage.mediaKey || videoMessage.mediaKey.length === 0) {
        logger.warn(`⚠️ Vídeo sem media key válida - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      // Validar se existe URL de download
      if (!videoMessage.url && !videoMessage.directPath) {
        logger.warn(`⚠️ Vídeo sem URL de download - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      const buffer = await downloadMediaMessage(message, 'buffer', {}) as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer)) return null;

      const extension = this.getVideoExtension(videoMessage.mimetype);
      const fileName = `${sessionId}_${messageId}_${timestamp.getTime()}${extension}`;
      const filePath = join(this.downloadsPath, instancePhone, 'videos', fileName);

      writeFileSync(filePath, buffer);

      return {
        messageId,
        sessionId,
        fromUser,
        mediaType: 'video',
        fileName,
        filePath,
        timestamp,
        mimeType: videoMessage.mimetype,
        fileSize: buffer.length
      };
    } catch (error) {
      logger.error('🔴 Erro ao baixar vídeo:', error);
      return null;
    }
  }

  private async downloadAudio(
    socket: WASocket,
    message: proto.IWebMessageInfo,
    sessionId: string,
    messageId: string,
    fromUser: string,
    timestamp: Date,
    instancePhone: string
  ): Promise<MediaInfo | null> {
    try {
      const audioMessage = message.message?.audioMessage;
      if (!audioMessage) return null;

      // Validar se existe media key válida antes de tentar baixar
      if (!audioMessage.mediaKey || audioMessage.mediaKey.length === 0) {
        logger.warn(`⚠️ Áudio sem media key válida - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      // Validar se existe URL de download
      if (!audioMessage.url && !audioMessage.directPath) {
        logger.warn(`⚠️ Áudio sem URL de download - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      logger.info(`🎵 Processando áudio: ${audioMessage.mimetype}`);

      const buffer = await downloadMediaMessage(message, 'buffer', {}) as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer)) return null;

      const extension = this.getAudioExtension(audioMessage.mimetype);
      const originalFileName = `${sessionId}_${messageId}_${timestamp.getTime()}${extension}`;
      const originalFilePath = join(this.downloadsPath, instancePhone, 'audios', originalFileName);

      // Salvar arquivo original
      writeFileSync(originalFilePath, buffer);
      logger.info(`💾 Áudio original salvo: ${originalFileName}`);

      // Preparar informações básicas do áudio
      const mediaInfo: MediaInfo = {
        messageId,
        sessionId,
        fromUser,
        mediaType: 'audio',
        fileName: originalFileName,
        filePath: originalFilePath,
        timestamp,
        mimeType: audioMessage.mimetype,
        fileSize: buffer.length,
        audioConversion: {
          converted: false
        }
      };

      // Verificar se precisa converter para MP3
      const originalFormat = extension.substring(1); // Remove o ponto
      
      if (this.audioConverter.isAlreadyMp3(originalFilePath)) {
        logger.info(`✅ Áudio já está em MP3: ${originalFileName}`);
        mediaInfo.audioConversion = {
          converted: false, // Não foi convertido pois já era MP3
          originalFormat: 'mp3'
        };
        return mediaInfo;
      }

      if (!this.audioConverter.isSupportedAudioFile(originalFilePath)) {
        logger.warn(`⚠️ Formato de áudio não suportado para conversão: ${originalFormat}`);
        mediaInfo.audioConversion = {
          converted: false,
          originalFormat,
          conversionError: `Formato ${originalFormat} não suportado para conversão`
        };
        return mediaInfo;
      }

      // Realizar conversão para MP3
      logger.info(`🔄 Iniciando conversão: ${originalFormat} → MP3`);
      const mp3FileName = `${sessionId}_${messageId}_${timestamp.getTime()}.mp3`;
      const mp3FilePath = join(this.downloadsPath, instancePhone, 'audios', mp3FileName);

      const conversionResult: ConversionResult = await this.audioConverter.convertToMp3(
        originalFilePath,
        mp3FilePath,
        {
          quality: 2, // Boa qualidade
          bitrate: '192k'
        }
      );

      if (conversionResult.success) {
        logger.info(`✅ Conversão MP3 concluída: ${mp3FileName}`);
        
        // Atualizar informações para apontar para o MP3
        mediaInfo.fileName = mp3FileName;
        mediaInfo.filePath = mp3FilePath;
        mediaInfo.fileSize = conversionResult.convertedSize;
        mediaInfo.mimeType = 'audio/mpeg';
        
        mediaInfo.audioConversion = {
          converted: true,
          originalFormat,
          mp3Path: mp3FilePath,
          mp3Size: conversionResult.convertedSize,
          conversionTime: conversionResult.conversionTime
        };

        // Opcionalmente, remover arquivo original para economizar espaço
        // this.audioConverter.removeOriginalFile(originalFilePath);
        
      } else {
        logger.error(`🔴 Erro na conversão MP3: ${conversionResult.error}`);
        mediaInfo.audioConversion = {
          converted: false,
          originalFormat,
          conversionError: conversionResult.error
        };
      }

      return mediaInfo;

    } catch (error) {
      logger.error('🔴 Erro ao baixar/processar áudio:', error);
      return null;
    }
  }

  private async downloadDocument(
    socket: WASocket,
    message: proto.IWebMessageInfo,
    sessionId: string,
    messageId: string,
    fromUser: string,
    timestamp: Date,
    instancePhone: string
  ): Promise<MediaInfo | null> {
    try {
      const documentMessage = message.message?.documentMessage;
      if (!documentMessage) return null;

      // Validar se existe media key válida antes de tentar baixar
      if (!documentMessage.mediaKey || documentMessage.mediaKey.length === 0) {
        logger.warn(`⚠️ Documento sem media key válida - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      // Validar se existe URL de download
      if (!documentMessage.url && !documentMessage.directPath) {
        logger.warn(`⚠️ Documento sem URL de download - ID: ${messageId}, From: ${fromUser}`);
        return null;
      }

      logger.info(`📄 Processando documento: ${documentMessage.fileName || 'sem nome'}`);

      const buffer = await downloadMediaMessage(message, 'buffer', {}) as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer)) return null;

      const originalName = documentMessage.fileName || 'documento_sem_nome';
      
      // Categorizar o arquivo usando o DocumentCategorizer
      const categoryInfo: DocumentTypeInfo = DocumentCategorizer.categorizeFile(originalName, documentMessage.mimetype);
      
      logger.info(`🏷️ Arquivo categorizado como: ${categoryInfo.description} (${categoryInfo.subcategory})`);
      logger.info(`📂 Será salvo na pasta: ${categoryInfo.folder}`);

      // Determinar o tipo de mídia baseado na categoria
      let finalMediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker' = 'document';
      
      // Se for imagem, vídeo ou áudio, usar o tipo específico
      if (categoryInfo.category === DocumentCategory.IMAGE) {
        finalMediaType = 'image';
      } else if (categoryInfo.category === DocumentCategory.VIDEO) {
        finalMediaType = 'video';  
      } else if (categoryInfo.category === DocumentCategory.AUDIO) {
        finalMediaType = 'audio';
      }

      // Criar nome do arquivo com timestamp único
      const fileName = `${sessionId}_${messageId}_${timestamp.getTime()}_${originalName}`;
      const filePath = join(this.downloadsPath, instancePhone, categoryInfo.folder, fileName);

      // Salvar arquivo
      writeFileSync(filePath, buffer);

      // Preparar informações de categorização para o MediaInfo
      const documentCategory = {
        category: categoryInfo.category,
        subcategory: categoryInfo.subcategory,
        description: categoryInfo.description,
        folder: categoryInfo.folder,
        isCode: DocumentCategorizer.isCodeFile(originalName),
        isExecutable: DocumentCategorizer.isExecutableFile(originalName),
        isArchive: DocumentCategorizer.isArchiveFile(originalName)
      };

      logger.info(`✅ Documento salvo: ${fileName}`);
      logger.info(`📁 Pasta: ${categoryInfo.folder}`);
      if (documentCategory.isCode) logger.info(`💻 Detectado como código fonte`);
      if (documentCategory.isExecutable) logger.info(`⚡ Detectado como executável`);
      if (documentCategory.isArchive) logger.info(`📦 Detectado como arquivo compactado`);

      return {
        messageId,
        sessionId,
        fromUser,
        mediaType: finalMediaType,
        fileName,
        filePath,
        timestamp,
        originalName,
        mimeType: documentMessage.mimetype,
        fileSize: buffer.length,
        documentCategory
      };
    } catch (error) {
      logger.error('🔴 Erro ao baixar/categorizar documento:', error);
      return null;
    }
  }

  private async downloadSticker(
    socket: WASocket,
    message: proto.IWebMessageInfo,
    sessionId: string,
    messageId: string,
    fromUser: string,
    timestamp: Date,
    instancePhone: string
  ): Promise<MediaInfo | null> {
    try {
      const stickerMessage = message.message?.stickerMessage;
      if (!stickerMessage) return null;

      const buffer = await downloadMediaMessage(message, 'buffer', {}) as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer)) return null;

      const extension = this.getStickerExtension(stickerMessage.mimetype);
      const fileName = `${sessionId}_${messageId}_${timestamp.getTime()}${extension}`;
      const filePath = join(this.downloadsPath, instancePhone, 'stickers', fileName);

      writeFileSync(filePath, buffer);

      return {
        messageId,
        sessionId,
        fromUser,
        mediaType: 'sticker',
        fileName,
        filePath,
        timestamp,
        mimeType: stickerMessage.mimetype,
        fileSize: buffer.length
      };
    } catch (error) {
      logger.error('🔴 Erro ao baixar sticker:', error);
      return null;
    }
  }

  private getImageExtension(mimetype?: string): string {
    switch (mimetype) {
      case 'image/jpeg': return '.jpg';
      case 'image/png': return '.png';
      case 'image/gif': return '.gif';
      case 'image/webp': return '.webp';
      default: return '.jpg';
    }
  }

  private getVideoExtension(mimetype?: string): string {
    switch (mimetype) {
      case 'video/mp4': return '.mp4';
      case 'video/avi': return '.avi';
      case 'video/mov': return '.mov';
      case 'video/webm': return '.webm';
      default: return '.mp4';
    }
  }

  private getAudioExtension(mimetype?: string): string {
    switch (mimetype) {
      case 'audio/mpeg': return '.mp3';
      case 'audio/ogg': return '.ogg';
      case 'audio/wav': return '.wav';
      case 'audio/aac': return '.aac';
      case 'audio/mp4': return '.m4a';
      default: return '.ogg';
    }
  }

  private getDocumentExtension(mimetype?: string): string {
    switch (mimetype) {
      case 'application/pdf': return '.pdf';
      case 'application/msword': return '.doc';
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return '.docx';
      case 'application/vnd.ms-excel': return '.xls';
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return '.xlsx';
      case 'text/plain': return '.txt';
      case 'application/zip': return '.zip';
      case 'application/x-rar-compressed': return '.rar';
      default: return '';
    }
  }

  private getStickerExtension(mimetype?: string): string {
    switch (mimetype) {
      case 'image/webp': return '.webp';
      case 'application/x-tgs': return '.tgs';
      default: return '.webp';
    }
  }

  // Obter estatísticas de categorização de documentos
  getDocumentCategoryStats(): Record<string, number> {
    return DocumentCategorizer.getStats();
  }

  // Obter informações sobre as categorias suportadas
  getSupportedDocumentCategories(): DocumentCategory[] {
    return DocumentCategorizer.getSupportedCategories();
  }

  // Métodos utilitários para estatísticas
  getDownloadStats(): any {
    // Podemos implementar estatísticas de download aqui
    return {
      totalDownloads: 0,
      downloadsByType: {},
      downloadsBySession: {}
    };
  }
} 