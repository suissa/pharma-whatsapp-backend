import { extname } from 'path';

export enum DocumentCategory {
  DOCUMENT = 'documents',
  VIDEO = 'videos', 
  CODE = 'codes',
  ARCHIVE = 'archives',
  APPLICATION = 'applications',
  IMAGE = 'images',
  AUDIO = 'audios',
  OTHER = 'others'
}

export interface DocumentTypeInfo {
  category: DocumentCategory;
  subcategory: string;
  description: string;
  folder: string;
}

export class DocumentCategorizer {
  private static readonly extensionMap: Map<string, DocumentTypeInfo> = new Map([
    // DOCUMENTOS DE TEXTO E ESCRITÓRIO
    ['.pdf', { category: DocumentCategory.DOCUMENT, subcategory: 'PDF', description: 'Documento PDF', folder: 'documents' }],
    ['.doc', { category: DocumentCategory.DOCUMENT, subcategory: 'Word', description: 'Documento Word', folder: 'documents' }],
    ['.docx', { category: DocumentCategory.DOCUMENT, subcategory: 'Word', description: 'Documento Word', folder: 'documents' }],
    ['.xls', { category: DocumentCategory.DOCUMENT, subcategory: 'Excel', description: 'Planilha Excel', folder: 'documents' }],
    ['.xlsx', { category: DocumentCategory.DOCUMENT, subcategory: 'Excel', description: 'Planilha Excel', folder: 'documents' }],
    ['.ppt', { category: DocumentCategory.DOCUMENT, subcategory: 'PowerPoint', description: 'Apresentação PowerPoint', folder: 'documents' }],
    ['.pptx', { category: DocumentCategory.DOCUMENT, subcategory: 'PowerPoint', description: 'Apresentação PowerPoint', folder: 'documents' }],
    ['.txt', { category: DocumentCategory.DOCUMENT, subcategory: 'Texto', description: 'Arquivo de Texto', folder: 'documents' }],
    ['.rtf', { category: DocumentCategory.DOCUMENT, subcategory: 'Rich Text', description: 'Rich Text Format', folder: 'documents' }],
    ['.odt', { category: DocumentCategory.DOCUMENT, subcategory: 'OpenOffice', description: 'Documento OpenOffice', folder: 'documents' }],
    ['.ods', { category: DocumentCategory.DOCUMENT, subcategory: 'OpenOffice', description: 'Planilha OpenOffice', folder: 'documents' }],
    ['.odp', { category: DocumentCategory.DOCUMENT, subcategory: 'OpenOffice', description: 'Apresentação OpenOffice', folder: 'documents' }],

    // VÍDEOS
    ['.mp4', { category: DocumentCategory.VIDEO, subcategory: 'MP4', description: 'Vídeo MP4', folder: 'videos' }],
    ['.avi', { category: DocumentCategory.VIDEO, subcategory: 'AVI', description: 'Vídeo AVI', folder: 'videos' }],
    ['.mov', { category: DocumentCategory.VIDEO, subcategory: 'QuickTime', description: 'Vídeo QuickTime', folder: 'videos' }],
    ['.wmv', { category: DocumentCategory.VIDEO, subcategory: 'Windows Media', description: 'Windows Media Video', folder: 'videos' }],
    ['.flv', { category: DocumentCategory.VIDEO, subcategory: 'Flash', description: 'Flash Video', folder: 'videos' }],
    ['.webm', { category: DocumentCategory.VIDEO, subcategory: 'WebM', description: 'Vídeo WebM', folder: 'videos' }],
    ['.mkv', { category: DocumentCategory.VIDEO, subcategory: 'Matroska', description: 'Vídeo Matroska', folder: 'videos' }],
    ['.m4v', { category: DocumentCategory.VIDEO, subcategory: 'iTunes', description: 'Vídeo iTunes', folder: 'videos' }],
    ['.3gp', { category: DocumentCategory.VIDEO, subcategory: '3GPP', description: 'Vídeo 3GPP', folder: 'videos' }],
    ['.ogv', { category: DocumentCategory.VIDEO, subcategory: 'Ogg', description: 'Vídeo Ogg', folder: 'videos' }],

    // CÓDIGOS E SCRIPTS
    ['.js', { category: DocumentCategory.CODE, subcategory: 'JavaScript', description: 'Código JavaScript', folder: 'codes' }],
    ['.ts', { category: DocumentCategory.CODE, subcategory: 'TypeScript', description: 'Código TypeScript', folder: 'codes' }],
    ['.py', { category: DocumentCategory.CODE, subcategory: 'Python', description: 'Código Python', folder: 'codes' }],
    ['.php', { category: DocumentCategory.CODE, subcategory: 'PHP', description: 'Código PHP', folder: 'codes' }],
    ['.html', { category: DocumentCategory.CODE, subcategory: 'HTML', description: 'Página HTML', folder: 'codes' }],
    ['.htm', { category: DocumentCategory.CODE, subcategory: 'HTML', description: 'Página HTML', folder: 'codes' }],
    ['.css', { category: DocumentCategory.CODE, subcategory: 'CSS', description: 'Folha de Estilo CSS', folder: 'codes' }],
    ['.java', { category: DocumentCategory.CODE, subcategory: 'Java', description: 'Código Java', folder: 'codes' }],
    ['.cpp', { category: DocumentCategory.CODE, subcategory: 'C++', description: 'Código C++', folder: 'codes' }],
    ['.c', { category: DocumentCategory.CODE, subcategory: 'C', description: 'Código C', folder: 'codes' }],
    ['.cs', { category: DocumentCategory.CODE, subcategory: 'C#', description: 'Código C#', folder: 'codes' }],
    ['.rb', { category: DocumentCategory.CODE, subcategory: 'Ruby', description: 'Código Ruby', folder: 'codes' }],
    ['.go', { category: DocumentCategory.CODE, subcategory: 'Go', description: 'Código Go', folder: 'codes' }],
    ['.rs', { category: DocumentCategory.CODE, subcategory: 'Rust', description: 'Código Rust', folder: 'codes' }],
    ['.sql', { category: DocumentCategory.CODE, subcategory: 'SQL', description: 'Script SQL', folder: 'codes' }],
    ['.json', { category: DocumentCategory.CODE, subcategory: 'JSON', description: 'Arquivo JSON', folder: 'codes' }],
    ['.xml', { category: DocumentCategory.CODE, subcategory: 'XML', description: 'Arquivo XML', folder: 'codes' }],
    ['.yaml', { category: DocumentCategory.CODE, subcategory: 'YAML', description: 'Arquivo YAML', folder: 'codes' }],
    ['.yml', { category: DocumentCategory.CODE, subcategory: 'YAML', description: 'Arquivo YAML', folder: 'codes' }],

    // ARQUIVOS COMPACTADOS
    ['.zip', { category: DocumentCategory.ARCHIVE, subcategory: 'ZIP', description: 'Arquivo ZIP', folder: 'archives' }],
    ['.rar', { category: DocumentCategory.ARCHIVE, subcategory: 'RAR', description: 'Arquivo RAR', folder: 'archives' }],
    ['.7z', { category: DocumentCategory.ARCHIVE, subcategory: '7-Zip', description: 'Arquivo 7-Zip', folder: 'archives' }],
    ['.tar', { category: DocumentCategory.ARCHIVE, subcategory: 'TAR', description: 'Arquivo TAR', folder: 'archives' }],
    ['.gz', { category: DocumentCategory.ARCHIVE, subcategory: 'GZIP', description: 'Arquivo GZIP', folder: 'archives' }],
    ['.bz2', { category: DocumentCategory.ARCHIVE, subcategory: 'BZIP2', description: 'Arquivo BZIP2', folder: 'archives' }],
    ['.xz', { category: DocumentCategory.ARCHIVE, subcategory: 'XZ', description: 'Arquivo XZ', folder: 'archives' }],

    // APLICATIVOS E PROGRAMAS
    ['.exe', { category: DocumentCategory.APPLICATION, subcategory: 'Windows', description: 'Executável Windows', folder: 'applications' }],
    ['.msi', { category: DocumentCategory.APPLICATION, subcategory: 'Windows Installer', description: 'Instalador Windows', folder: 'applications' }],
    ['.app', { category: DocumentCategory.APPLICATION, subcategory: 'macOS', description: 'Aplicativo macOS', folder: 'applications' }],
    ['.dmg', { category: DocumentCategory.APPLICATION, subcategory: 'macOS', description: 'Imagem de Disco macOS', folder: 'applications' }],
    ['.pkg', { category: DocumentCategory.APPLICATION, subcategory: 'macOS', description: 'Pacote macOS', folder: 'applications' }],
    ['.deb', { category: DocumentCategory.APPLICATION, subcategory: 'Linux', description: 'Pacote Debian', folder: 'applications' }],
    ['.rpm', { category: DocumentCategory.APPLICATION, subcategory: 'Linux', description: 'Pacote RPM', folder: 'applications' }],
    ['.appimage', { category: DocumentCategory.APPLICATION, subcategory: 'Linux', description: 'AppImage Linux', folder: 'applications' }],
    ['.apk', { category: DocumentCategory.APPLICATION, subcategory: 'Android', description: 'Aplicativo Android', folder: 'applications' }],
    ['.ipa', { category: DocumentCategory.APPLICATION, subcategory: 'iOS', description: 'Aplicativo iOS', folder: 'applications' }],

    // IMAGENS (mesmo que já tratadas separadamente, podem vir como documento)
    ['.jpg', { category: DocumentCategory.IMAGE, subcategory: 'JPEG', description: 'Imagem JPEG', folder: 'images' }],
    ['.jpeg', { category: DocumentCategory.IMAGE, subcategory: 'JPEG', description: 'Imagem JPEG', folder: 'images' }],
    ['.png', { category: DocumentCategory.IMAGE, subcategory: 'PNG', description: 'Imagem PNG', folder: 'images' }],
    ['.gif', { category: DocumentCategory.IMAGE, subcategory: 'GIF', description: 'Imagem GIF', folder: 'images' }],
    ['.bmp', { category: DocumentCategory.IMAGE, subcategory: 'Bitmap', description: 'Imagem Bitmap', folder: 'images' }],
    ['.webp', { category: DocumentCategory.IMAGE, subcategory: 'WebP', description: 'Imagem WebP', folder: 'images' }],
    ['.svg', { category: DocumentCategory.IMAGE, subcategory: 'SVG', description: 'Imagem Vetorial SVG', folder: 'images' }],
    ['.ico', { category: DocumentCategory.IMAGE, subcategory: 'Ícone', description: 'Ícone ICO', folder: 'images' }],
    ['.tiff', { category: DocumentCategory.IMAGE, subcategory: 'TIFF', description: 'Imagem TIFF', folder: 'images' }],

    // ÁUDIOS (mesmo que já tratados separadamente, podem vir como documento)
    ['.mp3', { category: DocumentCategory.AUDIO, subcategory: 'MP3', description: 'Áudio MP3', folder: 'audios' }],
    ['.wav', { category: DocumentCategory.AUDIO, subcategory: 'WAV', description: 'Áudio WAV', folder: 'audios' }],
    ['.ogg', { category: DocumentCategory.AUDIO, subcategory: 'OGG', description: 'Áudio OGG', folder: 'audios' }],
    ['.aac', { category: DocumentCategory.AUDIO, subcategory: 'AAC', description: 'Áudio AAC', folder: 'audios' }],
    ['.flac', { category: DocumentCategory.AUDIO, subcategory: 'FLAC', description: 'Áudio FLAC', folder: 'audios' }],
    ['.wma', { category: DocumentCategory.AUDIO, subcategory: 'WMA', description: 'Windows Media Audio', folder: 'audios' }],
    ['.m4a', { category: DocumentCategory.AUDIO, subcategory: 'M4A', description: 'Áudio M4A', folder: 'audios' }],
    ['.opus', { category: DocumentCategory.AUDIO, subcategory: 'Opus', description: 'Áudio Opus', folder: 'audios' }]
  ]);

