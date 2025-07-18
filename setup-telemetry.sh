#!/bin/bash

echo "🚀 Configurando Stack de Observabilidade Pharma WhatsApp"
echo "=================================================="

# Verificar se o Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker não está rodando. Por favor, inicie o Docker primeiro."
    exit 1
fi

echo "✅ Docker está rodando"

# Criar rede se não existir
echo "🌐 Criando rede de telemetria..."
docker network create telemetry 2>/dev/null || echo "Rede já existe"

# Parar containers existentes
echo "🛑 Parando containers existentes..."
docker-compose -f docker-compose.telemetry.yml down

# Remover volumes antigos (opcional)
read -p "Deseja remover dados antigos? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️ Removendo volumes antigos..."
    docker volume rm pharma-whatsapp_prometheus-data pharma-whatsapp_grafana-data 2>/dev/null || true
fi

# Iniciar stack
echo "🚀 Iniciando stack de observabilidade..."
docker-compose -f docker-compose.telemetry.yml up -d

# Aguardar serviços iniciarem
echo "⏳ Aguardando serviços iniciarem..."
sleep 10

# Verificar status dos serviços
echo "🔍 Verificando status dos serviços..."
docker-compose -f docker-compose.telemetry.yml ps

echo ""
echo "🎉 Stack de Observabilidade iniciada com sucesso!"
echo ""
echo "📊 URLs de acesso:"
echo "   Grafana:     http://localhost:3003 (admin/admin123)"
echo "   Prometheus:  http://localhost:9090"
echo "   Tempo:       http://localhost:3200"
echo "   Collector:   http://localhost:4318"
echo ""
echo "🔧 Configuração do aplicativo:"
echo "   Adicione ao seu .env:"
echo "   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces"
echo "   OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics"
echo ""
echo "📋 Próximos passos:"
echo "   1. Acesse o Grafana em http://localhost:3003"
echo "   2. Faça login com admin/admin123"
echo "   3. O dashboard 'Pharma WhatsApp - Visão Geral' será carregado automaticamente"
echo "   4. Configure alertas se necessário"
echo ""
echo "🛑 Para parar: docker-compose -f docker-compose.telemetry.yml down"
echo "📝 Para ver logs: docker-compose -f docker-compose.telemetry.yml logs -f"
