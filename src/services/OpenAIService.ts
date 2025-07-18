import OpenAI from 'openai';
import path from 'path';
import dotenv from 'dotenv';
import { CircuitBreakerService } from './CircuitBreakerService';
import logger from '../utils/Logger';

dotenv.config({ path: path.resolve(__dirname, '../.env') });


export interface AIResponse {
  success: boolean;
  response?: string;
  error?: string;
  blocked?: boolean;
  reason?: string;
  timeRemaining?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MessageContext {
  sessionId: string;
  messageId: string;
  fromUser: string;
  content: string;
  messageType: string;
  timestamp: Date;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}

export class OpenAIService {
  private client: OpenAI;
  private isEnabled: boolean = true;
  private model: string = 'gpt-4o-mini';
  private maxTokens: number = 500;
  private temperature: number = 0.7;
  private circuitBreaker: CircuitBreakerService;
  private systemPrompt: string = `Você é uma atendente de farmácia virtual, com profundo conhecimento de medicamentos, genéricos, similares e contra-indicações. Ao receber perguntas de clientes, siga essas diretrizes:

1. **Identificação do medicamento:** Apresente nome genérico, nomes comerciais e dosagens disponíveis.
2. **Verificação de indicações e contraindicações:** Descreva para quais condições é indicado, principais efeitos colaterais e interações.
3. **Pesquisa de preços:** Realize uma busca rápida na web (utilizando fontes confiáveis) para encontrar o menor preço de cada apresentação (farmácia física ou online).
4. **Exibição de imagem:** Providencie o link ou uma miniatura da embalagem do medicamento, se disponível.
5. **Tom profissional e acolhedor:** Responda com clareza, evitando termos técnicos demais, mas mantendo precisão.
6. **Formato da resposta:**
   - **Nome completo do produto:** 
   - **Dosagem e apresentação:** 
   - **Indicações / Contraindicações:** 
   - **Preço mais baixo encontrado:** (informe estabelecimento e valor)
   - **Imagem:** (link ou embed)

Suas características:
- Sempre seja cordial e profissional
- Responda de forma clara e objetiva sobre medicamentos e produtos farmacêuticos
- Seja útil e prestativo com dúvidas sobre preços, disponibilidade e informações de medicamentos
- Mantenha um tom amigável e acolhedor
- Se não souber algo específico sobre um medicamento, seja honesto e sugira consultar um farmacêutico
- Use emojis ocasionalmente para tornar a conversa mais amigável
- Foque em informações sobre produtos farmacêuticos, preços e disponibilidade

Contexto: Você está atendendo clientes via WhatsApp para uma farmácia. As mensagens que chegam até você já foram filtradas por palavras-chave relacionadas a dúvidas farmacêuticas (dúvida, pharma, remédio, preço).`;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (apiKey) {
      this.client = new OpenAI({
        apiKey: apiKey,
      });
      this.isEnabled = true;
      
      // Circuit Breaker para OpenAI - 3 falhas, 60s de cooldown
      this.circuitBreaker = CircuitBreakerService.getInstance('OpenAI', 3, 60000);
      logger.info('🤖 OpenAI Service inicializado com sucesso');
    } else {
      logger.warn('⚠️ OPENAI_API_KEY não configurada. OpenAI Service desabilitado.');
      this.isEnabled = false;
    }
  }

  /**
   * Processa uma mensagem e gera uma resposta usando IA
   */
  async processMessage(context: MessageContext): Promise<AIResponse> {
    try {
      if (!this.isEnabled) {
        return {
          success: false,
          error: 'OpenAI Service não está habilitado. Configure OPENAI_API_KEY.'
        };
      }

      logger.info(`🤖 Processando mensagem com IA: ${context.messageId}`);

      // Preparar histórico da conversa
      const messages = this.prepareConversationHistory(context);

      // Fazer chamada para a OpenAI
      const completion = await this.circuitBreaker.execute(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages: messages,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
        })
      );

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        return {
          success: false,
          error: 'Não foi possível gerar uma resposta da IA'
        };
      }

      logger.info(`✅ Resposta da IA gerada: ${response.substring(0, 100)}...`);

      return {
        success: true,
        response: response,
        usage: {
          prompt_tokens: completion.usage?.prompt_tokens || 0,
          completion_tokens: completion.usage?.completion_tokens || 0,
          total_tokens: completion.usage?.total_tokens || 0,
        }
      };

    } catch (error: any) {
      logger.error('🔴 Erro ao processar mensagem com IA:', error);
      
      return {
        success: false,
        error: error.message || 'Erro desconhecido ao processar com IA'
      };
    }
  }

  /**
   * Prepara o histórico da conversa para enviar à OpenAI
   */
  private prepareConversationHistory(context: MessageContext): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: this.systemPrompt
      }
    ];

    // Adicionar histórico da conversa se disponível
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      // Pegar apenas as últimas 10 mensagens para não exceder limites
      const recentHistory = context.conversationHistory.slice(-10);
      
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Adicionar a mensagem atual
    messages.push({
      role: 'user',
      content: context.content
    });

    return messages;
  }

  /**
   * Verifica se o serviço está habilitado
   */
  isServiceEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Atualiza a configuração do sistema
   */
  updateConfiguration(config: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }): void {
    if (config.model) this.model = config.model;
    if (config.maxTokens) this.maxTokens = config.maxTokens;
    if (config.temperature) this.temperature = config.temperature;
    if (config.systemPrompt) this.systemPrompt = config.systemPrompt;

    logger.info('⚙️ Configuração da OpenAI atualizada:', config);
  }

  /**
   * Obtém estatísticas do serviço
   */
  getStats(): any {
    return {
      enabled: this.isEnabled,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      systemPrompt: this.systemPrompt.substring(0, 100) + '...'
    };
  }

  /**
   * Testa a conexão com a OpenAI
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isEnabled) {
        return { success: false, error: 'Serviço não habilitado' };
      }

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Teste de conexão' }],
        max_tokens: 10,
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
} 