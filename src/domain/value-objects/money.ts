export class Money {
    private constructor(
        private readonly amount: number,
        private readonly currency: string
    ) {}

    static create(amount: number, currency: string): Money {
        if (!currency || currency.trim().length !== 3) {
            throw new Error('Currency must be a 3-letter code');
        }
        if (!/^[A-Z]{3}$/.test(currency)) {
            throw new Error('Currency must be uppercase letters');
        }
        if (amount < 0) {
            throw new Error('Amount cannot be negative');
        }
        // Redondear a 2 decimales para evitar errores de punto flotante
        const roundedAmount = Math.round(amount * 100) / 100;
        return new Money(roundedAmount, currency);
    }

    static zero(currency: string): Money {
        return Money.create(0, currency);
    }

    add(other: Money): Money {
        if (this.currency !== other.currency) {
            throw new Error('Cannot add money of different currencies');
        }
        return Money.create(this.amount + other.amount, this.currency);
    }

    multiply(multiplier: number): Money {
        return Money.create(this.amount * multiplier, this.currency);
    }

    equals(other: Money): boolean {
        return this.amount === other.amount && this.currency === other.currency;
    }

    isGreaterThan(other: Money): boolean {
        if (this.currency !== other.currency) {
            throw new Error('Cannot compare money of different currencies');
        }
        return this.amount > other.amount;
    }

    getAmount(): number {
        return this.amount;
    }

    getCurrency(): string {
        return this.currency;
    }
}