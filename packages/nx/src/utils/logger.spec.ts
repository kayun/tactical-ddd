import { info, warning } from './logger';

describe('logger', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Deterministic, color-free output regardless of the host terminal.
    delete process.env.FORCE_COLOR;
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    log.mockRestore();
    warn.mockRestore();
    process.env = { ...originalEnv };
  });

  describe('info', () => {
    it('logs to stdout with an INFO label and the message', () => {
      info('contracts created');

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('INFO contracts created');
    });
  });

  describe('warning', () => {
    it('warns to stderr with a WARNING label and the message', () => {
      warning('shared kernel missing');

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('WARNING shared kernel missing');
    });
  });

  describe('color', () => {
    it('wraps the label in ANSI color codes when color is forced on', () => {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '1';

      info('hello');

      const output = log.mock.calls[0][0] as string;
      expect(output).toContain('\x1b[34m'); // blue
      expect(output).toContain('INFO');
      expect(output).toContain('hello');
    });

    it('emits no ANSI codes when NO_COLOR is set', () => {
      warning('careful');

      const output = warn.mock.calls[0][0] as string;
      expect(output).not.toContain('\x1b[');
    });
  });
});
