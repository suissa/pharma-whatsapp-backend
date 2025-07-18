import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import logger from '../utils/Logger';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

export class OpenTelemetryConfig {
  private static instance: OpenTelemetryConfig;
  private sdk: NodeSDK | null = null;

  private constructor() {}

  public static getInstance(): OpenTelemetryConfig {
    if (!OpenTelemetryConfig.instance) {
      OpenTelemetryConfig.instance = new OpenTelemetryConfig();
    }
    return OpenTelemetryConfig.instance;
  }

  public initialize(): void {
    if (this.sdk) {
      logger.info('🔧 OpenTelemetry já está inicializado');
      return;
    }

    logger.info('🔧 Inicializando OpenTelemetry...');

    // Configurar exportador de traces
    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      headers: {},
    });

    // Configurar exportador de métricas
    const metricExporter = new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
      headers: {},
    });

    // Configurar o SDK
    this.sdk = new NodeSDK({
      spanProcessor: new BatchSpanProcessor(traceExporter),
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 1000, // Exportar métricas a cada 1 segundo
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-express': {
            ignoreLayers: ['middleware - express.static'],
          },
        }),
      ],
    });

    // Inicializar o SDK
    this.sdk.start();
    logger.info('✅ OpenTelemetry inicializado com sucesso');
    logger.info('📊 Traces serão enviados para:', process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces');
    logger.info('📈 Métricas serão enviadas para:', process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics');

    // Configurar graceful shutdown
    process.on('SIGTERM', () => {
      this.shutdown();
    });

    process.on('SIGINT', () => {
      this.shutdown();
    });
  }

  public shutdown(): void {
    if (this.sdk) {
      logger.info('🛑 Encerrando OpenTelemetry...');
      this.sdk.shutdown()
        .then(() => {
          logger.info('✅ OpenTelemetry encerrado com sucesso');
        })
        .catch((error) => {
          logger.error('❌ Erro ao encerrar OpenTelemetry:', error);
        });
    }
  }

  public getSDK(): NodeSDK | null {
    return this.sdk;
  }
} 