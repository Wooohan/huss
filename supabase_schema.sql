-- Supabase Database Schema for FMCSA Carrier Data
-- Run this SQL in your Supabase SQL Editor to create the carriers table

CREATE TABLE IF NOT EXISTS carriers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mc_number TEXT NOT NULL UNIQUE,
    dot_number TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    dba_name TEXT,
    entity_type TEXT,
    status TEXT,
    email TEXT,
    phone TEXT,
    power_units TEXT,
    drivers TEXT,
    physical_address TEXT,
    mailing_address TEXT,
    date_scraped TEXT,
    mcs150_date TEXT,
    mcs150_mileage TEXT,
    operation_classification TEXT[],
    carrier_operation TEXT[],
    cargo_carried TEXT[],
    out_of_service_date TEXT,
    state_carrier_id TEXT,
    duns_number TEXT,
    safety_rating TEXT,
    safety_rating_date TEXT,
    basic_scores JSONB,
    oos_rates JSONB,
    insurance_policies JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on mc_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_carriers_mc_number ON carriers(mc_number);

-- Create index on dot_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_carriers_dot_number ON carriers(dot_number);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_carriers_created_at ON carriers(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Enable all access for authenticated users" ON carriers
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Create policy to allow read access for anonymous users
CREATE POLICY "Enable read access for anonymous users" ON carriers
    FOR SELECT
    USING (true);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_carriers_updated_at BEFORE UPDATE ON carriers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE carriers IS 'FMCSA carrier data with insurance and safety information';
COMMENT ON COLUMN carriers.mc_number IS 'MC/MX Number - Unique identifier';
COMMENT ON COLUMN carriers.dot_number IS 'USDOT Number';
COMMENT ON COLUMN carriers.insurance_policies IS 'JSON array of insurance policies';
COMMENT ON COLUMN carriers.basic_scores IS 'JSON array of BASIC performance scores';
COMMENT ON COLUMN carriers.oos_rates IS 'JSON array of Out-of-Service rates';