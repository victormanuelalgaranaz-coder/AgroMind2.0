// ═══════════════════════════════════════════════════════
// AGROMIND - APP LOGIC
// ═══════════════════════════════════════════════════════

let tempChart    = null;
let rainChart    = null;
let map          = null;
let mapMarker    = null;
let mapCropMarkers = {};

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN DEL DASHBOARD
// ═══════════════════════════════════════════════════════

async function initDashboard() {
  try {
    const profile = await loadUserProfile();
    if (profile) {
      const displayName = profile.full_name || currentUser.email.split('@')[0];

      // Navbar escritorio
      const nameEl = document.getElementById('userName');
      if (nameEl) nameEl.textContent = displayName;

      // Menú lateral móvil
      const sideNameEl = document.getElementById('sideMenuUserName');
      if (sideNameEl) sideNameEl.textContent = displayName;

      // Banner héroe personalizado
      const heroWelcome = document.getElementById('heroWelcome');
      if (heroWelcome) heroWelcome.textContent = `👋 ¡Hola, ${displayName.split(' ')[0]}!`;
    }

    initMap(window.LAT, window.LON);

    await Promise.all([
      refreshWeather(),
      renderCrops(),
      renderAlerts(),
      renderRecommendations(),
      loadChatHistory()
    ]);

    try { showAiRecommendation(); } catch (e) { console.warn('AI rec error', e); }
  } catch (err) {
    console.error('Error iniciando dashboard:', err);
  }
}

// ═══════════════════════════════════════════════════════
// MENÚ LATERAL
// ═══════════════════════════════════════════════════════

function toggleSideMenu() {
  const menu    = document.getElementById('sideMenu');
  const overlay = document.getElementById('menuOverlay');
  if (!menu || !overlay) return;
  const isOpen = menu.classList.contains('open');
  if (isOpen) { menu.classList.remove('open'); overlay.classList.remove('open'); }
  else         { menu.classList.add('open');    overlay.classList.add('open');    }
}

function closeSideMenu() {
  document.getElementById('sideMenu')?.classList.remove('open');
  document.getElementById('menuOverlay')?.classList.remove('open');
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
}

// ═══════════════════════════════════════════════════════
// BANNER IA — TIPS ROTATIVOS
// ═══════════════════════════════════════════════════════

const AI_TIPS = [
  null, // placeholder para tip climático dinámico
  '🌱 Registra tus cultivos para recibir alertas y recomendaciones personalizadas.',
  '📷 ¿Ves algo raro en tus plantas? Toma una foto y mándala al asistente para analizarla.',
  '🪱 La salud del suelo es la base de una buena cosecha. Rota tus cultivos cada temporada.',
  '💧 El riego por goteo ahorra hasta un 50% de agua frente al riego superficial.',
  '🌻 Plantar girasoles cerca de tus cultivos atrae polinizadores naturales.',
  '🐛 Revisa el envés de las hojas semanalmente para detectar plagas a tiempo.',
  '🌡️ Las heladas tardías pueden arruinar la floración. Monitorea el pronóstico diariamente.',
  '🧪 Un análisis de suelo al año te ayuda a fertilizar con precisión y ahorrar costos.',
  '📅 Lleva un registro de fechas de siembra y cosecha para mejorar cada campaña.',
  '🌧️ Aprovecha el agua de lluvia con pequeñas represas o cisternas en tu terreno.',
  '🔄 La rotación de cultivos previene enfermedades y mejora la fertilidad del suelo.',
];

let tipIndex = 0;

