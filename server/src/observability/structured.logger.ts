import {
  ConsoleLogger,
  type LoggerService,
  type LogLevel,
} from '@nestjs/common';

import { getRequestContext } from './request-context';

type LogRecord = {
  time: string;
  level: LogLevel;
  message: string;
  context?: string;
  requestId?: string;
  userId?: string;
  workspaceId?: string;
  stack?: string;
};

export class StructuredLogger extends ConsoleLogger implements LoggerService {
  private readonly asJson: boolean;

  constructor(asJson: boolean) {
    super();
    this.asJson = asJson;
  }

  private emit(level: LogLevel, message: unknown, ...rest: unknown[]): void {
    if (!this.asJson) {
      switch (level) {
        case 'error':
          super.error(message as string, ...(rest as string[]));
          return;
        case 'warn':
          super.warn(message as string, ...(rest as string[]));
          return;
        case 'debug':
          super.debug(message as string, ...(rest as string[]));
          return;
        case 'verbose':
          super.verbose(message as string, ...(rest as string[]));
          return;
        default:
          super.log(message as string, ...(rest as string[]));
          return;
      }
    }

    const context = getRequestContext();
    const stack = rest.find(
      (value) => typeof value === 'string' && value.includes('\n    at '),
    );

    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      context: rest.find(
        (value) => typeof value === 'string' && value !== stack,
      ) as string | undefined,
      requestId: context?.requestId,
      userId: context?.userId,
      workspaceId: context?.workspaceId,
      stack: stack as string | undefined,
    };

    // oxlint-disable-next-line no-console
    console.log(JSON.stringify(record));
  }

  override log(message: unknown, ...rest: unknown[]): void {
    this.emit('log', message, ...rest);
  }

  override error(message: unknown, ...rest: unknown[]): void {
    this.emit('error', message, ...rest);
  }

  override warn(message: unknown, ...rest: unknown[]): void {
    this.emit('warn', message, ...rest);
  }

  override debug(message: unknown, ...rest: unknown[]): void {
    this.emit('debug', message, ...rest);
  }

  override verbose(message: unknown, ...rest: unknown[]): void {
    this.emit('verbose', message, ...rest);
  }
}
