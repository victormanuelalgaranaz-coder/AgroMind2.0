-- ═══════════════════════════════════════════════════════
-- AGROMIND SUPABASE DATABASE SCHEMA
-- Diseño: Agronomía para Santa Cruz, Bolivia
-- ═══════════════════════════════════════════════════════

-- 1. TABLA DE USUARIOS (Agricultores)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  location_name TEXT DEFAULT 'Santa Cruz de la Sierra',
  latitude DECIMAL(10,6) DEFAULT -17.7863,
  longitude DECIMAL(10,6) DEFAULT -63.1812,
  phone TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. TABLA DE CULTIVOS DEL USUARIO
CREATE TABLE IF NOT EXISTS user_crops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  crop_emoji TEXT,
  area_hectares DECIMAL(10,2),
  planting_date DATE,
  expected_harvest DATE,
  status TEXT DEFAULT 'activo', -- activo, cosechado, abandonado
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. TABLA DE DATOS CLIMÁTICOS (se guarda automáticamente)
CREATE TABLE IF NOT EXISTS weather_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temperature DECIMAL(5,2),
  apparent_temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  precipitation DECIMAL(8,2),
  wind_speed DECIMAL(8,2),
  weather_code INTEGER,
  weather_description TEXT,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- 4. TABLA DE ALERTAS DE PLAGAS
CREATE TABLE IF NOT EXISTS pest_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pest_name TEXT NOT NULL,
  crop_affected TEXT,
  risk_level TEXT, -- bajo, moderado, alto
  risk_score INTEGER,
  description TEXT,
  recommended_action TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. TABLA DE RECOMENDACIONES AGRONOMICAS
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_type TEXT, -- cultivo, riego, fertilizacion, plagas, temporal
  crop_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  urgency TEXT DEFAULT 'normal', -- bajo, normal, alto
  action_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. TABLA DE CHAT/ASISTENTE IA
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- user, assistant
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. TABLA DE HISTORIAL DE COSECHAS
CREATE TABLE IF NOT EXISTS harvest_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  area_harvested DECIMAL(10,2),
  yield_kg DECIMAL(12,2),
  harvest_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- PERMISOS Y SEGURIDAD (Row Level Security)
-- ═══════════════════════════════════════════════════════

-- Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_history ENABLE ROW LEVEL SECURITY;

-- Políticas para users
CREATE POLICY "Users can see own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Políticas para user_crops
CREATE POLICY "Users can see own crops"
  ON user_crops FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own crops"
  ON user_crops FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own crops"
  ON user_crops FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own crops"
  ON user_crops FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas para weather_records (similar para otras tablas)
CREATE POLICY "Users can see own weather"
  ON weather_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weather"
  ON weather_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Políticas para pest_alerts
CREATE POLICY "Users can see own pest alerts"
  ON pest_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pest alerts"
  ON pest_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Políticas para recommendations
CREATE POLICY "Users can see own recommendations"
  ON recommendations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recommendations"
  ON recommendations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Políticas para chat_messages
CREATE POLICY "Users can see own messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Políticas para harvest_history
CREATE POLICY "Users can see own harvest"
  ON harvest_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own harvest"
  ON harvest_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- ÍNDICES PARA OPTIMIZACIÓN
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_user_crops_user_id ON user_crops(user_id);
CREATE INDEX idx_weather_records_user_id ON weather_records(user_id);
CREATE INDEX idx_pest_alerts_user_id ON pest_alerts(user_id);
CREATE INDEX idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_harvest_history_user_id ON harvest_history(user_id);
CREATE INDEX idx_weather_records_date ON weather_records(recorded_at DESC);
