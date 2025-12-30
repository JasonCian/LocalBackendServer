/**
 * 路径解析工具模块
 * 
 * 提供安全的路径解析和映射功能：
 * - 将 URL 路径映射到本地文件系统路径
 * - 防止路径遍历攻击
 * - 支持多个目录映射规则
 */

const path = require('path');
const url = require('url');

// 应用根目录
const appRoot = path.resolve(__dirname, '../..');

/**
 * 解析请求路径，匹配目录映射
 * 
 * @param {string} requestPath - HTTP 请求路径
 * @param {Array} directories - 目录映射配置数组 [{route, path}, ...]
 * @returns {Object|null} 返回 {fullPath, basePath, route} 或 null（未匹配）
 */
function resolveFilePath(requestPath, directories) {
  const decodedPath = decodeURIComponent(requestPath);
  
  // 按路由长度降序排序，优先匹配更具体的路由
  const sortedDirs = [...directories].sort((a, b) => b.route.length - a.route.length);
  
  for (const dir of sortedDirs) {
    // 规范化路由，确保不以 / 结尾（除了根路由）
    const routeNormalized = dir.route === '/' ? '/' : dir.route.replace(/\/$/, '');
    
    // 检查是否匹配
    let matched = false;
    let relativePath = '';
    
    if (routeNormalized === '/') {
      // 根路由匹配所有路径
      matched = true;
      relativePath = decodedPath;
    } else if (decodedPath === routeNormalized || decodedPath === routeNormalized + '/') {
      // 精确匹配路由
      matched = true;
      relativePath = '';
    } else if (decodedPath.startsWith(routeNormalized + '/')) {
      // 路由前缀匹配
      matched = true;
      relativePath = decodedPath.substring(routeNormalized.length);
    }
    
    if (matched) {
      // 移除开头的斜杠
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      
      // 确保使用绝对路径（相对路径以appRoot为基准）
      const basePath = path.isAbsolute(dir.path) ? dir.path : path.join(appRoot, dir.path);
      const fullPath = path.join(basePath, relativePath);
      
      // 规范化路径用于安全检查
      const normalizedBase = path.normalize(basePath);
      const normalizedFull = path.normalize(fullPath);
      
      // 安全检查：防止路径遍历攻击
      if (!normalizedFull.startsWith(normalizedBase)) {
        return null;
      }
      
      return { fullPath: normalizedFull, basePath: normalizedBase, route: routeNormalized };
    }
  }
  
  return null;
}

/**
 * 将 URL 或路径映射到本地文件路径
 * 用于文件删除等操作
 * 
 * @param {string} targetUrlOrPath - URL 或路径字符串
 * @param {Array} directories - 目录映射配置数组
 * @returns {string|null} 本地文件路径或 null（未匹配）
 */
function mapUrlToLocalPath(targetUrlOrPath, directories) {
  if (!targetUrlOrPath) return null;

  let pathname = targetUrlOrPath;

  // 兼容完整 URL（含协议、主机、端口）
  try {
    const parsed = new url.URL(targetUrlOrPath);
    pathname = parsed.pathname;
  } catch (_) {
    // 非 URL 形式，继续使用原始字符串
  }

  // 解码并移除查询参数
  try {
    pathname = decodeURIComponent((pathname || '').split('?')[0] || pathname);
  } catch (_) {
    // 如果解码失败，继续使用原始字符串
  }

  if (!pathname.startsWith('/')) {
    pathname = '/' + pathname;
  }

  for (const dirConfig of directories || []) {
    const route = dirConfig.route || '/';
    const normalizedRoute = route.endsWith('/') && route !== '/' ? route.slice(0, -1) : route;

    if (normalizedRoute === '/') {
      const relative = pathname.replace(/^\/+/, '');
      const base = path.isAbsolute(dirConfig.path) ? dirConfig.path : path.join(appRoot, dirConfig.path);
      const candidate = path.normalize(path.join(base, relative));
      const normalizedBase = path.normalize(base);
      if (candidate.startsWith(normalizedBase)) {
        return candidate;
      }
    } else if (pathname.startsWith(normalizedRoute + '/') || pathname === normalizedRoute) {
      const remainder = pathname.slice(normalizedRoute.length).replace(/^\/+/, '');
      const base = path.isAbsolute(dirConfig.path) ? dirConfig.path : path.join(appRoot, dirConfig.path);
      const candidate = path.normalize(path.join(base, remainder));
      const normalizedBase = path.normalize(base);
      if (candidate.startsWith(normalizedBase)) {
        return candidate;
      }
    }
  }

  return null;
}

module.exports = {
  resolveFilePath,
  mapUrlToLocalPath,
  appRoot
};