function showAiRecommendation() {
  const banner = document.getElementById('aiRecommendationBanner');
  const msgEl  = document.getElementById('recommendationMessage');
  if (!banner || !msgEl) return;

  // Generar tip climático dinámico
  const city = window.CITY || 'tu zona';
  if (currentWeatherData && currentWeatherData.current) {
    const rain  = currentWeatherData.current.precipitation          || 0;
    const temp  = currentWeatherData.current.temperature_2m          || 0;
    const humid = currentWeatherData.current.relative_humidity_2m   || 0;
    if (rain > 5)       AI_TIPS[0] = `🌧️ En ${city}: Lluvia intensa. Suspende el riego y revisa desagües.`;
    else if (rain > 2)  AI_TIPS[0] = `🌦️ En ${city}: Probable lluvia. Evita aplicar agroquímicos hoy.`;
    else if (temp >= 35)AI_TIPS[0] = `🌡️ En ${city}: Calor extremo (${Math.round(temp)}°C). Riega antes de las 8 AM.`;
    else if (temp >= 32)AI_TIPS[0] = `☀️ En ${city}: Temperaturas altas. Riega temprano en la mañana.`;
    else if (humid > 85)AI_TIPS[0] = `💧 En ${city}: Alta humedad (${Math.round(humid)}%). Revisa signos de hongos.`;
    else                AI_TIPS[0] = `🌿 En ${city}: Condiciones estables. Buen momento para inspeccionar cultivos.`;
  } else {
    AI_TIPS[0] = `💬 Revisaré el clima y te daré un consejo personalizado al cargar los datos.`;
  }

  const tips    = AI_TIPS.filter(Boolean);
  const message = tips[tipIndex % tips.length];
  tipIndex++;

  msgEl.textContent = message;
  banner.style.display = 'block';
  sessionStorage.setItem('aiRecommendationShown', '1');
  setTimeout(() => { try { banner.style.display = 'none'; } catch(e){} }, 14000);
}

// Rotar un nuevo tip cada 45 segundos
setInterval(() => {
  const banner = document.getElementById('aiRecommendationBanner');
  const msgEl  = document.getElementById('recommendationMessage');
  if (!banner || !msgEl) return;
  if (banner.style.display !== 'none') return;
  const tips = AI_TIPS.filter(Boolean);
  if (!tips.length) return;
  msgEl.textContent = tips[tipIndex % tips.length];
  tipIndex++;
  banner.style.display = 'block';
  setTimeout(() => { try { banner.style.display = 'none'; } catch(e){} }, 10000);
}, 45000);

function closeAiRecommendation() {
  const banner = document.getElementById('aiRecommendationBanner');
  if (banner) banner.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// MAPA
// ═══════════════════════════════════════════════════════

function initMap(lat = -17.7863, lon = -63.1812) {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  const initialLat = lat || window.LAT || -17.7863;
  const initialLon = lon || window.LON || -63.1812;

  if (!map) {
    map = L.map('map', { zoomControl: true, attributionControl: true })
      .setView([initialLat, initialLon], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(map);
  }

  updateMapLocation(initialLat, initialLon, window.CITY || 'Santa Cruz de la Sierra');
  loadCropMarkersOnMap();

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        if (latitude && longitude) {
          window.LAT = latitude; window.LON = longitude; window.CITY = 'Tu ubicación';
          updateMapLocation(latitude, longitude, window.CITY);
          refreshWeather();
        }
      },
      () => {},
      { timeout: 9000 }
    );
  }
}

