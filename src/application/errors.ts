export class AppError extends Error {
    constructor(
        message: string,
        public readonly type: 'validation' | 'notFound' | 'conflict' | 'infra'
    ) {
        super(message);
        this.name = 'AppError';
    }

    static validation(message: string): AppError {
        return new AppError(message, 'validation');
    }

    static NotFoundError(message: string): AppError {
        return new AppError(message, 'notFound');
    }

    static ConflictError(message: string): AppError {
        return new AppError(message, 'conflict');
    }

    static InfraError(message: string): AppError {
        return new AppError(message, 'infra');
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 'validation');
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string) {
        super(message, 'notFound');
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 'conflict');
        this.name = 'ConflictError';
    }
}

export class InfraError extends AppError {
    constructor(message: string) {
        super(message, 'infra');
        this.name = 'InfraError';
    }
}