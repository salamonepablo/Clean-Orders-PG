import { Logger, LoggerContext } from '@application/ports/logger.js';

/**
 * Simple console logger implementation
 */
export class ConsoleLogger implements Logger {
    constructor(private readonly context?: LoggerContext) {}

    info(message: string, obj?: object): void {
        const contextStr = this.context ? `[${JSON.stringify(this.context)}] ` : '';
        console.log(`ℹ️  ${contextStr}${message}`, obj || '');
    }

    error(message: string, obj?: object): void {
        const contextStr = this.context ? `[${JSON.stringify(this.context)}] ` : '';
        console.error(`❌ ${contextStr}${message}`, obj || '');
    }

    warn(message: string, obj?: object): void {
        const contextStr = this.context ? `[${JSON.stringify(this.context)}] ` : '';
        console.warn(`⚠️  ${contextStr}${message}`, obj || '');
    }

    debug(message: string, obj?: object): void {
        const contextStr = this.context ? `[${JSON.stringify(this.context)}] ` : '';
        console.debug(`🔍 ${contextStr}${message}`, obj || '');
    }

    child(context: LoggerContext): Logger {
        const mergedContext = { ...this.context, ...context };
        return new ConsoleLogger(mergedContext);
    }
}