function updateMapLocation(lat, lon, label = null) {
  if (!map) return;
  const cityLabel = label || window.CITY || 'Santa Cruz de la Sierra';
  map.setView([lat, lon], 10, { animate: true });

  if (!mapMarker) {
    mapMarker = L.marker([lat, lon], {
      icon: L.icon({
        iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl:  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize:   [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
      })
    }).addTo(map);
  } else {
    mapMarker.setLatLng([lat, lon]);
  }

  mapMarker.bindPopup(`<strong>${cityLabel}</strong><br>Tu ubicación actual`);
  const info = document.getElementById('locationInfo');
  if (info) info.textContent = `📍 ${cityLabel}`;
}

function loadCropMarkersOnMap() {
  if (!map || !userCrops || !userCrops.length) return;
  Object.values(mapCropMarkers).forEach(m => map.removeLayer(m));
  mapCropMarkers = {};

  userCrops.forEach(crop => {
    const marker = L.marker([window.LAT || -17.7863, window.LON || -63.1812], {
      icon: L.divIcon({ html: `<span style="font-size:24px">${crop.crop_emoji || '🌱'}</span>`, iconSize: [32,32], popupAnchor: [0,-16] })
    }).addTo(map);
    marker.bindPopup(
      `<strong>${capitalize(crop.crop_name)}</strong><br>📐 ${crop.area_hectares} hectáreas<br><small>Siembra: ${formatDate(crop.planting_date)}</small>`
    );
    mapCropMarkers[crop.id] = marker;
  });
}

// ═══════════════════════════════════════════════════════
// CLIMA
// ═══════════════════════════════════════════════════════

async function refreshWeather() {
  try {
    document.getElementById('weatherDesc').textContent = 'Actualizando...';
    const data = await fetchAndSaveWeather();
    if (!data) return;
    const c = data.current;
    document.getElementById('tempDisplay').textContent     = `${Math.round(c.temperature_2m)}°C`;
    document.getElementById('humidityDisplay').textContent = `${Math.round(c.relative_humidity_2m)}%`;
    document.getElementById('rainDisplay').textContent     = `${c.precipitation} mm`;
    document.getElementById('weatherDesc').textContent     = getWeatherDescription(c.weather_code);
    document.getElementById('weatherIcon').textContent     = getWeatherEmoji(c.weather_code);
    renderCharts(data.daily);
  } catch (err) {
    console.error('Error refreshWeather:', err);
    document.getElementById('weatherDesc').textContent = 'Error al cargar clima';
  }
}

function getWeatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 2)  return '⛅';
  if (code <= 3)  return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 65) return '🌧️';
  if (code <= 75) return '❄️';
  if (code <= 82) return '🌩️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

// ═══════════════════════════════════════════════════════
// GRÁFICAS
// ═══════════════════════════════════════════════════════

function renderCharts(daily) {
  if (!daily) return;
  const labels = daily.time.map(d => new Date(d + 'T00:00:00').toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric' }));

  if (tempChart) tempChart.destroy();
  if (rainChart) rainChart.destroy();

  const commonOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 } } } }
  };

  const ctxTemp = document.getElementById('chartTemp');
  if (ctxTemp) {
    tempChart = new Chart(ctxTemp, {
      type: 'line',
      data: { labels, datasets: [
        { label:'Máx °C', data: daily.temperature_2m_max, borderColor:'#e74c3c', backgroundColor:'rgba(231,76,60,0.15)', fill:true, tension:0.4, pointRadius:4 },
        { label:'Mín °C', data: daily.temperature_2m_min, borderColor:'#3498db', backgroundColor:'rgba(52,152,219,0.10)', fill:true, tension:0.4, pointRadius:4 }
      ]},
      options: { ...commonOptions, plugins: { legend: { display: true } } }
    });
  }

  const ctxRain = document.getElementById('chartRain');
  if (ctxRain) {
    rainChart = new Chart(ctxRain, {
      type: 'bar',
      data: { labels, datasets: [{ label:'mm', data: daily.precipitation_sum, backgroundColor:'rgba(52,152,219,0.7)', borderColor:'#2980b9', borderWidth:1, borderRadius:4 }] },
      options: commonOptions
    });
  }
}

// ═══════════════════════════════════════════════════════
// CULTIVOS
// ═══════════════════════════════════════════════════════

