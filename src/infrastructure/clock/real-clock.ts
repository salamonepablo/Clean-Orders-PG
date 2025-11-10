import { Clock } from '@application/ports/clock.js';

export class RealClock implements Clock {
    now(): Date {
        return new Date();
    }
}
