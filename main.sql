-- ═══════════════════════════════════════════════════════
-- AGROMIND SUPABASE DATABASE SCHEMA
-- Diseño: Agronomía para Santa Cruz, Bolivia
-- ═══════════════════════════════════════════════════════

-- ✅ FIX CRÍTICO: La tabla "users" debe sincronizarse con auth.users de Supabase.
-- La columna "id" debe referenciar auth.users(id), NO gen_random_uuid(),
-- porque Supabase Auth ya genera el UUID y lo gestiona él mismo.

-- 1. TABLA DE USUARIOS (Agricultores)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ✅ FIXED: era "DEFAULT gen_random_uuid()" — incorrecto porque el id
  --    debe coincidir exactamente con auth.users.id al hacer INSERT desde el cliente.
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  location_name TEXT DEFAULT 'Santa Cruz de la Sierra',
  latitude DECIMAL(10,6) DEFAULT -17.7863,
  longitude DECIMAL(10,6) DEFAULT -63.1812,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  -- ✅ FIX menor: TIMESTAMPTZ (con zona horaria) en vez de TIMESTAMP
  --    para evitar confusión horaria entre Bolivia (UTC-4) y el servidor.
);

-- 2. TABLA DE CULTIVOS DEL USUARIO
CREATE TABLE IF NOT EXISTS user_crops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  crop_emoji TEXT,
  area_hectares DECIMAL(10,2) CHECK (area_hectares > 0),
  -- ✅ FIX: CHECK constraint — no tiene sentido área negativa o cero
  planting_date DATE,
  expected_harvest DATE,
  status TEXT DEFAULT 'activo' CHECK (status IN ('activo', 'cosechado', 'abandonado')),
  -- ✅ FIX: CHECK constraint — evita valores inválidos en status
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE DATOS CLIMÁTICOS
CREATE TABLE IF NOT EXISTS weather_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temperature DECIMAL(5,2),
  apparent_temperature DECIMAL(5,2),
  humidity DECIMAL(5,2) CHECK (humidity BETWEEN 0 AND 100),
  -- ✅ FIX: humedad siempre entre 0 y 100
  precipitation DECIMAL(8,2) CHECK (precipitation >= 0),
  wind_speed DECIMAL(8,2) CHECK (wind_speed >= 0),
  weather_code INTEGER,
  weather_description TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA DE ALERTAS DE PLAGAS
CREATE TABLE IF NOT EXISTS pest_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pest_name TEXT NOT NULL,
  crop_affected TEXT,
  risk_level TEXT CHECK (risk_level IN ('bajo', 'moderado', 'alto')),
  -- ✅ FIX: CHECK constraint en risk_level
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  -- ✅ FIX: score acotado entre 0 y 100
  description TEXT,
  recommended_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA DE RECOMENDACIONES AGRONOMICAS
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_type TEXT CHECK (
    recommendation_type IN ('cultivo', 'riego', 'fertilizacion', 'plagas', 'temporal')
  ),
  -- ✅ FIX: CHECK constraint en tipo
  crop_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('bajo', 'normal', 'alto')),
  -- ✅ FIX: CHECK constraint en urgency
  action_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLA DE CHAT / ASISTENTE IA
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  -- ✅ FIX: CHECK constraint — solo dos roles válidos
  content TEXT NOT NULL CHECK (char_length(content) > 0),
  -- ✅ FIX: no permitir mensajes vacíos
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLA DE HISTORIAL DE COSECHAS
CREATE TABLE IF NOT EXISTS harvest_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  area_harvested DECIMAL(10,2) CHECK (area_harvested > 0),
  yield_kg DECIMAL(12,2) CHECK (yield_kg >= 0),
  harvest_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- TRIGGER: actualizar "updated_at" automáticamente
-- ✅ NUEVO: sin esto, updated_at nunca cambia solo
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_user_crops_updated_at
  BEFORE UPDATE ON user_crops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_history ENABLE ROW LEVEL SECURITY;

-- ── users ──
CREATE POLICY "users_select_own"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_insert_own"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
  -- ✅ FIX: faltaba la política INSERT en users.
  --    Sin ella, el registro del perfil desde el cliente falla con RLS.

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- ── user_crops ──
CREATE POLICY "crops_select_own"
  ON user_crops FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "crops_insert_own"
  ON user_crops FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "crops_update_own"
  ON user_crops FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "crops_delete_own"
  ON user_crops FOR DELETE
  USING (auth.uid() = user_id);

-- ── weather_records ──
CREATE POLICY "weather_select_own"
  ON weather_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "weather_insert_own"
  ON weather_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── pest_alerts ──
CREATE POLICY "pests_select_own"
  ON pest_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "pests_insert_own"
  ON pest_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── recommendations ──
CREATE POLICY "recs_select_own"
  ON recommendations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "recs_insert_own"
  ON recommendations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── chat_messages ──
CREATE POLICY "chat_select_own"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chat_insert_own"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── harvest_history ──
CREATE POLICY "harvest_select_own"
  ON harvest_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "harvest_insert_own"
  ON harvest_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_user_crops_user_id      ON user_crops(user_id);
CREATE INDEX IF NOT EXISTS idx_weather_records_user_id ON weather_records(user_id);
CREATE INDEX IF NOT EXISTS idx_pest_alerts_user_id     ON pest_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id   ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_harvest_history_user_id ON harvest_history(user_id);
CREATE INDEX IF NOT EXISTS idx_weather_records_date    ON weather_records(recorded_at DESC);
-- ✅ FIX menor: IF NOT EXISTS en índices para poder re-ejecutar el script sin error
