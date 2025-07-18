// Configuração global para testes
process.env.NODE_ENV = 'test';

// Aumentar timeout para testes de integração
jest.setTimeout(10000);

// Mock do ffmpeg para testes
jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = jest.fn().mockImplementation(() => ({
    input: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    run: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
    pipe: jest.fn().mockReturnThis()
  }));
  
  mockFfmpeg.setFfmpegPath = jest.fn();
  return mockFfmpeg;
});

// Mock do @ffmpeg-installer/ffmpeg
jest.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: 'mock-ffmpeg-path'
})); 