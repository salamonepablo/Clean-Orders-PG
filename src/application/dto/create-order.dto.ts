export interface CreateOrderDto {
    currency: string;
}

export interface CreateOrderResponseDto {
    orderId: string;
    currency: string;
}