export interface AddItemOrderDto {
    orderId: string;
    sku: string;
    quantity: number;
}

export interface AddItemOrderResponseDto {
    orderId: string;
    sku: string;
    quantity: number;
    unitPrice: {
        amount: number;
        currency: string;
    };
    total: {
        amount: number;
        currency: string;
    };
}