async function renderCrops() {
  const container = document.getElementById('cropsContainer');
  if (!container) return;
  container.innerHTML = '<p class="loading-text">Cargando cultivos...</p>';

  const crops = await loadUserCrops();
  if (!crops.length) {
    container.innerHTML = `<div class="empty-state"><span style="font-size:3rem">🌱</span><p>No tienes cultivos registrados aún.</p><p>Pulsa <strong>+ Añadir Cultivo</strong> para empezar.</p></div>`;
    return;
  }

  container.innerHTML = crops.map(crop => `
    <div class="crop-card">
      <div class="crop-header">
        <span class="crop-emoji">${crop.crop_emoji || '🌱'}</span>
        <span class="crop-name">${capitalize(crop.crop_name)}</span>
      </div>
      <div class="crop-detail">📐 ${crop.area_hectares ?? '--'} hectáreas</div>
      <div class="crop-detail">📅 Siembra: ${formatDate(crop.planting_date)}</div>
      <button type="button" class="btn-secondary btn-small" onclick="confirmDeleteCrop('${crop.id}', '${crop.crop_name}')">Marcar cosechado</button>
    </div>`).join('');
}

function showAddCropForm() {
  document.getElementById('cropType').value = '';
  document.getElementById('cropArea').value = '';
  document.getElementById('cropDate').value = '';
  const errEl = document.getElementById('cropFormError');
  if (errEl) errEl.style.display = 'none';
  openModal('modalAddCrop');
}

async function saveCrop() {
  const errEl = document.getElementById('cropFormError');
  const type  = document.getElementById('cropType').value;
  const area  = parseFloat(document.getElementById('cropArea').value);
  const date  = document.getElementById('cropDate').value;

  if (!type)         { showFormError(errEl, 'Selecciona un tipo de cultivo.');       return; }
  if (!area || area<=0){ showFormError(errEl, 'Ingresa un área válida mayor a 0.');  return; }
  if (!date)         { showFormError(errEl, 'Selecciona una fecha de siembra.');      return; }

  const emojiMap = { soya:'🌱', maiz:'🌽', girasol:'🌻', arroz:'🌾', trigo:'🌾', frijol:'🫘', 'algodón':'☁️' };
  const result = await addUserCrop({ name: type, emoji: emojiMap[type] || '🌱', area, plantingDate: date });

  if (result) {
    closeModal('modalAddCrop');
    await renderCrops();
    await generateRecommendationsForCrop(type);
  } else {
    showFormError(errEl, 'Error al guardar. Intenta de nuevo.');
  }
}

async function confirmDeleteCrop(cropId, cropName) {
  if (!confirm(`¿Marcar "${capitalize(cropName)}" como cosechado?`)) return;
  const ok = await deleteUserCrop(cropId);
  if (ok) { await renderCrops(); loadCropMarkersOnMap(); }
}

// ═══════════════════════════════════════════════════════
// ALERTAS DE PLAGAS
// ═══════════════════════════════════════════════════════

async function renderAlerts() {
  const container = document.getElementById('alertsContainer');
  if (!container) return;
  await generatePestAlerts();
  const alerts = await loadPestAlerts();

  if (!alerts.length) {
    container.innerHTML = `<div class="alert-card alert-ok">✅ Sin alertas activas. Tus cultivos están en buen estado.</div>`;
    return;
  }
  container.innerHTML = alerts.slice(0, 5).map(a => `
    <div class="alert-card alert-${a.risk_level || 'bajo'}">
      <div class="alert-title">⚠️ ${a.pest_name}</div>
      <div class="alert-crop">Cultivo afectado: ${capitalize(a.crop_affected || 'General')}</div>
      <div class="alert-risk">Riesgo: <strong>${capitalize(a.risk_level || 'bajo')}</strong></div>
      <div class="alert-desc">${a.description || ''}</div>
      <div class="alert-action">💡 ${a.recommended_action || ''}</div>
    </div>`).join('');
}

