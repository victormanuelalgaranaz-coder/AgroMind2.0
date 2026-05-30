// ═══════════════════════════════════════════════════════
// AGROMIND - SUPABASE INTEGRATION
// Gestión de datos y autenticación con Supabase
// ═══════════════════════════════════════════════════════

// CONFIGURACIÓN SUPABASE
// ⚠️ EDITAR ESTOS VALORES CON TUS CREDENCIALES
// Obtén de: Supabase Dashboard > Settings > API
const SUPABASE_URL = 'https://hftxtpgjqjlxprkbcwjf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_m8Yy7RYFx3KkjiFKIymZlg_bJaWQY1Z';

// Importar cliente Supabase (añade esto al HTML: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>)
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════════════
let currentUser = null;
let currentWeatherData = null;
let userCrops = [];
let pestAlerts = [];

// ═══════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════

async function initAuth() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
      currentUser = user;
      await loadUserProfile();
      console.log('✅ Usuario autenticado:', user.email);
    } else {
      console.log('No hay sesión. Redirigiendo a login...');
      showLoginPage();
    }
  } catch (error) {
    console.error('Error en autenticación:', error);
    showLoginPage();
  }
}

async function loginUser(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    currentUser = data.user;
    await loadUserProfile();
    return true;
  } catch (error) {
    console.error('Error login:', error.message);
    return false;
  }
}

async function signupUser(email, password, fullName) {
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });
    if (error) throw error;
    
    currentUser = data.user;
    
    // Crear perfil en tabla users
    await supabaseClient.from('users').insert([{
      id: data.user.id,
      email: email,
      full_name: full_Name
    }]);
    
    return true;
  } catch (error) {
    console.error('Error signup:', error.message);
    return false;
  }
}

async function logoutUser() {
  try {
    await supabaseClient.auth.signOut();
    currentUser = null;
    showLoginPage();
  } catch (error) {
    console.error('Error logout:', error);
  }
}

// ═══════════════════════════════════════════════════════
// PERFIL DE USUARIO
// ═══════════════════════════════════════════════════════

async function loadUserProfile() {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', currentUser.id)
      .single();
    
    if (error) throw error;
    
    // Guardar ubicación del usuario
    if (data) {
      window.LAT = data.latitude || -17.7863;
      window.LON = data.longitude || -63.1812;
      window.CITY = data.location_name || 'Santa Cruz de la Sierra';
    }
    
    return data;
  } catch (error) {
    console.error('Error cargando perfil:', error);
    return null;
  }
}

