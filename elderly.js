// ═══════════════════════════════════════════════════════
// AGROMIND - APP LOGIC
// UI, clima, cultivos, chat IA, gráficas, alertas
// ═══════════════════════════════════════════════════════

let tempChart = null;
let rainChart = null;

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN DEL DASHBOARD
// ═══════════════════════════════════════════════════════

// Se llama desde supabase.js después de autenticar
async function initDashboard() {
  try {
    const profile = await loadUserProfile();
    if (profile) {
      const nameEl = document.getElementById('userName');
      if (nameEl) nameEl.textContent = profile.full_name || currentUser.email;
    }

    // Cargar todo en paralelo
    await Promise.all([
      refreshWeather(),
      renderCrops(),
      renderAlerts(),
      renderRecommendations(),
      loadChatHistory()
    ]);
  } catch (err) {
    console.error('Error iniciando dashboard:', err);
  }
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
// GRÁFICAS (Chart.js)
// ═══════════════════════════════════════════════════════

function renderCharts(daily) {
  if (!daily) return;

  const labels = daily.time.map(d => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric' });
  });

  // Destruir gráficas anteriores para evitar duplicados
  if (tempChart) tempChart.destroy();
  if (rainChart) rainChart.destroy();

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { font: { size: 11 } } },
      y: { ticks: { font: { size: 11 } } }
    }
  };

  // Temperatura
  const ctxTemp = document.getElementById('chartTemp');
  if (ctxTemp) {
    tempChart = new Chart(ctxTemp, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Máx °C',
            data: daily.temperature_2m_max,
            borderColor: '#e74c3c',
            backgroundColor: 'rgba(231,76,60,0.15)',
            fill: true,
            tension: 0.4,
            pointRadius: 4
          },
          {
            label: 'Mín °C',
            data: daily.temperature_2m_min,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52,152,219,0.10)',
            fill: true,
            tension: 0.4,
            pointRadius: 4
          }
        ]
      },
      options: { ...commonOptions, plugins: { legend: { display: true } } }
    });
  }

  // Lluvia
  const ctxRain = document.getElementById('chartRain');
  if (ctxRain) {
    rainChart = new Chart(ctxRain, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'mm',
          data: daily.precipitation_sum,
          backgroundColor: 'rgba(52,152,219,0.7)',
          borderColor: '#2980b9',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
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
    container.innerHTML = `
      <div class="empty-state">
        <span style="font-size:3rem">🌱</span>
        <p>No tienes cultivos registrados aún.</p>
        <p>Pulsa <strong>+ Añadir Cultivo</strong> para empezar.</p>
      </div>`;
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
      <button type="button" class="btn-secondary btn-small"
        onclick="confirmDeleteCrop('${crop.id}', '${crop.crop_name}')">
        Marcar cosechado
      </button>
    </div>
  `).join('');
}

function showAddCropForm() {
  // Limpiar el formulario
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

  // Validación
  if (!type) {
    showFormError(errEl, 'Selecciona un tipo de cultivo.');
    return;
  }
  if (!area || area <= 0) {
    showFormError(errEl, 'Ingresa un área válida mayor a 0.');
    return;
  }
  if (!date) {
    showFormError(errEl, 'Selecciona una fecha de siembra.');
    return;
  }

  const emojiMap = {
    soya: '🌱', maiz: '🌽', girasol: '🌻',
    arroz: '🌾', trigo: '🌾', frijol: '🫘', 'algodón': '☁️'
  };

  const result = await addUserCrop({
    name: type,
    emoji: emojiMap[type] || '🌱',
    area,
    plantingDate: date
  });

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
  if (ok) await renderCrops();
}

// ═══════════════════════════════════════════════════════
// ALERTAS DE PLAGAS
// ═══════════════════════════════════════════════════════

async function renderAlerts() {
  const container = document.getElementById('alertsContainer');
  if (!container) return;

  // Generar alertas basadas en el clima actual y los cultivos
  await generatePestAlerts();

  const alerts = await loadPestAlerts();

  if (!alerts.length) {
    container.innerHTML = `
      <div class="alert-card alert-ok">
        ✅ Sin alertas activas. Tus cultivos están en buen estado.
      </div>`;
    return;
  }

  container.innerHTML = alerts.slice(0, 5).map(a => `
    <div class="alert-card alert-${a.risk_level || 'bajo'}">
      <div class="alert-title">⚠️ ${a.pest_name}</div>
      <div class="alert-crop">Cultivo afectado: ${capitalize(a.crop_affected || 'General')}</div>
      <div class="alert-risk">Riesgo: <strong>${capitalize(a.risk_level || 'bajo')}</strong></div>
      <div class="alert-desc">${a.description || ''}</div>
      <div class="alert-action">💡 ${a.recommended_action || ''}</div>
    </div>
  `).join('');
}

async function generatePestAlerts() {
  if (!currentWeatherData || !userCrops.length) return;

  const temp  = currentWeatherData.current?.temperature_2m || 0;
  const humid = currentWeatherData.current?.relative_humidity_2m || 0;
  const rain  = currentWeatherData.current?.precipitation || 0;

  const newAlerts = [];

  for (const crop of userCrops) {
    // Roya (hongos) con alta humedad
    if (humid > 75 && rain > 5 && ['soya', 'trigo', 'maiz'].includes(crop.crop_name)) {
      newAlerts.push({
        name: 'Roya / Hongos',
        crop: crop.crop_name,
        level: humid > 85 ? 'alto' : 'moderado',
        score: Math.round(humid),
        description: `Humedad del ${humid}% favorece hongos y roya.`,
        action: 'Aplica fungicida preventivo. Revisa las hojas inferiores.'
      });
    }
    // Trips con calor y sequía
    if (temp > 30 && rain < 1 && ['soya', 'frijol', 'girasol'].includes(crop.crop_name)) {
      newAlerts.push({
        name: 'Trips / Ácaros',
        crop: crop.crop_name,
        level: temp > 35 ? 'alto' : 'moderado',
        score: Math.round(temp),
        description: `Temperatura de ${temp}°C y baja lluvia favorecen trips.`,
        action: 'Riega por la mañana temprano. Considera acaricida si hay daño visible.'
      });
    }
    // Langosta con calor moderado
    if (temp > 25 && temp < 35 && ['maiz', 'arroz', 'soya'].includes(crop.crop_name)) {
      newAlerts.push({
        name: 'Chinche / Langosta',
        crop: crop.crop_name,
        level: 'bajo',
        score: 30,
        description: 'Condiciones favorables para insectos en esta temporada.',
        action: 'Monitorea semanalmente. Aplica control biológico si supera el umbral.'
      });
    }
  }

  // Guardar solo si hay nuevas alertas
  for (const alert of newAlerts) {
    await addPestAlert(alert);
  }
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
    </div>
  `).join('');
}

