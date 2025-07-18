import { createClient } from 'redis';
import logger from '../utils/Logger';

export class RedisClient {
  private static instance: RedisClient;
  private client: any;

  private constructor() {
    this.client = createClient({
      url: 'redis://localhost:6379'
    });

    this.client.on('error', (err: any) => {
      logger.error('🔴 Erro na conexão Redis:', err);
    });

    this.client.on('connect', () => {
              logger.info('🔗 Conectado ao Redis');
    });
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  public getClient() {
    return this.client;
  }

  // Métodos utilitários
  public async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  public async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  public async del(key: string): Promise<number> {
    return await this.client.del(key);
  }
} 