  /**
   * Categoriza um arquivo baseado na sua extensão
   */
  static categorizeFile(fileName: string, mimeType?: string): DocumentTypeInfo {
    const extension = extname(fileName).toLowerCase();
    
    // Tentar encontrar pela extensão primeiro
    const typeInfo = this.extensionMap.get(extension);
    if (typeInfo) {
      return typeInfo;
    }

    // Se não encontrou pela extensão, tentar pelo MIME type
    if (mimeType) {
      const categoryByMime = this.getCategoryByMimeType(mimeType);
      if (categoryByMime) {
        return {
          category: categoryByMime,
          subcategory: 'Desconhecido',
          description: `Arquivo ${mimeType}`,
          folder: categoryByMime
        };
      }
    }

    // Fallback para outros
    return {
      category: DocumentCategory.OTHER,
      subcategory: 'Desconhecido',
      description: `Arquivo ${extension || 'sem extensão'}`,
      folder: 'others'
    };
  }

  /**
   * Obter categoria baseada no MIME type
   */
  private static getCategoryByMimeType(mimeType: string): DocumentCategory | null {
    if (mimeType.startsWith('image/')) {
      return DocumentCategory.IMAGE;
    }
    if (mimeType.startsWith('video/')) {
      return DocumentCategory.VIDEO;
    }
    if (mimeType.startsWith('audio/')) {
      return DocumentCategory.AUDIO;
    }
    if (mimeType.includes('application/zip') || mimeType.includes('application/x-rar')) {
      return DocumentCategory.ARCHIVE;
    }
    if (mimeType.includes('application/pdf') || mimeType.includes('application/msword') || mimeType.includes('text/')) {
      return DocumentCategory.DOCUMENT;
    }
    if (mimeType.includes('application/octet-stream')) {
      return DocumentCategory.APPLICATION;
    }
    
    return null;
  }

