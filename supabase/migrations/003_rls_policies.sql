-- Enable Row Level Security (RLS)
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_metadata ENABLE ROW LEVEL SECURITY;

-- For personal use, allow all operations with anon key
-- In production, you'd want more granular policies based on auth.uid()

-- Journals policies
CREATE POLICY "Allow all operations on journals" ON journals
  FOR ALL USING (true) WITH CHECK (true);

-- Plans policies
CREATE POLICY "Allow all operations on plans" ON plans
  FOR ALL USING (true) WITH CHECK (true);

-- Protocols policies
CREATE POLICY "Allow all operations on protocols" ON protocols
  FOR ALL USING (true) WITH CHECK (true);

-- Journal metadata policies
CREATE POLICY "Allow all operations on journal_metadata" ON journal_metadata
  FOR ALL USING (true) WITH CHECK (true);

-- Note: These permissive policies are fine for personal use.
-- If you want to add authentication later, you can modify these to use auth.uid()

