// Generates the extension manifest for a given browser target.
// Chrome (MV3 service worker) is the primary target; Firefox uses MV3 background scripts.
export function buildManifest({ target = 'chrome', version, key }) {
  const manifest = {
    manifest_version: 3,
    name: 'K-Flow Automation',
    short_name: 'K-Flow Automation',
    version,
    description:
      'Browser automation: form autofill, visual field mapping, macros, safe JavaScript, variables, spreadsheets, text expansion and team workspaces.',
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    action: {
      default_title: 'K-Flow Automation',
      default_popup: 'popup/index.html',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' },
    },
    options_page: 'dashboard/index.html',
    // Minimum permissions:
    //  storage      - settings + change notifications (chrome.storage.local, namespaced "kf.")
    //  contextMenus - right-click "Insert K-Flow snippet" in editable fields
    //  identity     - Google Sign-In through launchWebAuthFlow (only used if cloud is configured)
    //  scripting    - activate expansion in tabs that were already open at install/update time
    //  sidePanel    - K-Flow side panel (Chrome 114+)
    //  unlimitedStorage - large datasets (student registers) in IndexedDB
    //  scripting is also used to inject the script host into the page MAIN world when a user runs a K-Flow script
    permissions: ['storage', 'contextMenus', 'identity', 'scripting', 'unlimitedStorage', ...(target === 'chrome' ? ['sidePanel'] : [])],
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
        description: 'Open the K-Flow side panel',
      },
      'open-assistant': {
        suggested_key: { default: 'Alt+Shift+Q', mac: 'Alt+Shift+Q' },
        description: 'Open the K-Flow snippet assistant in the focused field',
      },
      'run-autofill': {
        suggested_key: { default: 'Alt+Shift+F', mac: 'Alt+Shift+F' },
        description: 'Autofill this page with the matching K-Flow profile',
      },
      'field-selector': {
        suggested_key: { default: 'Alt+Shift+M', mac: 'Alt+Shift+M' },
        description: 'Start the K-Flow visual field selector',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };
  if (target === 'firefox') {
    manifest.background = { scripts: ['background.js'], type: 'module' };
    manifest.sidebar_action = { default_panel: 'sidepanel/index.html', default_title: 'K-Flow Automation', default_icon: 'icons/icon32.png' };
    manifest.browser_specific_settings = {
      gecko: { id: 'k-flow@kflow.local', strict_min_version: '115.0' },
    };
  } else {
    manifest.background = { service_worker: 'background.js', type: 'module' };
    manifest.minimum_chrome_version = '114';
    manifest.side_panel = { default_path: 'sidepanel/index.html' };
    manifest.sandbox = { pages: ['sandbox.html'] };
    if (key) manifest.key = key;
  }
  return manifest;
}
