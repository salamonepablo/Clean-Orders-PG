import { describe, it, expect } from 'vitest';
import { Money } from '@domain/value-objects/money';

describe('Money', () => {
    describe('create', () => {
        it('should create money with valid amount and currency', () => {
            const money = Money.create(100, 'EUR');
            
            expect(money.getAmount()).toBe(100);
            expect(money.getCurrency()).toBe('EUR');
        });

        it('should round amount to 2 decimals', () => {
            const money = Money.create(10.999, 'USD');
            
            expect(money.getAmount()).toBe(11);
        });

        it('should throw error for invalid currency format', () => {
            expect(() => Money.create(100, 'eu')).toThrow('Currency must be a 3-letter code');
            expect(() => Money.create(100, 'EURO')).toThrow('Currency must be a 3-letter code');
            expect(() => Money.create(100, '')).toThrow('Currency must be a 3-letter code');
            expect(() => Money.create(100, 'E1R')).toThrow('Currency must be uppercase letters');
        });

        it('should throw error for negative amount', () => {
            expect(() => Money.create(-10, 'EUR')).toThrow('Amount cannot be negative');
        });
    });

    describe('zero', () => {
        it('should create money with zero amount', () => {
            const money = Money.zero('EUR');
            
            expect(money.getAmount()).toBe(0);
            expect(money.getCurrency()).toBe('EUR');
        });
    });

    describe('add', () => {
        it('should add two money amounts with same currency', () => {
            const money1 = Money.create(100, 'EUR');
            const money2 = Money.create(50, 'EUR');
            
            const result = money1.add(money2);
            
            expect(result.getAmount()).toBe(150);
            expect(result.getCurrency()).toBe('EUR');
        });

        it('should throw error when adding different currencies', () => {
            const money1 = Money.create(100, 'EUR');
            const money2 = Money.create(50, 'USD');
            
            expect(() => money1.add(money2)).toThrow('Cannot add money of different currencies');
        });
    });

    describe('multiply', () => {
        it('should multiply money by a number', () => {
            const money = Money.create(10, 'EUR');
            
            const result = money.multiply(5);
            
            expect(result.getAmount()).toBe(50);
            expect(result.getCurrency()).toBe('EUR');
        });

        it('should handle decimal multipliers', () => {
            const money = Money.create(100, 'EUR');
            
            const result = money.multiply(0.5);
            
            expect(result.getAmount()).toBe(50);
        });
    });

    describe('equals', () => {
        it('should return true for equal money', () => {
            const money1 = Money.create(100, 'EUR');
            const money2 = Money.create(100, 'EUR');
            
            expect(money1.equals(money2)).toBe(true);
        });

        it('should return false for different amounts', () => {
            const money1 = Money.create(100, 'EUR');
            const money2 = Money.create(200, 'EUR');
            
            expect(money1.equals(money2)).toBe(false);
        });

        it('should return false for different currencies', () => {
            const money1 = Money.create(100, 'EUR');
            const money2 = Money.create(100, 'USD');
            
            expect(money1.equals(money2)).toBe(false);
        });
    });

    describe('isGreaterThan', () => {
        it('should return true when amount is greater', () => {
            const money1 = Money.create(200, 'EUR');
            const money2 = Money.create(100, 'EUR');
            
            expect(money1.isGreaterThan(money2)).toBe(true);
        });

        it('should return false when amount is less', () => {
            const money1 = Money.create(50, 'EUR');
            const money2 = Money.create(100, 'EUR');
            
            expect(money1.isGreaterThan(money2)).toBe(false);
        });

        it('should throw error when comparing different currencies', () => {
            const money1 = Money.create(100, 'EUR');
            const money2 = Money.create(100, 'USD');
            
            expect(() => money1.isGreaterThan(money2)).toThrow('Cannot compare money of different currencies');
        });
    });
});