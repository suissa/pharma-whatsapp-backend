import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import logger from '../utils/Logger';

// Configurar o caminho do FFmpeg instalado via npm
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

export interface AudioConversionOptions {
  quality: number; // 0-9 (0 = melhor qualidade, 9 = menor tamanho)
  bitrate?: string; // ex: '128k', '192k', '320k'
  sampleRate?: number; // ex: 44100, 48000
}

export interface ConversionResult {
  success: boolean;
  originalPath: string;
  convertedPath: string;
  originalSize: number;
  convertedSize: number;
  originalFormat: string;
  conversionTime: number;
  error?: string;
}

export class AudioConverter {
  private defaultOptions: AudioConversionOptions = {
    quality: 2, // Boa qualidade
    bitrate: '192k',
    sampleRate: 44100
  };

  constructor(private baseDir: string = './downloads') {}

  /**
   * Converte um arquivo de áudio para MP3
   */
  async convertToMp3(
    inputPath: string, 
    outputPath?: string, 
    options?: Partial<AudioConversionOptions>
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    
    try {
      // Verificar se o arquivo de entrada existe
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Arquivo de entrada não encontrado: ${inputPath}`);
      }

      // Determinar caminho de saída se não especificado
      if (!outputPath) {
        const parsedPath = path.parse(inputPath);
        outputPath = path.join(parsedPath.dir, `${parsedPath.name}.mp3`);
      }

      // Configurações de conversão
      const conversionOptions = { ...this.defaultOptions, ...options };

      // Obter tamanho do arquivo original
      const originalStats = fs.statSync(inputPath);
      const originalSize = originalStats.size;

      // Detectar formato original
      const originalFormat = path.extname(inputPath).toLowerCase().substring(1);

      logger.info(`🎵 Iniciando conversão de áudio: ${originalFormat} → MP3`);
      logger.info(`📁 Arquivo: ${path.basename(inputPath)}`);
      logger.info(`📊 Configurações: ${conversionOptions.bitrate} | Quality: ${conversionOptions.quality}`);

      // Realizar conversão
      await this.performConversion(inputPath, outputPath, conversionOptions);

      // Verificar se o arquivo foi criado
      if (!fs.existsSync(outputPath)) {
        throw new Error('Arquivo MP3 não foi criado');
      }

      // Obter tamanho do arquivo convertido
      const convertedStats = fs.statSync(outputPath);
      const convertedSize = convertedStats.size;

      const conversionTime = Date.now() - startTime;

      logger.info(`✅ Conversão concluída em ${conversionTime}ms`);
      logger.info(`📊 Tamanho: ${originalSize} bytes → ${convertedSize} bytes`);
      logger.info(`💾 Salvo: ${outputPath}`);

      return {
        success: true,
        originalPath: inputPath,
        convertedPath: outputPath,
        originalSize,
        convertedSize,
        originalFormat,
        conversionTime
      };

    } catch (error) {
      const conversionTime = Date.now() - startTime;
      logger.error(`🔴 Erro na conversão de áudio:`, error);

      return {
        success: false,
        originalPath: inputPath,
        convertedPath: outputPath || '',
        originalSize: 0,
        convertedSize: 0,
        originalFormat: '',
        conversionTime,
        error: error.message
      };
    }
  }

  /**
   * Realizar a conversão usando fluent-ffmpeg
   */
  private performConversion(
    inputPath: string, 
    outputPath: string, 
    options: AudioConversionOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('mp3')
        .audioBitrate(options.bitrate || '192k')
        .audioFrequency(options.sampleRate || 44100)
        .audioQuality(options.quality || 2)
        .on('start', (commandLine) => {
          logger.info(`🔧 FFmpeg iniciado: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.info(`⏳ Progresso: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info(`🎯 FFmpeg finalizou conversão`);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`🔴 Erro FFmpeg:`, err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Verificar se um arquivo é de áudio suportado
   */
  isSupportedAudioFile(filePath: string): boolean {
    const supportedExtensions = ['.ogg', '.wav', '.aac', '.m4a', '.opus', '.webm', '.3gp'];
    const extension = path.extname(filePath).toLowerCase();
    return supportedExtensions.includes(extension);
  }

  /**
   * Verificar se já está em MP3
   */
  isAlreadyMp3(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.mp3';
  }

  /**
   * Remover arquivo original após conversão (opcional)
   */
  removeOriginalFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`🗑️ Arquivo original removido: ${filePath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`🔴 Erro ao remover arquivo original:`, error);
      return false;
    }
  }

  /**
   * Obter informações de um arquivo de áudio
   */
  async getAudioInfo(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }

  /**
   * Estatísticas de conversões
   */
  getConversionStats() {
    return {
      supportedFormats: ['.ogg', '.wav', '.aac', '.m4a', '.opus', '.webm', '.3gp'],
      defaultQuality: this.defaultOptions.quality,
      defaultBitrate: this.defaultOptions.bitrate,
      defaultSampleRate: this.defaultOptions.sampleRate
    };
  }
} 