async function generateGeneralRecommendations() {
  if (!currentWeatherData) return;

  const temp  = currentWeatherData.current?.temperature_2m || 0;
  const rain  = currentWeatherData.current?.precipitation || 0;
  const humid = currentWeatherData.current?.relative_humidity_2m || 0;

  const recs = [];

  if (rain > 10) {
    recs.push({
      type: 'riego', crop: null,
      title: '🌧️ Lluvia registrada — suspende el riego',
      description: `Cayeron ${rain}mm hoy. No riegues para evitar encharcamiento y pudrición de raíces.`,
      urgency: 'alto'
    });
  } else if (rain === 0 && temp > 28) {
    recs.push({
      type: 'riego', crop: null,
      title: '💧 Riego recomendado hoy',
      description: `Sin lluvia y ${temp}°C. Riega en la mañana temprano (6-8 AM) para reducir evaporación.`,
      urgency: 'alto'
    });
  }

  if (humid > 80) {
    recs.push({
      type: 'plagas', crop: null,
      title: '🍄 Alta humedad — revisa hongos',
      description: `${humid}% de humedad favorece enfermedades fúngicas. Inspecciona hojas y tallos.`,
      urgency: 'normal'
    });
  }

  if (temp > 35) {
    recs.push({
      type: 'temporal', crop: null,
      title: '🌡️ Calor extremo — protege tus cultivos',
      description: `${temp}°C puede quemar las plantas. Si es posible, cubre con malla sombra en las horas pico (11 AM - 3 PM).`,
      urgency: 'alto'
    });
  }

  for (const rec of recs) {
    await addRecommendation(rec);
  }
}

