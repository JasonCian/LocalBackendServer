/**
 * 浏览器起始页视图生成器
 * 
 * 生成现代化浏览器起始页，包括：
 * - 自定义搜索引擎
 * - 书签网格
 * - Bing 每日背景
 * - 实时时钟
 */

/**
 * 生成起始页 HTML
 * 
 * @param {Object} config - 服务器配置对象
 * @returns {string} 起始页 HTML 字符串
 */
function generateStartPage(config) {
  const startpageConfig = config.startpage || {};
  const searchEngines = startpageConfig.searchEngines || [
    { name: 'Google', url: 'https://www.google.com/search?q=%s', icon: '🔍' }
  ];
  const bookmarks = startpageConfig.bookmarks || [];
    const useBingDaily = startpageConfig.useBingDaily === true;
  const customBackground = startpageConfig.customBackground || '';
  const defaultEngine = startpageConfig.defaultSearchEngine || 0;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>起始页</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --bg: #0d1117;
      --card: rgba(22, 27, 34, 0.85);
      --border: rgba(48, 54, 61, 0.5);
      --text: #e6edf3;
      --text-muted: #8b949e;
      --primary: #58a6ff;
      --primary-hover: #79c0ff;
      --shadow: 0 16px 70px rgba(0, 0, 0, 0.55);
    }
    
    body {
        font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0;
      margin: 0;
      overflow-x: hidden;
    }
    
    #background {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #1e3a5f 0%, #0d1117 100%);
      background-size: cover;
      background-position: center;
      z-index: -1;
      transition: opacity 0.5s ease;
    }
    
    #background::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(13, 17, 23, 0.6);
      backdrop-filter: blur(8px);
      opacity: 0.28;
      transition: opacity 0.3s ease;
    }
    

    /* 仅在搜索框聚焦时显示蒙版 */
    body.search-active #background::after {
      opacity: 0.65;
    }
    .container {
      width: 100%;
      max-width: 1200px;
      padding: 60px 24px 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 48px;
      position: relative;
      z-index: 1;
    }
    
    /* 时钟 */
    .clock {
      text-align: center;
      margin-bottom: 16px;
      display: inline-block;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 12px 20px;
      backdrop-filter: blur(12px);
      box-shadow: var(--shadow);
    }
    
    .time {
      font-size: 72px;
      font-weight: 600;
      letter-spacing: -2px;
      text-shadow: 0 0 10px rgba(0, 0, 0, 0.65), 0 4px 24px rgba(88, 166, 255, 0.25);
      -webkit-text-stroke: 0.6px rgba(0,0,0,0.35);
    }
    
    .date {
      font-size: 18px;
      color: var(--text-muted);
      margin-top: 8px;
    }
    
    /* 搜索框 */
    .search-container {
      width: 100%;
      max-width: 600px;
      position: relative;
    }
    
    .search-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 6px 6px 6px 16px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
      transition: all 0.3s ease;
    }
    
    .search-wrapper:focus-within {
      border-color: var(--primary);
      box-shadow: 0 16px 70px rgba(88, 166, 255, 0.25);
    }
    
    .engine-selector {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 18px;
      transition: background 0.2s;
      user-select: none;
      flex-shrink: 0;
    }
    
    .engine-selector:hover {
      background: rgba(88, 166, 255, 0.1);
    }
    
    .engine-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .engine-icon img {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    
    .engine-arrow {
      font-size: 12px;
      color: var(--text-muted);
      transition: transform 0.2s;
    }
    
    .engine-selector.active .engine-arrow {
      transform: rotate(180deg);
    }
    
    .engine-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 8px;
      min-width: 220px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
      display: none;
      z-index: 100;
    }
    
    .engine-dropdown.show {
      display: block;
    }
    
    .engine-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      border-radius: 12px;
      transition: background 0.2s;
    }
    
    .engine-option:hover {
      background: rgba(88, 166, 255, 0.1);
    }
    
    .engine-option.selected {
      background: rgba(88, 166, 255, 0.15);
      color: var(--primary);
    }
    
    .engine-option-icon {
      font-size: 18px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .engine-option-icon img {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    
    .engine-option-name {
      font-size: 15px;
      font-weight: 500;
    }
    
    #searchInput {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      font-size: 16px;
      padding: 12px 16px;
      color: var(--text);
    }
    
    #searchInput::placeholder {
      color: var(--text-muted);
    }
    
    .search-btn {
      background: var(--primary);
      border: none;
      border-radius: 18px;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 20px;
      flex-shrink: 0;
    }
    
    .search-btn:hover {
      background: var(--primary-hover);
      transform: scale(1.05);
    }
    
    /* 书签网格 */
    .bookmarks {
      width: 100%;
      max-width: 900px;
    }
    
    .bookmarks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 20px;
    }
    
    .bookmark {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 16px;
      text-align: center;
      text-decoration: none;
      color: var(--text);
      transition: all 0.3s ease;
      backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    
    .bookmark:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow);
      border-color: var(--primary);
    }
    
    .bookmark-icon {
      font-size: 36px;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      transition: transform 0.2s;
    }
    
    .bookmark-icon img {
      width: 32px;
      height: 32px;
      object-fit: contain;
    }
    
    .bookmark:hover .bookmark-icon {
      transform: scale(1.1);
    }
    
    .bookmark-title {
      font-size: 14px;
      font-weight: 500;
      word-break: break-word;
    }
    
    /* 响应式 */
    @media (max-width: 768px) {
      .container {
        padding: 40px 16px 24px;
        gap: 32px;
      }
      
      .time {
        font-size: 52px;
      }
      
      .date {
        font-size: 16px;
      }
      
      .bookmarks-grid {
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 16px;
      }
      
      .bookmark {
        padding: 20px 12px;
      }
      
      .bookmark-icon {
        font-size: 32px;
        width: 48px;
        height: 48px;
      }
    }
    
    @media (max-width: 480px) {
      .time {
        font-size: 42px;
      }
      
      .bookmarks-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
    }
  </style>