async function generatePestAlerts() {
  if (!currentWeatherData || !userCrops.length) return;
  const temp  = currentWeatherData.current?.temperature_2m          || 0;
  const humid = currentWeatherData.current?.relative_humidity_2m   || 0;
  const rain  = currentWeatherData.current?.precipitation            || 0;
  const newAlerts = [];

  for (const crop of userCrops) {
    if (humid > 75 && rain > 5 && ['soya','trigo','maiz'].includes(crop.crop_name))
      newAlerts.push({ name:'Roya / Hongos', crop: crop.crop_name, level: humid>85?'alto':'moderado', score: Math.round(humid), description:`Humedad del ${humid}% favorece hongos y roya.`, action:'Aplica fungicida preventivo. Revisa las hojas inferiores.' });
    if (temp > 30 && rain < 1 && ['soya','frijol','girasol'].includes(crop.crop_name))
      newAlerts.push({ name:'Trips / Ácaros', crop: crop.crop_name, level: temp>35?'alto':'moderado', score: Math.round(temp), description:`Temperatura de ${temp}°C y baja lluvia favorecen trips.`, action:'Riega por la mañana temprano. Considera acaricida si hay daño visible.' });
    if (temp > 25 && temp < 35 && ['maiz','arroz','soya'].includes(crop.crop_name))
      newAlerts.push({ name:'Chinche / Langosta', crop: crop.crop_name, level:'bajo', score:30, description:'Condiciones favorables para insectos en esta temporada.', action:'Monitorea semanalmente. Aplica control biológico si supera el umbral.' });
  }
  for (const alert of newAlerts) await addPestAlert(alert);
}

// ═══════════════════════════════════════════════════════
// RECOMENDACIONES
// ═══════════════════════════════════════════════════════

async function renderRecommendations() {
  const container = document.getElementById('recommendationsContainer');
  if (!container) return;
  await generateGeneralRecommendations();
  const recs = await getRecommendations();

  if (!recs.length) {
    container.innerHTML = `<p class="loading-text">No hay recomendaciones aún.</p>`;
    return;
  }
  container.innerHTML = recs.slice(0, 6).map(r => `
    <div class="rec-card rec-${r.urgency || 'normal'}">
      <div class="rec-title">${r.title}</div>
      ${r.crop_name ? `<div class="rec-crop">🌱 ${capitalize(r.crop_name)}</div>` : ''}
      <div class="rec-desc">${r.description || ''}</div>
    </div>`).join('');
}

async function generateGeneralRecommendations() {
  if (!currentWeatherData) return;
  const temp  = currentWeatherData.current?.temperature_2m        || 0;
  const rain  = currentWeatherData.current?.precipitation          || 0;
  const humid = currentWeatherData.current?.relative_humidity_2m  || 0;
  const recs  = [];

  if (rain > 10)
    recs.push({ type:'riego', crop:null, title:'🌧️ Lluvia registrada — suspende el riego', description:`Cayeron ${rain}mm hoy. No riegues para evitar encharcamiento y pudrición de raíces.`, urgency:'alto' });
  else if (rain === 0 && temp > 28)
    recs.push({ type:'riego', crop:null, title:'💧 Riego recomendado hoy', description:`Sin lluvia y ${temp}°C. Riega en la mañana temprano (6-8 AM) para reducir evaporación.`, urgency:'alto' });

  if (humid > 80)
    recs.push({ type:'plagas', crop:null, title:'🍄 Alta humedad — revisa hongos', description:`${humid}% de humedad favorece enfermedades fúngicas. Inspecciona hojas y tallos.`, urgency:'normal' });

  if (temp > 35)
    recs.push({ type:'temporal', crop:null, title:'🌡️ Calor extremo — protege tus cultivos', description:`${temp}°C puede quemar las plantas. Cubre con malla sombra en las horas pico (11 AM - 3 PM).`, urgency:'alto' });

  for (const rec of recs) await addRecommendation(rec);
}