  /**
   * Obter todas as categorias suportadas
   */
  static getSupportedCategories(): DocumentCategory[] {
    return Object.values(DocumentCategory);
  }

  /**
   * Obter todas as extensões suportadas por categoria
   */
  static getExtensionsByCategory(category: DocumentCategory): string[] {
    const extensions: string[] = [];
    
    for (const [extension, typeInfo] of this.extensionMap) {
      if (typeInfo.category === category) {
        extensions.push(extension);
      }
    }
    
    return extensions;
  }

  /**
   * Obter estatísticas de tipos suportados
   */
  static getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const category of this.getSupportedCategories()) {
      stats[category] = this.getExtensionsByCategory(category).length;
    }
    
    return stats;
  }

  /**
   * Verificar se um arquivo é código fonte
   */
  static isCodeFile(fileName: string): boolean {
    const typeInfo = this.categorizeFile(fileName);
    return typeInfo.category === DocumentCategory.CODE;
  }

  /**
   * Verificar se um arquivo é executável/aplicativo
   */
  static isExecutableFile(fileName: string): boolean {
    const typeInfo = this.categorizeFile(fileName);
    return typeInfo.category === DocumentCategory.APPLICATION;
  }

  /**
   * Verificar se um arquivo é compactado
   */
  static isArchiveFile(fileName: string): boolean {
    const typeInfo = this.categorizeFile(fileName);
    return typeInfo.category === DocumentCategory.ARCHIVE;
  }

  /**
   * Obter descrição amigável de um arquivo
   */
  static getFileDescription(fileName: string, mimeType?: string): string {
    const typeInfo = this.categorizeFile(fileName, mimeType);
    return `${typeInfo.description} (${typeInfo.subcategory})`;
  }
} 