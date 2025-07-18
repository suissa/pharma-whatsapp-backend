# 📊 Configuração do Grafana com OpenTelemetry

Este guia explica como conectar o sistema Pharma WhatsApp ao Grafana para monitoramento e observabilidade.

## 🏗️ Arquitetura da Stack

```
Pharma WhatsApp App
        ↓
OpenTelemetry Collector
        ↓
    ┌─────────┬─────────┐
    │  Tempo  │Prometheus│
    │(Traces) │(Metrics)│
    └─────────┬─────────┘
             ↓
          Grafana
```

## 🚀 Setup Rápido

### 1. Iniciar a Stack de Observabilidade

```bash
# Executar o script de setup
./setup-telemetry.sh
```

Ou manualmente:

```bash
# Iniciar todos os serviços
docker-compose -f docker-compose.telemetry.yml up -d

# Verificar status
docker-compose -f docker-compose.telemetry.yml ps
```

### 2. Configurar Variáveis de Ambiente

Adicione ao seu arquivo `.env`:

```env
# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
OTEL_SERVICE_NAME=pharma-whatsapp
OTEL_SERVICE_VERSION=1.0.0
OTEL_ENVIRONMENT=development
```

### 3. Acessar o Grafana

- **URL**: http://localhost:3003
- **Usuário**: admin
- **Senha**: admin123

## 📊 Dashboards Disponíveis

### Dashboard Principal: "Pharma WhatsApp - Visão Geral"

Este dashboard inclui:

- **Conexões WebSocket por Minuto**: Taxa de novas conexões
- **Mensagens Processadas por Minuto**: Volume de mensagens
- **Sessões Ativas**: Número atual de sessões WhatsApp
- **Conexões WebSocket Ativas**: Conexões em tempo real
- **Taxa de Erros (5m)**: Erros por minuto
- **Latência P95 (5m)**: Latência do 95º percentil

## 📈 Métricas no Prometheus

### 1. Acessar Prometheus

- **URL**: http://localhost:9090

### 2. Queries Úteis

```promql
# Taxa de conexões WebSocket
rate(pharma_whatsapp_websocket_connections_total[5m])

# Mensagens processadas
rate(pharma_whatsapp_messages_processed_total[5m])

# Sessões ativas
pharma_whatsapp_active_sessions

# Latência P95
histogram_quantile(0.95, rate(pharma_whatsapp_request_duration_seconds_bucket[5m]))

# Taxa de erros
rate(pharma_whatsapp_errors_total[5m])
```

## 🛠️ Configurações Avançadas

### 1. Alertas no Grafana

Criar alertas para:

```yaml
# Alta taxa de erros
rate(pharma_whatsapp_errors_total[5m]) > 0.1

# Muitas reconexões
rate(pharma_whatsapp_websocket_reconnections_total[5m]) > 5

# Latência alta
histogram_quantile(0.95, rate(pharma_whatsapp_request_duration_seconds_bucket[5m])) > 2
```


Configurar no `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
```

#### Alertas no Whatsapp

Como vocês possuem API de WhatsApp nada mais certo que criar alertas e enviá-los via webhook e aqui está o modo de se fazer isso:


### Como configurar canal de notificação (notification channel) na versão atual do Grafana:

1. No menu lateral, vá em **Alerting** (ícone de sino).

2. Clique em **Contact points** (pontos de contato).

3. Clique em **New contact point**.

4. Dê um nome para o contato, escolha o tipo **Webhook**.

5. Na configuração do Webhook, insira a URL da sua API que recebe alertas.

6. Salve.

---

### Depois crie uma regra de alerta (Alert rule):

1. Vá em **Alerting > Alert rules**.

2. Clique em **New alert rule**.

3. Configure a query (baseada em Prometheus).

4. Defina a condição de alerta (ex: quando métrica > X).

5. Na seção de notificações, associe o **Contact point** (Webhook criado).

6. Salve a regra.


#### Exemplos

1. CPU acima de 70% (por núcleo)

```promql
100 * (1 - avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])))
```

Essa query calcula o uso percentual de CPU (não ocioso) médio por instância nos últimos 5 minutos.


Pra alertar se passar de 70%:

```promql
100 * (1 - avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m]))) > 70
```

2. Uso de RAM acima de 80% (memória usada / total)

```promql
100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))
```

Memória disponível dividido pelo total, invertido para uso em %.

Pra alertar se passar de 80%:

```promql
100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 80
```

3. Uso de disco acima de 90% (em uma partição, ex: /)

```promql
100 * (node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_free_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"} > 90
```

4. Número de processos em estado "zombie" maior que 5

```promql
count by(instance) (processes_state{state="zombie"}) > 5
```

5. Taxa de erros HTTP 5xx maior que 1% nas últimas 5 minutos

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) 
/ sum(rate(http_requests_total[5m])) > 0.01
```

---

### 3. Backup e Restore

```bash
# Backup dos dados
docker run --rm -v grafana-data:/data -v $(pwd):/backup alpine tar czf /backup/grafana-backup.tar.gz -C /data .

# Restore dos dados
docker run --rm -v grafana-data:/data -v $(pwd):/backup alpine tar xzf /backup/grafana-backup.tar.gz -C /data
```

## 🔧 Troubleshooting

### 1. Serviços não iniciam

```bash
# Verificar logs
docker-compose -f docker-compose.telemetry.yml logs

# Verificar portas
netstat -tulpn | grep -E ':(3000|9090|3200|4318)'
```

### 2. Dados não aparecem no Grafana

```bash
# Verificar se o collector está recebendo dados
curl http://localhost:4318/metrics

# Verificar se o app está enviando dados
curl http://localhost:3003/health
```

### 3. Performance

```bash
# Monitorar uso de recursos
docker stats

# Verificar volumes
docker volume ls | grep pharma-whatsapp
```
