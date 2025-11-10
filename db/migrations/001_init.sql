-- Migration 001: Initial schema for clean orders system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    total_amount_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_orders_status CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'SHIPPED', 'DELIVERED')),
    CONSTRAINT chk_orders_total_amount_positive CHECK (total_amount_value >= 0),
    CONSTRAINT chk_orders_currency_length CHECK (LENGTH(total_amount_currency) = 3)
);

-- Order items table
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL,
    sku VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_value DECIMAL(10,2) NOT NULL,
    unit_price_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    line_total_value DECIMAL(10,2) NOT NULL,
    line_total_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Foreign key constraints
    CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Business constraints
    CONSTRAINT chk_order_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_order_items_unit_price_positive CHECK (unit_price_value > 0),
    CONSTRAINT chk_order_items_line_total_positive CHECK (line_total_value >= 0),
    CONSTRAINT chk_order_items_unit_currency_length CHECK (LENGTH(unit_price_currency) = 3),
    CONSTRAINT chk_order_items_line_currency_length CHECK (LENGTH(line_total_currency) = 3),
    CONSTRAINT chk_order_items_sku_not_empty CHECK (LENGTH(TRIM(sku)) > 0)
);

-- Outbox table for event sourcing/messaging
CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Constraints
    CONSTRAINT chk_outbox_aggregate_type_not_empty CHECK (LENGTH(TRIM(aggregate_type)) > 0),
    CONSTRAINT chk_outbox_event_type_not_empty CHECK (LENGTH(TRIM(event_type)) > 0),
    CONSTRAINT chk_outbox_event_version_positive CHECK (event_version > 0)
);

-- Indexes for orders table
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_updated_at ON orders(updated_at);

-- Indexes for order_items table
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_sku ON order_items(sku);
CREATE INDEX idx_order_items_created_at ON order_items(created_at);

-- Indexes for outbox table
CREATE INDEX idx_outbox_aggregate_id ON outbox(aggregate_id);
CREATE INDEX idx_outbox_aggregate_type ON outbox(aggregate_type);
CREATE INDEX idx_outbox_event_type ON outbox(event_type);
CREATE INDEX idx_outbox_created_at ON outbox(created_at);

-- Critical index for unpublished events (published_at IS NULL)
CREATE INDEX idx_outbox_unpublished ON outbox(created_at) WHERE published_at IS NULL;

-- Composite index for efficient polling of unpublished events
CREATE INDEX idx_outbox_unpublished_composite ON outbox(aggregate_type, event_type, created_at) WHERE published_at IS NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at on orders
CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE orders IS 'Main orders table storing order information';
COMMENT ON TABLE order_items IS 'Order line items with product details and pricing';
COMMENT ON TABLE outbox IS 'Outbox pattern table for reliable event publishing';

COMMENT ON COLUMN orders.total_amount_value IS 'Total order amount in decimal format';
COMMENT ON COLUMN orders.total_amount_currency IS 'ISO 4217 currency code (3 letters)';

COMMENT ON COLUMN order_items.sku IS 'Stock Keeping Unit - product identifier';
COMMENT ON COLUMN order_items.quantity IS 'Quantity of items ordered';

COMMENT ON COLUMN outbox.published_at IS 'Timestamp when event was published (NULL = unpublished)';
COMMENT ON COLUMN outbox.event_data IS 'Event payload in JSON format';

COMMENT ON INDEX idx_outbox_unpublished IS 'Partial index for efficient querying of unpublished events';
COMMENT ON INDEX idx_outbox_unpublished_composite IS 'Composite partial index for complex outbox queries';