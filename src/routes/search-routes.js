/**
 * 站内搜索路由处理器
 * 
 * 功能：
 * - 搜索所有配置目录下的 Markdown 文件
 * - 全文搜索（文件名 + 内容）
 * - 返回搜索结果页面
 */

const fs = require('fs');
const path = require('path');
const { generateSearchResultsPage } = require('../views/search-results-page');

/**
 * 递归搜索目录下的 Markdown 文件
 * 
 * @param {string} dir - 当前搜索目录路径
 * @param {string} query - 搜索关键词
 * @param {string} baseRoute - 基础路由
 * @param {Array} results - 结果数组
 * @param {string} rootDir - 根目录路径（用于计算相对路径）
 */
function searchMarkdownFiles(dir, query, baseRoute, results, rootDir) {
  try {
    if (!fs.existsSync(dir)) return;
    
    // 首次调用时，rootDir 就是 dir
    if (!rootDir) rootDir = dir;
    
    const items = fs.readdirSync(dir);
    const lowerQuery = query.toLowerCase();
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          // 递归搜索子目录，传递 rootDir
          searchMarkdownFiles(fullPath, query, baseRoute, results, rootDir);
        } else if (stats.isFile() && /\.md$/i.test(item)) {
          // 检查文件名是否匹配
          const nameMatch = item.toLowerCase().includes(lowerQuery);
          
          // 读取文件内容检查是否匹配
          let contentMatch = false;
          let excerpt = '';
          
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lowerContent = content.toLowerCase();
            
            if (lowerContent.includes(lowerQuery)) {
              contentMatch = true;
              
              // 提取摘要（包含关键词的上下文）
              const index = lowerContent.indexOf(lowerQuery);
              const start = Math.max(0, index - 50);
              const end = Math.min(content.length, index + query.length + 50);
              excerpt = content.substring(start, end).trim();
              
              // 高亮关键词
              const regex = new RegExp(`(${query})`, 'gi');
              excerpt = excerpt.replace(regex, '<mark>$1</mark>');
              
              if (start > 0) excerpt = '...' + excerpt;
              if (end < content.length) excerpt = excerpt + '...';
            }
          } catch (err) {
            // 忽略读取失败的文件
          }
          
          // 如果文件名或内容匹配，添加到结果
          if (nameMatch || contentMatch) {
            // 使用 rootDir 计算完整的相对路径
            const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
            const urlPath = baseRoute + '/' + relativePath;
            
            // 获取目录路径（相对于根目录）
            const dirPath = path.dirname(relativePath);
            const displayDir = dirPath && dirPath !== '.' ? dirPath : '根目录';
            
            results.push({
              name: item,
              path: urlPath,
              nameMatch: nameMatch,
              contentMatch: contentMatch,
              excerpt: excerpt,
              directory: displayDir
            });
          }
        }
      } catch (err) {
        // 忽略无法访问的文件/目录
      }
    }
  } catch (err) {
    // 忽略无法访问的目录
  }
}

/**
 * 处理搜索请求
 * 
 * @param {Object} req - HTTP 请求对象
 * @param {Object} res - HTTP 响应对象
 * @param {string} queryString - 查询字符串
 * @param {Object} config - 服务器配置
 * @param {Function} logger - 日志函数
 */
function handleSearch(req, res, queryString, config, logger) {
  try {
    // 解析查询参数
    const params = new URLSearchParams(queryString);
    const query = params.get('q');
    
    if (!query || query.trim() === '') {
      const html = generateSearchResultsPage([], '', config);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    
    const trimmedQuery = query.trim();
    logger('INFO', `站内搜索: "${trimmedQuery}"`);
    
    // 搜索所有配置的目录
    const results = [];
    for (const dir of config.directories || []) {
      const dirPath = path.isAbsolute(dir.path) 
        ? dir.path 
        : path.resolve(process.cwd(), dir.path);
      
      searchMarkdownFiles(dirPath, trimmedQuery, dir.route, results);
    }
    
    // 按相关性排序（文件名匹配优先）
    results.sort((a, b) => {
      if (a.nameMatch && !b.nameMatch) return -1;
      if (!a.nameMatch && b.nameMatch) return 1;
      return a.name.localeCompare(b.name);
    });
    
    logger('INFO', `搜索完成: 找到 ${results.length} 个结果`);
    
    // 生成搜索结果页面
    const html = generateSearchResultsPage(results, trimmedQuery, config);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    
  } catch (err) {
    logger('ERROR', '搜索错误', err && (err.stack || err.message));
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>500 - 服务器错误</h1><p>${err.message}</p>`);
  }
}

module.exports = {
  handleSearch
};
