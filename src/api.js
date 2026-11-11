/**
 * Browser -> Google Apps Script Web App (cross-origin)
 * Via hidden POST form + Apps Script HtmlService postMessage.
 * Ini menghindari pembatasan CORS Google Apps Script ContentService.
 */
const API_URL = (import.meta.env.VITE_GAS_URL || '').trim();

// Periksa apakah URL Google Apps Script valid dan bukan placeholder
export const isConfigured =
  /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL) &&
  !API_URL.includes('PASTE_DEPLOYMENT_ID');

export function prizePoolRequest(action, fields = {}, password = '') {

  if (!isConfigured) {
    return Promise.reject(new Error('API Google Apps Script belum dikonfigurasi.'));
  }

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
    const payload = { action, ...fields, ...(password ? { password } : {}) };
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
      if (data.ok) resolve(data.data);
      else reject(new Error(data.error || 'Server menolak permintaan.'));
    }
    const timer = window.setTimeout(() => {
      if (completed) return;
      cleanUp();
      reject(new Error('Koneksi habis waktu. Periksa deployment Apps Script, akses Anyone, dan pengaturan domain GitHub Pages.'));
    }, 30000);

    window.addEventListener('message', handleMessage);
    document.body.append(iframe, form);
    try {
      form.submit();
    } catch (err) {
      cleanUp();
      reject(err);
    }
  });
}

export function participantUrl(token) {
  const url = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
  url.searchParams.set('qr', token);
  return url.toString();
}
