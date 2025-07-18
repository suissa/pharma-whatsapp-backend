import QRCode from 'qrcode';
import { SessionManager } from './SessionManager';

interface QRCodeResponse {
  success: boolean;
  qrCode?: string;
  message?: string;
}

interface QRCodeImageResponse {
  success: boolean;
  qrCodeImage?: string;
  message?: string;
}

interface QRCodeSVGResponse {
  success: boolean;
  qrCodeSVG?: string;
  message?: string;
}

export class QRCodeManager {
  private static instance: QRCodeManager;
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  public static getInstance(sessionManager?: SessionManager): QRCodeManager {
    if (!QRCodeManager.instance && sessionManager) {
      QRCodeManager.instance = new QRCodeManager(sessionManager);
    }
    return QRCodeManager.instance;
  }

  async getQRCodeText(instanceId: string): Promise<QRCodeResponse> {
    try {
      const session = this.sessionManager.getSession(instanceId);
      if (!session) {
        return {
          success: false,
          message: `Sessão ${instanceId} não encontrada`
        };
      }

      const qrCode = this.sessionManager.getQrCode(instanceId);
      if (!qrCode) {
        return {
          success: false,
          message: `QR Code não disponível para a sessão ${instanceId}. Aguarde a geração do QR Code.`
        };
      }

      return {
        success: true,
        qrCode: qrCode
      };
    } catch (error) {
      return {
        success: false,
        message: `Erro ao gerar QR Code: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      };
    }
  }

  async getQRCodeImage(instanceId: string): Promise<QRCodeImageResponse> {
    try {
      const session = this.sessionManager.getSession(instanceId);
      if (!session) {
        return {
          success: false,
          message: `Sessão ${instanceId} não encontrada`
        };
      }

      const qrCode = this.sessionManager.getQrCode(instanceId);
      if (!qrCode) {
        return {
          success: false,
          message: `QR Code não disponível para a sessão ${instanceId}. Aguarde a geração do QR Code.`
        };
      }

      // ✅ CORRIGIDO: Removidos parâmetros não suportados
      const qrCodeImage = await QRCode.toDataURL(qrCode, {
        errorCorrectionLevel: 'M',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return {
        success: true,
        qrCodeImage: qrCodeImage
      };
    } catch (error) {
      return {
        success: false,
        message: `Erro ao gerar QR Code Image: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      };
    }
  }

  async getQRCodeSVG(instanceId: string): Promise<QRCodeSVGResponse> {
    try {
      const session = this.sessionManager.getSession(instanceId);
      if (!session) {
        return {
          success: false,
          message: `Sessão ${instanceId} não encontrada`
        };
      }

      const qrCode = this.sessionManager.getQrCode(instanceId);
      if (!qrCode) {
        return {
          success: false,
          message: `QR Code não disponível para a sessão ${instanceId}. Aguarde a geração do QR Code.`
        };
      }

      // ✅ CORRIGIDO: Sintaxe correta para SVG
      const qrCodeSVG = await QRCode.toString(qrCode, {
        errorCorrectionLevel: 'M',
        type: 'svg',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return {
        success: true,
        qrCodeSVG: qrCodeSVG
      };
    } catch (error) {
      return {
        success: false,
        message: `Erro ao gerar QR Code SVG: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      };
    }
  }

  clearQRCode(instanceId: string): void {
    this.sessionManager.clearQrCode(instanceId);
  }
} 