async function updateUserProfile(updates) {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .update(updates)
      .eq('id', currentUser.id)
      .select();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// CULTIVOS DEL USUARIO
// ═══════════════════════════════════════════════════════

async function addUserCrop(cropData) {
  try {
    const { data, error } = await supabaseClient
      .from('user_crops')
      .insert([{
        user_id: currentUser.id,
        crop_name: cropData.name,
        crop_emoji: cropData.emoji,
        area_hectares: cropData.area,
        planting_date: cropData.plantingDate,
        status: 'activo'
      }])
      .select();
    
    if (error) throw error;
    await loadUserCrops();
    return data;
  } catch (error) {
    console.error('Error añadiendo cultivo:', error);
    return null;
  }
}

async function loadUserCrops() {
  try {
    const { data, error } = await supabaseClient
      .from('user_crops')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('status', 'activo');
    
    if (error) throw error;
    userCrops = data || [];
    return userCrops;
  } catch (error) {
    console.error('Error cargando cultivos:', error);
    return [];
  }
}

async function deleteUserCrop(cropId) {
  try {
    const { error } = await supabaseClient
      .from('user_crops')
      .update({ status: 'cosechado' })
      .eq('id', cropId);
    
    if (error) throw error;
    await loadUserCrops();
    return true;
  } catch (error) {
    console.error('Error eliminando cultivo:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
// DATOS CLIMÁTICOS
// ═══════════════════════════════════════════════════════

async function fetchAndSaveWeather() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${window.LAT}&longitude=${window.LON}`
      + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max,weather_code`
      + `&timezone=America%2FSanta_Isabel&forecast_days=7`;

    const res = await fetch(url);
    const data = await res.json();
    currentWeatherData = data;

    // Guardar en Supabase
    const { error } = await supabaseClient
      .from('weather_records')
      .insert([{
        user_id: currentUser.id,
        temperature: data.current.temperature_2m,
        apparent_temperature: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        precipitation: data.current.precipitation,
        wind_speed: data.current.wind_speed_10m,
        weather_code: data.current.weather_code,
        weather_description: getWeatherDescription(data.current.weather_code)
      }]);

    if (error) console.error('Error guardando clima:', error);
    
    return data;
  } catch (error) {
    console.error('Error fetchAndSaveWeather:', error);
    return null;
  }
}

async function getWeatherHistory(days = 30) {
  try {
    const { data, error } = await supabaseClient
      .from('weather_records')
      .select('*')
      .eq('user_id', currentUser.id)
      .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error cargando historial climático:', error);
    return [];
  }
}

function getWeatherDescription(code) {
  if (code === 0) return 'Despejado';
  if (code <= 2) return 'Parcialmente nublado';
  if (code <= 3) return 'Nublado';
  if (code <= 48) return 'Neblina';
  if (code <= 55) return 'Llovizna';
  if (code <= 65) return 'Lluvia moderada';
  if (code <= 75) return 'Nieve';
  if (code <= 82) return 'Chubascos';
  if (code <= 99) return 'Tormenta eléctrica';
  return 'Cielo variable';
}

// ═══════════════════════════════════════════════════════
// ALERTAS DE PLAGAS
// ═══════════════════════════════════════════════════════

async function addPestAlert(pestData) {
  try {
    const { data, error } = await supabaseClient
      .from('pest_alerts')
      .insert([{
        user_id: currentUser.id,
        pest_name: pestData.name,
        crop_affected: pestData.crop,
        risk_level: pestData.level,
        risk_score: pestData.score,
        description: pestData.description,
        recommended_action: pestData.action
      }])
      .select();
    
    if (error) throw error;
    await loadPestAlerts();
    return data;
  } catch (error) {
    console.error('Error añadiendo alerta de plaga:', error);
    return null;
  }
}

async function loadPestAlerts() {
  try {
    const { data, error } = await supabaseClient
      .from('pest_alerts')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    pestAlerts = data || [];
    return pestAlerts;
  } catch (error) {
    console.error('Error cargando alertas de plagas:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// RECOMENDACIONES AGRONOMICAS
// ═══════════════════════════════════════════════════════

async function addRecommendation(recData) {
  try {
    const { data, error } = await supabaseClient
      .from('recommendations')
      .insert([{
        user_id: currentUser.id,
        recommendation_type: recData.type,
        crop_name: recData.crop,
        title: recData.title,
        description: recData.description,
        urgency: recData.urgency || 'normal'
      }])
      .select();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error añadiendo recomendación:', error);
    return null;
  }
}

async function getRecommendations() {
  try {
    const { data, error } = await supabaseClient
      .from('recommendations')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error cargando recomendaciones:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// CHAT / ASISTENTE IA
// ═══════════════════════════════════════════════════════

async function saveChatMessage(role, content) {
  try {
    const { data, error } = await supabaseClient
      .from('chat_messages')
      .insert([{
        user_id: currentUser.id,
        role: role,
        content: content
      }])
      .select();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error guardando mensaje:', error);
    return null;
  }
}

async function getChatHistory(limit = 50) {
  try {
    const { data, error } = await supabaseClient
      .from('chat_messages')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error cargando historial de chat:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// COSECHAS
// ═══════════════════════════════════════════════════════

async function addHarvestRecord(harvestData) {
  try {
    const { data, error } = await supabaseClient
      .from('harvest_history')
      .insert([{
        user_id: currentUser.id,
        crop_name: harvestData.cropName,
        area_harvested: harvestData.area,
        yield_kg: harvestData.yield,
        harvest_date: harvestData.date,
        notes: harvestData.notes
      }])
      .select();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error añadiendo registro de cosecha:', error);
    return null;
  }
}

async function getHarvestHistory() {
  try {
    const { data, error } = await supabaseClient
      .from('harvest_history')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('harvest_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error cargando historial de cosechas:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// SUSCRIPCIONES EN TIEMPO REAL (WEBSOCKETS)
// ═══════════════════════════════════════════════════════

function subscribeToWeatherUpdates(callback) {
  return supabaseClient
    .channel(`weather:${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'weather_records', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();
}

function subscribeToPestAlerts(callback) {
  return supabaseClient
    .channel(`pests:${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pest_alerts', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();
}

// ═══════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════

function showLoginPage() {
  document.body.innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <h1>🌾 AgroMind</h1>
        <p>Tu asistente agronomía digital</p>
        <form id="loginForm">
          <input type="email" id="email" placeholder="Correo electrónico" required>
          <input type="password" id="password" placeholder="Contraseña" required>
          <button type="submit">Entrar</button>
        </form>
        <p style="text-align:center; margin-top:20px">
          ¿No tienes cuenta? <a href="#" onclick="toggleSignup()">Registrarse</a>
        </p>
        <form id="signupForm" style="display:none">
          <h3>Crear nueva cuenta</h3>
          <input type="text" id="fullname" placeholder="Tu nombre completo" required>
          <input type="email" id="signupEmail" placeholder="Correo electrónico" required>
          <input type="password" id="signupPassword" placeholder="Contraseña" required>
          <button type="submit">Registrarse</button>
          <button type="button" onclick="toggleSignup()">Volver</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (await loginUser(email, password)) {
      location.reload();
    } else {
      alert('Error en login');
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('fullname').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    if (await signupUser(email, password, fullName)) {
      alert('Registro exitoso. Inicia sesión.');
      toggleSignup();
    } else {
      alert('Error en registro');
    }
  });
}

function toggleSignup() {
  document.getElementById('loginForm').style.display = 
    document.getElementById('loginForm').style.display === 'none' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = 
    document.getElementById('signupForm').style.display === 'none' ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', initAuth);