async function generateRecommendationsForCrop(cropName) {
  const cropRecs = {
    soya:   { title:'🌱 Soya registrada — primeros pasos',           description:'Asegura buena humedad en germinación (primeras 2 semanas). Aplica inoculante de Rhizobium para fijar nitrógeno.', urgency:'normal' },
    maiz:   { title:'🌽 Maíz registrado — recomendación inicial',    description:'Siembra a 5 cm de profundidad. Fertiliza con NPK al momento de la siembra y a los 30 días.', urgency:'normal' },
    girasol:{ title:'🌻 Girasol registrado — cuida la orientación',  description:'El girasol sigue al sol. Siembra en hileras N-S para mejor exposición. Riega cada 5-7 días si no llueve.', urgency:'normal' },
    arroz:  { title:'🌾 Arroz registrado — manejo del agua',         description:'Mantén lámina de agua de 5-10 cm en fase de macollamiento. Controla malezas en los primeros 30 días.', urgency:'normal' },
    frijol: { title:'🫘 Frijol registrado — evita el exceso de agua',description:'El frijol es sensible al encharcamiento. Siembra en suelos bien drenados y riega moderadamente.', urgency:'normal' },
  };
  const rec = cropRecs[cropName];
  if (rec) {
    await addRecommendation({ type:'cultivo', crop: cropName, ...rec });
    await renderRecommendations();
  }
}

// ═══════════════════════════════════════════════════════
// CHAT / ASISTENTE IA — con soporte de imágenes
// ═══════════════════════════════════════════════════════

async function loadChatHistory() {
  const history = await getChatHistory(20);
  const box = document.getElementById('messagesBox');
  if (!box || !history.length) return;
  history.forEach(msg => appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.content));
  box.scrollTop = box.scrollHeight;
}

// ── Variables para imagen adjunta ──
let attachedImageBase64 = null;
let attachedImageMime   = 'image/jpeg';

function handleImageSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 4 * 1024 * 1024) {
    alert('La imagen es muy grande. Usa una imagen menor a 4 MB.');
    event.target.value = '';
    return;
  }

  attachedImageMime = file.type || 'image/jpeg';

  const reader = new FileReader();
  reader.onload = (e) => {
    attachedImageBase64 = e.target.result.split(',')[1];
    const preview     = document.getElementById('imagePreview');
    const previewName = document.getElementById('imagePreviewName');
    const previewArea = document.getElementById('imagePreviewArea');
    if (preview)     preview.src        = e.target.result;
    if (previewName) previewName.textContent = file.name;
    if (previewArea) previewArea.style.display = 'flex';
    document.getElementById('chatInput')?.focus();
  };
  reader.readAsDataURL(file);
}