</head>
<body>
  <div id="background"></div>
  
  <div class="container">
    <!-- 时钟 -->
    <div class="clock">
      <div class="time" id="time">00:00</div>
      <div class="date" id="date">加载中...</div>
    </div>
    
    <!-- 搜索框 -->
    <div class="search-container">
      <div class="search-wrapper">
        <div class="engine-selector" id="engineSelector">
          <span class="engine-icon" id="currentEngineIcon">🔍</span>
          <span class="engine-arrow">▼</span>
        </div>
        
        <input 
          type="text" 
          id="searchInput" 
          placeholder="搜索..." 
          autocomplete="off"
        />
        
        <button class="search-btn" id="searchBtn" title="搜索">
          →
        </button>
      </div>
      
      <div class="engine-dropdown" id="engineDropdown">
        ${searchEngines.map((engine, index) => {
          const isUrl = engine.icon && (engine.icon.startsWith('http://') || engine.icon.startsWith('https://'));
          const iconHtml = isUrl ? `<img src="${engine.icon}" alt="${engine.name}" />` : engine.icon || '🔍';
          return `
        <div class="engine-option ${index === defaultEngine ? 'selected' : ''}" data-index="${index}">
          <span class="engine-option-icon">${iconHtml}</span>
          <span class="engine-option-name">${engine.name}</span>
        </div>
        `;
        }).join('')}
      </div>
    </div>
    
    <!-- 书签网格 -->
    ${bookmarks.length > 0 ? `
    <div class="bookmarks">
      <div class="bookmarks-grid">
        ${bookmarks.map(bookmark => {
          const isUrl = bookmark.icon && (bookmark.icon.startsWith('http://') || bookmark.icon.startsWith('https://'));
          const iconHtml = isUrl ? `<img src="${bookmark.icon}" alt="${bookmark.title}" />` : bookmark.icon || '🔖';
          return `
        <a href="${bookmark.url}" class="bookmark" ${bookmark.url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>
          <div class="bookmark-icon" style="background: ${bookmark.color || '#58a6ff'}20; color: ${bookmark.color || '#58a6ff'}">
            ${iconHtml}
          </div>
          <div class="bookmark-title">${bookmark.title}</div>
        </a>
        `;
        }).join('')}
      </div>
    </div>
    ` : ''}
  </div>
  
  <script>
    const searchEngines = ${JSON.stringify(searchEngines)};
    const useBingDaily = ${useBingDaily};
    const customBackground = ${JSON.stringify(customBackground)};
    
    let currentEngine = parseInt(localStorage.getItem('preferredSearchEngine') || '${defaultEngine}');
    
    // 更新时钟
    function updateClock() {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('time').textContent = hours + ':' + minutes;
      
      const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
      document.getElementById('date').textContent = now.toLocaleDateString('zh-CN', options);
    }
    
    updateClock();
    setInterval(updateClock, 1000);
    
    // 加载背景
    async function loadBackground() {
      const bgElement = document.getElementById('background');
      const cacheKey = 'bingDailyBg';

      // 1) 自定义背景：直接应用
      if (customBackground) {
        bgElement.style.backgroundImage = 'url(' + customBackground + ')';
        return;
      }

      // 2) Bing 背景：先用本地缓存立即展示，再异步刷新
      if (useBingDaily) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.imageUrl) {
                bgElement.style.backgroundImage = 'url(' + parsed.imageUrl + ')';
              }
            } catch (_) {}
          }

          // 异步刷新（按日期刷新，避免频繁闪烁）
          const response = await fetch('/api/bing-daily', { cache: 'no-cache' });
          const data = await response.json();
          if (data && data.success && data.imageUrl) {
            const today = new Date().toISOString().slice(0, 10);
            const cachePayload = { imageUrl: data.imageUrl, date: today };
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
            bgElement.style.backgroundImage = 'url(' + data.imageUrl + ')';
          }
        } catch (err) {
          console.log('无法加载 Bing 背景，使用默认渐变');
        }
      }
    }
    
    loadBackground();
    
    // 搜索引擎切换
    const engineSelector = document.getElementById('engineSelector');
    const engineDropdown = document.getElementById('engineDropdown');
    const currentEngineIcon = document.getElementById('currentEngineIcon');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    // 聚焦时开启蒙版；失焦时关闭
    searchInput.addEventListener('focus', () => {
      document.body.classList.add('search-active');
    });
    searchInput.addEventListener('blur', () => {
      document.body.classList.remove('search-active');
    });
    
    // 更新当前引擎显示
    function updateEngineDisplay() {
      const engine = searchEngines[currentEngine];
      const isUrl = engine.icon && (engine.icon.startsWith('http://') || engine.icon.startsWith('https://'));
      
      if (isUrl) {
        currentEngineIcon.innerHTML = '<img src="' + engine.icon + '" alt="' + engine.name + '" />';
      } else {
        currentEngineIcon.textContent = engine.icon || '🔍';
      }
      
      // 更新选中状态
      document.querySelectorAll('.engine-option').forEach((option, index) => {
        option.classList.toggle('selected', index === currentEngine);
      });
    }
    
    updateEngineDisplay();
    
    // 切换下拉菜单
    engineSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      engineDropdown.classList.toggle('show');
      engineSelector.classList.toggle('active');
    });
    
    // 选择引擎
    document.querySelectorAll('.engine-option').forEach((option) => {
      option.addEventListener('click', () => {
        currentEngine = parseInt(option.dataset.index);
        localStorage.setItem('preferredSearchEngine', currentEngine);
        updateEngineDisplay();
        engineDropdown.classList.remove('show');
        engineSelector.classList.remove('active');
        searchInput.focus();
      });
    });
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', () => {
      engineDropdown.classList.remove('show');
      engineSelector.classList.remove('active');
    });
    
    // 搜索功能
    function performSearch() {
      const query = searchInput.value.trim();
      if (!query) return;
      
      const engine = searchEngines[currentEngine];
      const url = engine.url.replace('%s', encodeURIComponent(query));
      
      if (url.startsWith('http')) {
        window.location.href = url;
      } else {
        window.location.href = url;
      }
    }
    
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
    
    // 自动聚焦搜索框
    window.addEventListener('load', () => {
      searchInput.focus();
    });
  </script>
</body>
</html>`;
}

module.exports = {
  generateStartPage
};
