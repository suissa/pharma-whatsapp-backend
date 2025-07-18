import { readFileSync } from 'fs';
import { join } from 'path';
import logger from '../utils/Logger';

export interface EmpresaInfo {
  numero: string;
  nome: string;
  descricao: string;
  ativa: boolean;
}

export interface Configuracao {
  versao: string;
  atualizado_em: string;
  dlq_habilitada: boolean;
  retry_maximo: number;
}

export interface EmpresaConfig {
  empresas: Record<string, EmpresaInfo>;
  filas: Record<string, string>;
  configuracao: Configuracao;
}

export class EmpresaConfigManager {
  private static instance: EmpresaConfigManager;
  private config: EmpresaConfig;
  private configPath: string;

  private constructor() {
    this.configPath = join(process.cwd(), 'config', 'empresas.json');
    this.loadConfig();
  }

  public static getInstance(): EmpresaConfigManager {
    if (!EmpresaConfigManager.instance) {
      EmpresaConfigManager.instance = new EmpresaConfigManager();
    }
    return EmpresaConfigManager.instance;
  }

  private loadConfig(): void {
    try {
      const configContent = readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configContent) as EmpresaConfig;
      logger.info('✅ Configuração de empresas carregada');
    } catch (error) {
      logger.error('🔴 Erro ao carregar configuração de empresas:', error);
      // Configuração padrão como fallback
      this.config = {
        empresas: {},
        filas: {},
        configuracao: {
          versao: '1.0.0',
          atualizado_em: new Date().toISOString().split('T')[0],
          dlq_habilitada: true,
          retry_maximo: 3
        }
      };
    }
  }

  /**
   * Extrai o ID da empresa do nome da fila
   * Ex: "whatsapp.send.empresa01" → "empresa01"
   */
  public extrairEmpresaFromFila(queueName: string): string | null {
    // Padrão: whatsapp.send.empresaXX
    const match = queueName.match(/whatsapp\.send\.(.+)/);
    return match ? match[1] : null;
  }

  /**
   * Obtém o número de telefone baseado no ID da empresa
   */
  public getNumeroEmpresa(empresaId: string): string | null {
    const empresa = this.config.empresas[empresaId];
    return empresa?.ativa ? empresa.numero : null;
  }

  /**
   * Obtém o nome da fila baseado no ID da empresa
   */
  public getFilaEmpresa(empresaId: string): string | null {
    return this.config.filas[empresaId] || null;
  }

  /**
   * Verifica se uma empresa está ativa
   */
  public isEmpresaAtiva(empresaId: string): boolean {
    return this.config.empresas[empresaId]?.ativa || false;
  }

  /**
   * Lista todas as empresas ativas
   */
  public getEmpresasAtivas(): Array<{ id: string; info: EmpresaInfo }> {
    return Object.entries(this.config.empresas)
      .filter(([_, info]) => info.ativa)
      .map(([id, info]) => ({ id, info }));
  }

  /**
   * Obtém todas as filas de empresas
   */
  public getAllFilasEmpresas(): string[] {
    return Object.values(this.config.filas);
  }

  /**
   * Obtém configuração completa
   */
  public getConfig(): EmpresaConfig {
    return this.config;
  }

  /**
   * Resolve qual instância usar baseado na fila
   * Retorna o número da empresa que deve estar ativo nas sessões
   */
  public resolverInstanciaParaFila(queueName: string): string | null {
    const empresaId = this.extrairEmpresaFromFila(queueName);
    if (!empresaId) {
      logger.warn(`⚠️ Não foi possível extrair empresa da fila: ${queueName}`);
      return null;
    }

    const numero = this.getNumeroEmpresa(empresaId);
    if (!numero) {
      logger.warn(`⚠️ Empresa ${empresaId} não encontrada ou inativa`);
      return null;
    }

    logger.info(`📋 Fila ${queueName} → Empresa ${empresaId} → Número ${numero}`);
    return numero;
  }

  /**
   * Recarrega configuração do arquivo
   */
  public reloadConfig(): void {
    this.loadConfig();
  }
} 