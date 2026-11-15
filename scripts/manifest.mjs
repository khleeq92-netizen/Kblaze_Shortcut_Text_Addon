// Generates the extension manifest for a given browser target.
// Chrome (MV3 service worker) is the primary target; Firefox uses MV3 background scripts.
export function buildManifest({ target = 'chrome', version, key }) {
  const manifest = {
    manifest_version: 3,
    name: 'QuickText Hub',
    short_name: 'QuickText Hub',
    version,
    description:
      'Smart text expansion, dynamic templates, data hub and user-approved browser workflows.',
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    action: {
      default_title: 'QuickText Hub',
      default_popup: 'popup/index.html',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' },
    },
    options_page: 'dashboard/index.html',
    // Minimum permissions:
    //  storage      - settings + change notifications (chrome.storage.local, namespaced "qth.")
    //  contextMenus - right-click "Insert QuickText snippet" in editable fields
    //  identity     - Google Sign-In through launchWebAuthFlow (only used if cloud is configured)
    //  scripting    - activate expansion in tabs that were already open at install/update time
    //  sidePanel    - QuickText side panel (Chrome 114+)
    permissions: ['storage', 'contextMenus', 'identity', 'scripting', ...(target === 'chrome' ? ['sidePanel'] : [])],
    // Content script must run on pages where the user types; it never reads page content
    // except the few characters before the caret inside the focused editable field.
    host_permissions: ['<all_urls>'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_idle',
        all_frames: true,
        match_about_blank: true,
      },
    ],
    web_accessible_resources: [
      {
        resources: ['overlay/index.html', 'assets/*', 'chunks/*'],
        matches: ['<all_urls>'],
        ...(target === 'chrome' ? { use_dynamic_url: true } : {}),
      },
    ],
    commands: {
      'open-side-panel': {
        suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
        description: 'Open the QuickText side panel',
      },
      'open-assistant': {
        suggested_key: { default: 'Alt+Shift+Q', mac: 'Alt+Shift+Q' },
        description: 'Open the QuickText snippet assistant in the focused field',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };
  if (target === 'firefox') {
    manifest.background = { scripts: ['background.js'], type: 'module' };
    manifest.sidebar_action = { default_panel: 'sidepanel/index.html', default_title: 'QuickText Hub', default_icon: 'icons/icon32.png' };
    manifest.browser_specific_settings = {
      gecko: { id: 'quicktext-hub@quicktext.local', strict_min_version: '115.0' },
    };
  } else {
    manifest.background = { service_worker: 'background.js', type: 'module' };
    manifest.minimum_chrome_version = '114';
    manifest.side_panel = { default_path: 'sidepanel/index.html' };
    if (key) manifest.key = key;
  }
  return manifest;
}
