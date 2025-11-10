export class SKU {
    private constructor(private readonly value: string) {}

    static create(value: string): SKU {
        if (!value || value.trim().length === 0) {
            throw new Error('SKU cannot be empty');
        }
        if (!/^[A-Z0-9]{3,10}$/.test(value)) {
            throw new Error('SKU must be between 3-10 uppercase alphanumeric characters');
        }
        return new SKU(value.trim());
    }

    toString(): string {
        return this.value;
    }

    equals(other: SKU): boolean {
        return this.value === other.value;
    }
}