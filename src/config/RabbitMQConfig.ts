// Configuração centralizada do RabbitMQ para o projeto
export const rabbitMQConfig = {
  connection: {
    hostname: 'localhost',
    port: 5672,
    username: 'admin',
    password: 'admin123',
    vhost: '/',
  },
  url: 'amqp://admin:admin123@localhost:5672/',
  queues: {
    defaultExchange: 'direct',
    prefetch: 10,
    durable: true,
  },
};
