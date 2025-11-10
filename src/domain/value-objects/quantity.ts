export class Quantity {
    private constructor(private readonly value: number) {}

    static create(value: number): Quantity {
        if (!Number.isInteger(value)) {
            throw new Error('Quantity must be an integer');
        }
        if (value <= 0) {
            throw new Error('Quantity must be greater than zero');
        }
        if (value > 1000) {
            throw new Error('Quantity cannot exceed 1000 units');
        }
        return new Quantity(value);
    }

    toNumber(): number {
        return this.value;
    }

    add(other: Quantity): Quantity {
        return Quantity.create(this.value + other.value);
    }

    multiply(multiplier: number): Quantity {
        return Quantity.create(this.value * multiplier);
    }

    equals(other: Quantity): boolean {
        return this.value === other.value;
    }
}