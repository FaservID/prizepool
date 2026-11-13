/**
 * Browser -> Google Apps Script Web App (cross-origin)
 * Via hidden POST form + Apps Script HtmlService postMessage.
 * Ini menghindari pembatasan CORS Google Apps Script ContentService.
 */
const API_URL = (import.meta.env?.VITE_GAS_URL || '').trim();

// Periksa apakah URL Google Apps Script valid dan bukan placeholder
export const isConfigured =
  /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL) &&
  !API_URL.includes('PASTE_DEPLOYMENT_ID');

export async function prizePoolRequest(action, fields = {}, password = '') {
  if (!isConfigured) throw new Error('API Google Apps Script belum dikonfigurasi.');
  const canRetry = action === 'verify' || action === 'publicInfo';
  const attempts = canRetry ? 4 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (canRetry) {
      const delay = attempt === 0 ? Math.random() * 1500 : 1000 * 2 ** (attempt - 1) * (1 + Math.random());
      await new Promise(resolve => window.setTimeout(resolve, delay));
    }
    const response = await requestOnce(action, fields, password, canRetry ? 15000 : 30000);
    if (response.ok) return response.data;
    if (!canRetry || response.retryable !== true || attempt === attempts - 1) {
      throw new Error(response.error || 'Server menolak permintaan.');
    }
  }
}

function requestOnce(action, fields, password, timeout) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const iframe = document.createElement('iframe');
    iframe.name = `pp_${requestId.replaceAll('-', '')}`;
    iframe.title = 'Koneksi Google Sheets';
    iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;';
    iframe.setAttribute('aria-hidden', 'true');

    const form = document.createElement('form');
    form.action = API_URL;
    form.method = 'POST';
    form.target = iframe.name;
    form.acceptCharset = 'UTF-8';
    form.style.display = 'none';
    // Action tetap milik pemanggil; mutasi admin tidak boleh masuk jalur retry publik.
    const payload = { ...fields, action, ...(password ? { password } : {}) };
    const formValues = {
      requestId,
      origin: window.location.origin,
      payload: JSON.stringify(payload),
    };
    for (const [name, value] of Object.entries(formValues)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    let completed = false;
    function cleanUp() {
      completed = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      form.remove();
      iframe.remove();
    }
    function handleMessage(evt) {
      const data = evt.data;
      if (!data || data.type !== 'NBSA_PRIZEPOOL_RESULT' || data.requestId !== requestId || completed) return;
      if (evt.origin !== 'null' && !/^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)$/i.test(evt.origin)) return;
      cleanUp();
      resolve(data);
    }
    const timer = window.setTimeout(() => {
      if (completed) return;
      cleanUp();
      resolve({ ok: false, retryable: true,
        error: 'Koneksi habis waktu. Periksa deployment Apps Script, akses Anyone, dan pengaturan domain GitHub Pages.' });
    }, timeout);

    window.addEventListener('message', handleMessage);
    try {
      document.body.append(iframe, form);
      form.submit();
    } catch (err) {
      cleanUp();
      reject(err);
    }
  });
}

export function participantUrl() {
  const url = new URL(import.meta.env?.BASE_URL || '/', window.location.origin);
  return url.toString();
}