async function generateRecommendationsForCrop(cropName) {
  const cropRecs = {
    soya: {
      title: '🌱 Soya registrada — primeros pasos',
      description: 'Asegura buena humedad en germinación (primeras 2 semanas). Aplica inoculante de Rhizobium para fijar nitrógeno.',
      urgency: 'normal'
    },
    maiz: {
      title: '🌽 Maíz registrado — recomendación inicial',
      description: 'Siembra a 5 cm de profundidad. Fertiliza con NPK al momento de la siembra y a los 30 días.',
      urgency: 'normal'
    },
    girasol: {
      title: '🌻 Girasol registrado — cuida la orientación',
      description: 'El girasol sigue al sol. Siembra en hileras N-S para mejor exposición. Riega cada 5-7 días si no llueve.',
      urgency: 'normal'
    },
    arroz: {
      title: '🌾 Arroz registrado — manejo del agua',
      description: 'Mantén lámina de agua de 5-10 cm en fase de macollamiento. Controla malezas en los primeros 30 días.',
      urgency: 'normal'
    },
    frijol: {
      title: '🫘 Frijol registrado — evita el exceso de agua',
      description: 'El frijol es sensible al encharcamiento. Siembra en suelos bien drenados y riega moderadamente.',
      urgency: 'normal'
    }
  };

  const rec = cropRecs[cropName];
  if (rec) {
    await addRecommendation({ type: 'cultivo', crop: cropName, ...rec });
    await renderRecommendations();
  }
}

// ═══════════════════════════════════════════════════════
// CHAT / ASISTENTE IA
// ═══════════════════════════════════════════════════════

async function loadChatHistory() {
  const history = await getChatHistory(20);
  const box = document.getElementById('messagesBox');
  if (!box || !history.length) return;

  // Mantener el mensaje de bienvenida y agregar historial
  history.forEach(msg => {
    appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.content);
  });
  box.scrollTop = box.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text  = input?.value.trim();
  if (!text) return;

  input.value = '';
  appendMessage('user', text);
  await saveChatMessage('user', text);

  const typingId = appendTyping();

  try {
    const cropList    = userCrops.map(c => c.crop_name).join(', ') || 'ninguno registrado';
    const weatherInfo = currentWeatherData
      ? `Temperatura: ${currentWeatherData.current.temperature_2m}°C, Humedad: ${currentWeatherData.current.relative_humidity_2m}%, Lluvia: ${currentWeatherData.current.precipitation}mm`
      : 'sin datos de clima';

    // ✅ Llama a la Edge Function de Supabase (evita CORS)
    const { data, error } = await supabaseClient.functions.invoke('chat', {
      body: {
        message: text,
        cropList,
        weatherInfo,
        city: window.CITY || 'Santa Cruz de la Sierra'
      }
    });

    if (error) throw new Error(error.message);

    const reply = data?.reply || 'No pude procesar tu pregunta. Intenta de nuevo.';

    removeTyping(typingId);
    appendMessage('bot', reply);
    await saveChatMessage('assistant', reply);

  } catch (err) {
    console.error('Error en chat IA:', err);
    removeTyping(typingId);
    appendMessage('bot', '⚠️ Hubo un error al conectar con el asistente. Verifica tu conexión e intenta de nuevo.');
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

function appendTyping() {
  const box = document.getElementById('messagesBox');
  if (!box) return null;

  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'msg-bot msg-typing';
  div.textContent = '✍️ Escribiendo...';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeTyping(id) {
  if (id) document.getElementById(id)?.remove();
}

// ═══════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
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
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function showFormError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}