function removeAttachedImage() {
  attachedImageBase64 = null;
  attachedImageMime   = 'image/jpeg';
  const previewArea = document.getElementById('imagePreviewArea');
  if (previewArea) previewArea.style.display = 'none';
  const imgInput = document.getElementById('imageInput');
  if (imgInput) imgInput.value = '';
}
async function sendChatMessage() {
  const input    = document.getElementById('chatInput');
  const text     = input?.value.trim();
  const hasImage = !!attachedImageBase64;

  if (!text && !hasImage) return;

  const userText = text || '📷 (imagen adjunta para análisis)';
  input.value = '';
  appendMessage('user', userText);
  if (hasImage) appendImageMessage('user', `data:${attachedImageMime};base64,${attachedImageBase64}`);
  await saveChatMessage('user', userText);

  const typingId  = appendTyping();
  const imageB64  = attachedImageBase64;
  const imageMime = attachedImageMime;
  removeAttachedImage();

  try {
    const cropList    = userCrops.map(c => c.crop_name).join(', ') || 'ninguno registrado';
    const weatherInfo = currentWeatherData
      ? `Temperatura: ${currentWeatherData.current.temperature_2m}°C, Humedad: ${currentWeatherData.current.relative_humidity_2m}%, Lluvia: ${currentWeatherData.current.precipitation}mm`
      : 'sin datos de clima';

    const body = {
      message:     text || 'Analiza esta imagen de mi cultivo y dime qué observas.',
      cropList,
      weatherInfo,
      city: window.CITY || 'Santa Cruz de la Sierra'
    };
    if (imageB64) { body.imageBase64 = imageB64; body.imageMime = imageMime; }

    // ── Llamada directa con fetch en lugar de supabaseClient.functions.invoke ──
    // Esto funciona en localhost y en producción por igual, y muestra errores reales.
    const { data: { session } } = await supabaseClient.auth.getSession();
    const accessToken = session?.access_token || '';

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey':        SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      }
    );

    // Leer respuesta siempre como texto primero para capturar errores HTML/vacíos
    const rawText = await response.text();

    if (!response.ok) {
      console.error('Edge Function HTTP error:', response.status, rawText);
      throw new Error(`Error ${response.status}: ${rawText || 'Sin respuesta del servidor'}`);
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Respuesta inválida del servidor: ${rawText}`);
    }

    if (data.error) throw new Error(data.error);

    const reply = data?.reply || 'No pude procesar tu pregunta. Intenta de nuevo.';
    removeTyping(typingId);
    appendMessage('bot', reply);
    await saveChatMessage('assistant', reply);

  } catch (err) {
    console.error('Error en chat IA:', err);
    removeTyping(typingId);
    // Muestra el error real en el chat para que puedas diagnosticar
    appendMessage('bot', `⚠️ Error: ${err.message}`);
  }
}
function appendMessage(role, text) {
  const box = document.getElementById('messagesBox');
  if (!box) return;
  const div = document.createElement('div');
  div.className = role === 'user' ? 'msg-user' : 'msg-bot';
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function appendImageMessage(role, src) {
  const box = document.getElementById('messagesBox');
  if (!box) return;
  const wrapper = document.createElement('div');
  wrapper.className = role === 'user' ? 'msg-user' : 'msg-bot';
  wrapper.style.padding = '6px';
  const img = document.createElement('img');
  img.src = src; img.className = 'msg-image'; img.alt = 'Imagen adjunta';
  wrapper.appendChild(img);
  box.appendChild(wrapper);
  box.scrollTop = box.scrollHeight;
}

function appendTyping() {
  const box = document.getElementById('messagesBox');
  if (!box) return null;
  const id  = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id; div.className = 'msg-bot msg-typing';
  div.textContent = '✍️ Escribiendo...';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeTyping(id) {
  if (id) document.getElementById(id)?.remove();
}

function quickAsk(question) {
  const input = document.getElementById('chatInput');
  if (input) input.value = question;
  sendChatMessage();
}

// ═══════════════════════════════════════════════════════
// ASISTENTE FLOTANTE
// ═══════════════════════════════════════════════════════

let assistantOpen = false;
let bubbleTimer   = null;

function toggleAssistant() {
  assistantOpen = !assistantOpen;
  document.getElementById('assistantPanel')?.classList.toggle('open',   assistantOpen);
  document.getElementById('assistantOverlay')?.classList.toggle('open', assistantOpen);
  document.getElementById('assistantFab')?.classList.toggle('open',     assistantOpen);

  if (assistantOpen) {
    hideAssistantBubble();
    setTimeout(() => {
      document.getElementById('chatInput')?.focus();
      const box = document.getElementById('messagesBox');
      if (box) box.scrollTop = box.scrollHeight;
    }, 350);
  }
}

function showAssistantBubble() {
  if (assistantOpen) return;
  const bubble = document.getElementById('assistantBubble');
  if (!bubble) return;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideAssistantBubble, 6000);
}

function hideAssistantBubble(e) {
  if (e) e.stopPropagation();
  document.getElementById('assistantBubble')?.classList.remove('show');
}

setTimeout(showAssistantBubble, 4000);
setInterval(showAssistantBubble, 18000);

// ═══════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-BO', { day:'numeric', month:'long', year:'numeric' });
}

function showFormError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
