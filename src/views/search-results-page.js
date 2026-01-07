/**
 * 搜索结果页面视图生成器
 * 
 * 生成站内 Markdown 搜索结果页面
 */

const { escapeHtml } = require('../utils/html-escape');

/**
 * 生成搜索结果页面 HTML
 * 
 * @param {Array} results - 搜索结果数组
 * @param {string} query - 搜索关键词
 * @param {Object} config - 服务器配置
 * @returns {string} 搜索结果页面 HTML
 */
function generateSearchResultsPage(results, query, config) {
  const projectName = (config.projectName && String(config.projectName).trim()) || '本地文件服务器';
  const escapedQuery = escapeHtml(query);
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>搜索结果: ${escapedQuery} - ${escapeHtml(projectName)}</title>
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
      --success: #56d364;
      --warning: #e3b341;
      --shadow: 0 16px 70px rgba(0, 0, 0, 0.55);
    }
    
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 0;
      margin: 0;
    }
    
    .header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 24px 32px;
      backdrop-filter: blur(16px);
    }
    
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      text-decoration: none;
      font-size: 14px;
      transition: all 0.2s;
    }
    
    .back-btn:hover {
      background: rgba(88, 166, 255, 0.1);
      border-color: var(--primary);
    }
    
    .title {
      font-size: 28px;
      font-weight: 600;
      color: var(--text);
    }
    
    .search-query {
      color: var(--primary);
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px;
    }
    
    .search-info {
      margin-bottom: 32px;
      padding: 16px 24px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      backdrop-filter: blur(16px);
    }
    
    .search-info p {
      color: var(--text-muted);
      font-size: 14px;
    }
    
    .search-info strong {
      color: var(--success);
      font-weight: 600;
    }
    
    .results-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .result-item {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      transition: all 0.3s ease;
      backdrop-filter: blur(16px);
    }
    
    .result-item:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow);
      border-color: var(--primary);
    }
    
    .result-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    
    .result-icon {
      font-size: 24px;
    }
    
    .result-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
    }
    
    .result-title a {
      color: var(--primary);
      text-decoration: none;
      transition: color 0.2s;
    }
    
    .result-title a:hover {
      color: var(--primary-hover);
      text-decoration: underline;
    }
    
    .result-meta {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--text-muted);
    }
    
    .result-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(88, 166, 255, 0.15);
      border-radius: 4px;
      color: var(--primary);
      font-size: 12px;
      font-weight: 500;
    }
    
    .result-badge.name-match {
      background: rgba(86, 211, 100, 0.15);
      color: var(--success);
    }
    
    .result-badge.content-match {
      background: rgba(227, 179, 65, 0.15);
      color: var(--warning);
    }
    
    .result-excerpt {
      padding: 12px;
      background: rgba(13, 17, 23, 0.5);
      border-left: 3px solid var(--primary);
      border-radius: 6px;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-muted);
    }
    
    .result-excerpt mark {
      background: rgba(227, 179, 65, 0.3);
      color: var(--warning);
      padding: 2px 4px;
      border-radius: 3px;
      font-weight: 500;
    }
    
    .empty-state {
      text-align: center;
      padding: 80px 32px;
    }
    
    .empty-state-icon {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .empty-state h2 {
      font-size: 24px;
      margin-bottom: 8px;
      color: var(--text);
    }
    
    .empty-state p {
      font-size: 16px;
      color: var(--text-muted);
    }
    
    @media (max-width: 768px) {
      .header-content {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .title {
        font-size: 22px;
      }
      
      .container {
        padding: 16px;
      }
      
      .result-meta {
        flex-direction: column;
        gap: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <a href="/" class="back-btn">← 返回首页</a>
      <h1 class="title">搜索: <span class="search-query">${escapedQuery}</span></h1>
    </div>
  </div>
  
  <div class="container">
    ${results.length > 0 ? `
      <div class="search-info">
        <p>找到 <strong>${results.length}</strong> 个匹配的 Markdown 文件</p>
      </div>
      
      <div class="results-list">
        ${results.map(result => `
          <div class="result-item">
            <div class="result-header">
              <span class="result-icon">📄</span>
              <div class="result-title">
                <a href="${escapeHtml(result.path)}">${escapeHtml(result.name)}</a>
              </div>
            </div>
            <div class="result-meta">
              <span>📁 ${escapeHtml(result.directory)}</span>
              ${result.nameMatch ? '<span class="result-badge name-match">✓ 文件名匹配</span>' : ''}
              ${result.contentMatch ? '<span class="result-badge content-match">✓ 内容匹配</span>' : ''}
            </div>
            ${result.excerpt ? `
              <div class="result-excerpt">${result.excerpt}</div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    ` : query ? `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2>未找到匹配结果</h2>
        <p>没有找到包含 "${escapedQuery}" 的 Markdown 文件</p>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h2>站内搜索</h2>
        <p>请输入搜索关键词</p>
      </div>
    `}
  </div>
</body>
</html>`;
}

module.exports = {
  generateSearchResultsPage
};
