# Pharma FullsStack ChatBot

Além do backend implementei também uma interface de Chat com Vite, utilizando de comunicação em tempo real com websocket. Identidade visual baseada no logotipo da empresa. Reordenação dos contgatos mediante a chegada de mensagens utilizando ReactQuery.

[Pharma Chat](https://github.com/suissa/pharma-whatsapp-frontend)

Screenshots:


### Página de entrada em dark theme

![](https://i.imgur.com/uzcgOdD.png)

![](https://i.imgur.com/hChCz2F.png)
![](https://i.imgur.com/Csab4tp.png)

AudioPlayer personalizadol com a marca:

![](https://i.imgur.com/lDIVDqJ.jpeg)
![](https://i.imgur.com/lDIVDqJ.jpeg)

![Modal de imaghem com efeito de scale in and out](https://i.imgur.com/tJUnR6O.png)


# Pharma WhatsApp API

API para gerenciamento de sessões WhatsApp usando Baileys. Implementado tambpem a integração com a OpenAI, ativada apenas por palavras-chave, as quais podem ser adicionadas via API. Prompt específico para uma atendente de Farmácia.

Implementado o download, identificação e envio de todos os tipos de arquivos suportados pela Baileys, os arquivos são separados pelas seguintes categorias:

![](https://i.imgur.com/IyrBR5w.jpeg)


Implementado um MediaServer para entregar esses arquivos via Chat. Loggs via Redis.

Armazenamento das mensagens recebidasz e enviadas via WhatsApp via Redis. E implementada a reconexão automática quando o servidor reinicia.

## 🚀 Setup Rápido

```bash
# Instalar dependências
npm install

# Build e executar
npm run dev

# Ou com Docker
docker-compose up -d
```

## 📡 Rotas da API

### Base URL
```
http://localhost:3000
```

### 🔗 Rotas Principais

#### **GET /** - Informações da API
```json
{
  "message": "Baileys WhatsApp API",
  "version": "1.0.3",
  "status": "running",
  "features": ["sessions", "file-auth", "auto-reconnect", "message-store", "cors-enabled"],
  "activeSessions": []
}
```

#### **GET /docs** - Documentação da API
Retorna documentação completa com exemplos.

### 🏥 Health Check

#### **GET /api/health** - Status básico
```json
{
  "success": true,
  "status": "healthy",
  "activeSessions": 2,
  "uptime": 3600
}
```

#### **GET /api/health/detailed** - Status detalhado
```json
{
  "success": true,
  "system": {
    "uptime": 3600,
    "memory": {...},
    "platform": "linux"
  },
  "sessions": {
    "total": 2,
    "details": [...]
  }
}
```

### 💬 Sessões WhatsApp

#### **GET /api/sessions** - Listar sessões
```json
{
  "success": true,
  "sessions": [
    {
      "sessionId": "instance1",
      "status": "connected",
      "user": {
        "id": "5511999999999@s.whatsapp.net",
        "name": "Usuário"
      }
    }
  ],
  "total": 1
}
```

#### **POST /api/sessions/create** - Criar sessão
```json
{
  "instanceId": "nova-instancia"
}
```

#### **GET /api/sessions/:id** - Obter sessão específica
```
GET /api/sessions/instance1
```

#### **POST /api/sessions/:id/connect** - Conectar sessão
```
POST /api/sessions/instance1/connect
```

#### **POST /api/sessions/:id/disconnect** - Desconectar sessão
```
POST /api/sessions/instance1/disconnect
```

#### **DELETE /api/sessions/:id** - Deletar sessão
```
DELETE /api/sessions/instance1
```

#### **POST /api/sessions/:id/send** - Enviar mensagem
```json
{
  "to": "5511999999999",
  "message": "Olá!",
  "type": "text"
}
```

#### **GET /api/sessions/:id/qr** - Obter QR Code
```
GET /api/sessions/instance1/qr
```

#### **GET /api/sessions/retry-stats** - Estatísticas de retry
```json
{
  "success": true,
  "retryStats": {
    "instance1": {
      "totalRetries": 5,
      "lastRetry": "2024-01-01T10:00:00Z"
    }
  }
}
```

### 🤖 IA e Configurações

#### **GET /api/sessions/ai/stats** - Estatísticas da IA
```json
{
  "success": true,
  "aiStats": {
    "totalRequests": 100,
    "successRate": 95.5
  }
}
```

#### **POST /api/sessions/ai/test-connection** - Testar conexão IA
```json
{
  "success": true,
  "message": "Conexão com IA testada com sucesso"
}
```

#### **POST /api/sessions/ai/config** - Configurar IA
```json
{
  "model": "gpt-3.5-turbo",
  "maxTokens": 1000,
  "temperature": 0.7,
  "systemPrompt": "Você é um assistente útil."
}
```

#### **GET /api/sessions/ai/keywords** - Listar palavras-chave
```json
{
  "success": true,
  "keywords": ["urgente", "consulta", "medicamento"],
  "total": 3
}
```

#### **POST /api/sessions/ai/keywords/add** - Adicionar palavra-chave
```json
{
  "keyword": "nova-palavra"
}
```

#### **POST /api/sessions/ai/keywords/remove** - Remover palavra-chave
```json
{
  "keyword": "palavra-remover"
}
```

### 📨 Sistema de Mensageria

#### **POST /api/messages/send** - Enviar para fila
```json
{
  "queue": "whatsapp-messages",
  "message": {
    "to": "5511999999999",
    "content": "Mensagem da fila",
    "type": "text"
  }
}
```

#### **GET /api/messages/queue/:queueName/status** - Status da fila
```
GET /api/messages/queue/whatsapp-messages/status
```

#### **GET /api/messages/queues** - Listar filas
```
GET /api/messages/queues
```

#### **DELETE /api/messages/queue/:queueName/purge** - Purgar fila
```
DELETE /api/messages/queue/whatsapp-messages/purge
```

#### **GET /api/messages/stats** - Estatísticas de mensagens
```json
{
  "success": true,
  "stats": {
    "totalSent": 150,
    "totalReceived": 120,
    "queues": {
      "whatsapp-messages": 25
    }
  }
}
```

### 📁 Mídia

#### **GET /api/media/media/:fileName** - Baixar arquivo
```
GET /api/media/media/imagem.jpg
```

#### **GET /api/media/media** - Listar arquivos
```
GET /api/media/media?instanceId=instance1
```

#### **GET /api/media/upload** - Upload de arquivo
```
POST /api/media/upload
Content-Type: multipart/form-data
```

#### **DELETE /api/media/media/:fileName** - Deletar arquivo
```
DELETE /api/media/media/arquivo.pdf
```

### 📊 Recebimento de Mensagens

#### **GET /api/messages/receive/:queueName** - Receber mensagens
```
GET /api/messages/receive/whatsapp-messages?limit=10&timeout=5
```

## 🔧 Variáveis de Ambiente

```env
PORT=3000
NODE_ENV=development
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
OPENAI_API_KEY=sua-chave-aqui
```

## 📦 Scripts Disponíveis

```bash
npm start          # Executar produção
npm run dev        # Build + executar
npm run build      # Compilar TypeScript
npm test           # Executar testes
docker-compose up  # Executar com Docker
```

## 🏗️ Tecnologias

- **Node.js** + **TypeScript**
- **Baileys** (WhatsApp Web API)
- **Express.js** (API REST)
- **Redis** (Cache/Mensageria)
- **RabbitMQ** (Filas)
- **Winston** (Logging)
- **OpenTelemetry** (Observabilidade)
- **WebSocket** (Tempo real)

## 📝 Licença

MIT
