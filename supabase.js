// ═══════════════════════════════════════════════════════
// AGROMIND - SUPABASE INTEGRATION
// ═══════════════════════════════════════════════════════

const SUPABASE_URL = 'https://eoyzvqdtgbwzzxtjzpyv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Oz1_ZPUIUG-43RaR0QCJ4A_uWiABD5v';

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
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session && session.user) {
      currentUser = session.user;
      await ensureUserProfile(session.user);
      console.log('✅ Usuario autenticado:', session.user.email);
      initDashboard();  // Llamada correcta
    } else {
      showLoginPage();
    }
  } catch (error) {
    console.error('Error en autenticación:', error);
    showLoginPage();
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      if (document.getElementById('mainContent')) {
        showLoginPage();
      }
    }
  });
}

async function loginUser(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    await ensureUserProfile(data.user);
    return { success: true };
  } catch (error) {
    console.error('Error login:', error.message);
    return { success: false, message: error.message };
  }
}

async function signupUser(email, password, fullName) {
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;

    if (data.session) {
      currentUser = data.user;
      await ensureUserProfile(data.user, fullName);
      return { success: true, needsConfirmation: false };
    }
    if (data.user) {
      return { success: true, needsConfirmation: true };
    }
    throw new Error('No se pudo crear el usuario');
  } catch (error) {
    console.error('Error signup:', error.message);
    return { success: false, message: error.message };
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

async function ensureUserProfile(user, fullName = null) {
  try {
    const { data, error } = await supabaseClient
      .from('users').select('*').eq('id', user.id).single();

    if (error && error.code === 'PGRST116') {
      const name = fullName || user.user_metadata?.full_name || user.email.split('@')[0];
      const { error: insertError } = await supabaseClient.from('users').insert([{
        id: user.id, email: user.email, full_name: name,
        location_name: 'Santa Cruz de la Sierra', latitude: -17.7863, longitude: -63.1812
      }]);
      if (insertError) console.error('Error creando perfil:', insertError.message);
      else console.log('✅ Perfil creado para:', user.email);
    } else if (data) {
      window.LAT  = data.latitude      || -17.7863;
      window.LON  = data.longitude     || -63.1812;
      window.CITY = data.location_name || 'Santa Cruz de la Sierra';
    }
    return data;
  } catch (error) {
    console.error('Error en ensureUserProfile:', error);
    return null;
  }
}

async function loadUserProfile() {
  try {
    const { data, error } = await supabaseClient
      .from('users').select('*').eq('id', currentUser.id).single();
    if (error) throw error;
    if (data) {
      window.LAT  = data.latitude      || -17.7863;
      window.LON  = data.longitude     || -63.1812;
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
      .from('users').update(updates).eq('id', currentUser.id).select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// CULTIVOS
// ═══════════════════════════════════════════════════════

async function addUserCrop(cropData) {
  try {
    const { data, error } = await supabaseClient.from('user_crops').insert([{
      user_id: currentUser.id, crop_name: cropData.name, crop_emoji: cropData.emoji,
      area_hectares: cropData.area, planting_date: cropData.plantingDate, status: 'activo'
    }]).select();
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
      .from('user_crops').select('*').eq('user_id', currentUser.id).eq('status', 'activo');
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
      .from('user_crops').update({ status: 'cosechado' }).eq('id', cropId);
    if (error) throw error;
    await loadUserCrops();
    return true;
  } catch (error) {
    console.error('Error eliminando cultivo:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
// CLIMA
// ═══════════════════════════════════════════════════════

async function fetchAndSaveWeather() {
  try {
    const lat = window.LAT || -17.7863;
    const lon = window.LON || -63.1812;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max,weather_code`
      + `&timezone=America%2FSanta_Isabel&forecast_days=7`;

    const res  = await fetch(url);
    const data = await res.json();
    currentWeatherData = data;

    const { error } = await supabaseClient.from('weather_records').insert([{
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
    const { data, error } = await supabaseClient.from('weather_records').select('*')
      .eq('user_id', currentUser.id)
      .gte('recorded_at', new Date(Date.now() - days * 86400000).toISOString())
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
  if (code <= 2)  return 'Parcialmente nublado';
  if (code <= 3)  return 'Nublado';
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
    const { data, error } = await supabaseClient.from('pest_alerts').insert([{
      user_id: currentUser.id, pest_name: pestData.name, crop_affected: pestData.crop,
      risk_level: pestData.level, risk_score: pestData.score,
      description: pestData.description, recommended_action: pestData.action
    }]).select();
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
    const { data, error } = await supabaseClient.from('pest_alerts').select('*')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    pestAlerts = data || [];
    return pestAlerts;
  } catch (error) {
    console.error('Error cargando alertas de plagas:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// RECOMENDACIONES
// ═══════════════════════════════════════════════════════

async function addRecommendation(recData) {
  try {
    const { data, error } = await supabaseClient.from('recommendations').insert([{
      user_id: currentUser.id, recommendation_type: recData.type, crop_name: recData.crop,
      title: recData.title, description: recData.description, urgency: recData.urgency || 'normal'
    }]).select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error añadiendo recomendación:', error);
    return null;
  }
}

async function getRecommendations() {
  try {
    const { data, error } = await supabaseClient.from('recommendations').select('*')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20);
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
    const { data, error } = await supabaseClient.from('chat_messages').insert([{
      user_id: currentUser.id, role, content
    }]).select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error guardando mensaje:', error);
    return null;
  }
}

async function getChatHistory(limit = 50) {
  try {
    const { data, error } = await supabaseClient.from('chat_messages').select('*')
      .eq('user_id', currentUser.id).order('created_at', { ascending: true }).limit(limit);
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
    const { data, error } = await supabaseClient.from('harvest_history').insert([{
      user_id: currentUser.id, crop_name: harvestData.cropName,
      area_harvested: harvestData.area, yield_kg: harvestData.yield,
      harvest_date: harvestData.date, notes: harvestData.notes
    }]).select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error añadiendo registro de cosecha:', error);
    return null;
  }
}

async function getHarvestHistory() {
  try {
    const { data, error } = await supabaseClient.from('harvest_history').select('*')
      .eq('user_id', currentUser.id).order('harvest_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error cargando historial de cosechas:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
// SUSCRIPCIONES EN TIEMPO REAL
// ═══════════════════════════════════════════════════════

function subscribeToWeatherUpdates(callback) {
  return supabaseClient.channel(`weather:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'weather_records', filter: `user_id=eq.${currentUser.id}` }, (p) => callback(p.new))
    .subscribe();
}

function subscribeToPestAlerts(callback) {
  return supabaseClient.channel(`pests:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pest_alerts', filter: `user_id=eq.${currentUser.id}` }, (p) => callback(p.new))
    .subscribe();
}

// ═══════════════════════════════════════════════════════
// UI — LOGIN / REGISTRO
// ═══════════════════════════════════════════════════════

function showLoginPage() {
  document.body.innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <h1>🌾 AgroMind</h1>
        <p>Tu asistente de agronomía digital</p>

        <form id="loginForm">
          <input type="email" id="email" placeholder="Correo electrónico" required>
          <input type="password" id="password" placeholder="Contraseña (mín. 6 caracteres)" required minlength="6">
          <button type="submit" id="btnLogin">Entrar</button>
          <p id="loginError" style="color:red;display:none;margin-top:8px;"></p>
        </form>

        <p style="text-align:center;margin-top:20px">
          ¿No tienes cuenta? <a href="#" onclick="toggleSignup()">Registrarse</a>
        </p>

        <form id="signupForm" style="display:none">
          <h3>Crear nueva cuenta</h3>
          <input type="text" id="fullname" placeholder="Tu nombre completo" required>
          <input type="email" id="signupEmail" placeholder="Correo electrónico" required>
          <input type="password" id="signupPassword" placeholder="Contraseña (mín. 6 caracteres)" required minlength="6">
          <button type="submit" id="btnSignup">Registrarse</button>
          <p id="signupError" style="color:red;display:none;margin-top:8px;"></p>
          <button type="button" onclick="toggleSignup()" style="margin-top:8px;">Volver al login</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn   = document.getElementById('btnLogin');
    const errEl = document.getElementById('loginError');
    btn.textContent = 'Entrando...';
    btn.disabled = true;
    errEl.style.display = 'none';

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const result   = await loginUser(email, password);

    if (result.success) {
      window.location.replace(window.location.href);
    } else {
      errEl.textContent = translateError(result.message);
      errEl.style.display = 'block';
      btn.textContent = 'Entrar';
      btn.disabled = false;
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn   = document.getElementById('btnSignup');
    const errEl = document.getElementById('signupError');
    btn.textContent = 'Registrando...';
    btn.disabled = true;
    errEl.style.display = 'none';

    const fullName = document.getElementById('fullname').value.trim();
    const email    = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const result   = await signupUser(email, password, fullName);

    if (result.success) {
      if (result.needsConfirmation) {
        alert('✅ Registro exitoso. Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
        toggleSignup();
      } else {
        window.location.replace(window.location.href);
      }
    } else {
      errEl.textContent = translateError(result.message);
      errEl.style.display = 'block';
      btn.textContent = 'Registrarse';
      btn.disabled = false;
    }
  });
}

function translateError(message) {
  if (!message) return 'Error desconocido';
  if (message.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (message.includes('Email not confirmed'))       return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (message.includes('rate limit'))                return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (message.includes('already registered'))        return 'Este correo ya tiene una cuenta. Intenta iniciar sesión.';
  if (message.includes('invalid'))                   return 'Correo electrónico no válido.';
  if (message.includes('Password should be'))        return 'La contraseña debe tener al menos 6 caracteres.';
  return message;
}

function toggleSignup() {
  const login  = document.getElementById('loginForm');
  const signup = document.getElementById('signupForm');
  login.style.display  = login.style.display  === 'none' ? 'block' : 'none';
  signup.style.display = signup.style.display === 'none' ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', initAuth);