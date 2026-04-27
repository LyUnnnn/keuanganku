// ─── init.js — Application initialization ──────────────────────
// Handles component loading and event listeners for main app

// Load dynamic component HTML into panels
async function loadComponents() {
  const panels = [
    { id: 'panel-input',    src: './components/panel-input.html' },
    { id: 'panel-saldo',    src: './components/panel-saldo.html' },
    { id: 'panel-history',  src: './components/panel-history.html' },
    { id: 'panel-settings', src: './components/panel-settings.html' },
    { id: 'panel-about',    src: './components/panel-about.html' },
  ];
  await Promise.all(panels.map(async ({ id, src }) => {
    try {
      const res  = await fetch(src);
      const html = await res.text();
      document.getElementById(id).innerHTML = html;
    } catch (err) {
      console.warn('Gagal memuat komponen:', src, err);
    }
  }));
  if (typeof initApp  === 'function') initApp();
  if (typeof initAuth === 'function') initAuth();
}

// Setup event listeners for UI interactions
function setupEventListeners() {
  // Overlay click to close sidebar
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Navigation items
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const panelName = item.getAttribute('data-panel');
      if (panelName) showPanel(panelName);
    });
  });

  // Hamburger menu
  const hamburger = document.querySelector('.hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', toggleSidebar);
  }

  // Top bar buttons
  const exportBtn = document.querySelector('[data-action="export"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportCSV);
  }

  const settingsBtn = document.querySelector('[data-action="settings"]');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => showPanel('settings'));
  }

  const installBtn = document.getElementById('btn-install');
  if (installBtn) {
    installBtn.addEventListener('click', installApp);
  }
}

// Service Worker registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      console.warn('Service Worker registration failed');
    });
  }
}

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  await loadComponents();
  setupEventListeners();
  registerServiceWorker();
});
