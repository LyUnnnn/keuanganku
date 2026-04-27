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
  
  // Setup event listeners AFTER components are loaded
  setupComponentListeners();
  
  if (typeof initApp  === 'function') initApp();
  if (typeof initAuth === 'function') initAuth();
}

// Event delegation for dynamically loaded components
function setupComponentListeners() {
  // Panel-history: filter chips
  document.addEventListener('click', (e) => {
    const filterChip = e.target.closest('[data-filter]');
    if (filterChip && e.target.closest('#panel-history')) {
      const filterValue = filterChip.getAttribute('data-filter');
      if (typeof filterHistory === 'function') {
        filterHistory(filterValue, filterChip);
      }
    }
  });

  // Panel-input: jenis selector buttons
  document.addEventListener('click', (e) => {
    const jenisBtn = e.target.closest('.jenis-btn');
    if (jenisBtn && e.target.closest('#panel-input')) {
      const jenisVal = jenisBtn.getAttribute('data-val');
      if (typeof selectJenis === 'function') {
        selectJenis(jenisVal, jenisBtn);
      }
    }
  });

  // Form submissions
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'form-transaksi' && typeof submitForm === 'function') {
      submitForm(e);
    }
  });

  // Number input changes (nominal display)
  document.addEventListener('input', (e) => {
    if (e.target.id === 'nominal' && typeof updateNominalDisplay === 'function') {
      updateNominalDisplay(e.target);
    }
  });

  // Select changes (kategori -> kelompok update)
  document.addEventListener('change', (e) => {
    if (e.target.id === 'kategori' && typeof updateKelompok === 'function') {
      updateKelompok(e.target.value);
    }
  });
}

// Setup event listeners for static UI interactions
function setupEventListeners() {
  // Overlay click to close sidebar
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Navigation items
  const navItems = document.querySelectorAll('.nav-item[data-panel]');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const panelName = item.getAttribute('data-panel');
      if (panelName && typeof showPanel === 'function') {
        showPanel(panelName);
      }
    });
  });

  // Hamburger menu
  const hamburger = document.querySelector('.hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      if (typeof toggleSidebar === 'function') {
        toggleSidebar();
      }
    });
  }

  // Top bar buttons
  const exportBtn = document.querySelector('[data-action="export"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (typeof exportCSV === 'function') {
        exportCSV();
      }
    });
  }

  const settingsBtn = document.querySelector('[data-action="settings"]');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (typeof showPanel === 'function') {
        showPanel('settings');
      }
    });
  }

  const installBtn = document.getElementById('btn-install');
  if (installBtn) {
    installBtn.addEventListener('click', () => {
      if (typeof installApp === 'function') {
        installApp();
      }
    });
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
