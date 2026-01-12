/**
 * 配置加载模块
 * 
 * 负责加载和验证服务器配置文件（config.json）
 * 提供默认配置、配置合并和安全访问代理
 */

const fs = require('fs');
const path = require('path');

/**
 * 配置验证规则
 */
const validationRules = {
  port: (val) => typeof val === 'number' && val > 0 && val < 65536,
  host: (val) => typeof val === 'string' && val.length > 0,
  directories: (val) => Array.isArray(val) && val.length > 0,
  cors: (val) => typeof val === 'boolean',
  showIndex: (val) => typeof val === 'boolean'
};

/**
 * 默认配置
 */
const defaultConfig = {
  port: 8080,
  host: '127.0.0.1',
  directories: [{ route: '/', path: './public' }],
  uploadDir: undefined,
  cors: true,
  showIndex: true,
  markdown: {
    enabled: true,
    theme: 'anonymous-dark.css'
  },
  assets: {
    enabled: true,
    mount: '/public',
    path: './public',
    cacheMaxAge: 3600
  },
  telegram: {
    enabled: false
  },
  notifications: [],
  projectName: '本地轻量级后端',
  startpage: {
    searchEngines: [],
    defaultSearchEngine: 0,
    bookmarks: [],
    useBingDaily: false,
    customBackground: ''
  },
  services: {
    systemMetrics: {
      enabled: false,
      mount: '/metrics',
      sampleIntervalMs: 250,
      historySeconds: 60,
      topN: 5,
      allowSSE: true,
      token: '',
      netInterface: ''
    }
  }
};

/**
 * 加载配置文件
 * 
 * @param {string} appRoot - 应用根目录
 * @param {Function} logger - 日志函数（可选）
 * @returns {Object} 经过验证和标准化的配置对象
 */
function loadConfig(appRoot, logger) {
  const configPath = path.join(appRoot, 'config.json');
  let raw;

  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    raw = JSON.parse(configData);
    
    if (logger) {
      logger('INFO', '配置文件加载成功', configPath);
    }
  } catch (err) {
    if (logger) {
      logger('ERROR', '配置文件读取失败，使用默认配置', err.message);
    }
    raw = { ...defaultConfig };
  }

  // 支持分组结构 server/paths/features/services，同时兼容旧字段
  const serverCfg = raw.server || {};
  const pathsCfg = raw.paths || {};
  const featuresCfg = raw.features || {};

  let config = {
    port: serverCfg.port ?? raw.port ?? defaultConfig.port,
    host: serverCfg.host ?? raw.host ?? defaultConfig.host,
    cors: serverCfg.cors ?? raw.cors ?? defaultConfig.cors,
    showIndex: serverCfg.showIndex ?? raw.showIndex ?? defaultConfig.showIndex,
    projectName: serverCfg.projectName ?? raw.projectName ?? defaultConfig.projectName,
    directories: pathsCfg.directories ?? raw.directories ?? defaultConfig.directories,
    uploadDir: pathsCfg.uploadDir ?? raw.uploadDir ?? defaultConfig.uploadDir,
    markdown: {
      ...defaultConfig.markdown,
      ...(featuresCfg.markdown || raw.markdown || {})
    },
    assets: {
      ...defaultConfig.assets,
      ...(pathsCfg.assets || raw.assets || {})
    },
    tls: serverCfg.tls ?? raw.tls ?? null,
    startpage: {
      ...defaultConfig.startpage,
      ...(featuresCfg.startpage || raw.startpage || {})
    },
    services: raw.services || {}
  };

  // 尝试加载外部 Telegram 配置（兼容性）
  try {
    const extTelegramConfigPath = path.join(appRoot, 'services', 'telegram-runner', 'telegram.config.json');
    if (fs.existsSync(extTelegramConfigPath)) {
      const extTelegramConfig = JSON.parse(fs.readFileSync(extTelegramConfigPath, 'utf8'));
      if (!config.services) config.services = {};
      if (!config.services.telegram) config.services.telegram = {};
      config.services.telegram = { ...config.services.telegram, ...extTelegramConfig, enabled: true };
      
      if (logger) {
        logger('INFO', '加载外部 Telegram 配置', extTelegramConfigPath);
      }
    }
  } catch (e) {
    // 忽略外部配置加载错误
  }

  // 标准化配置结构
  config = _normalizeConfig(config);

  // 验证关键配置
  config = _validateConfig(config, logger, appRoot);

  return config;
}

/**
 * 私有方法：标准化配置结构
 */
function _normalizeConfig(config) {
  // 确保 services 对象存在
  if (!config.services || typeof config.services !== 'object') {
    config.services = {};
  }

  // 确保各服务配置对象存在
  if (!config.services.telegram) {
    config.services.telegram = { enabled: false };
  }
  if (!config.services.powershellHistory) {
    config.services.powershellHistory = { enabled: false };
  }
  if (!config.services.fileService) {
    config.services.fileService = { enabled: false };
  }
  if (!config.services.systemMetrics) {
    config.services.systemMetrics = { ...defaultConfig.services.systemMetrics };
  } else {
    config.services.systemMetrics = {
      ...defaultConfig.services.systemMetrics,
      ...config.services.systemMetrics
    };
  }

  // 确保 notifications 是数组
  if (!Array.isArray(config.services.notifications)) {
    config.services.notifications = [];
  }

  // 确保 assets 对象存在
  if (!config.assets || typeof config.assets !== 'object') {
    config.assets = { ...defaultConfig.assets };
  }

  return config;
}

/**
 * 私有方法：验证配置
 */
function _validateConfig(config, logger, appRoot) {
  const issues = [];

  // 验证端口
  if (!validationRules.port(config.port)) {
    issues.push(`port 值无效: ${config.port}，应为 1-65535 之间的数字`);
    config.port = defaultConfig.port;
  }

  // 验证主机
  if (!validationRules.host(config.host)) {
    issues.push(`host 值无效: ${config.host}`);
    config.host = defaultConfig.host;
  }

  // 验证目录映射
  if (!validationRules.directories(config.directories)) {
    issues.push('directories 配置无效或为空');
    config.directories = defaultConfig.directories;
  }

  // 验证 CORS
  if (!validationRules.cors(config.cors)) {
    config.cors = defaultConfig.cors;
  }

  // 验证 showIndex
  if (!validationRules.showIndex(config.showIndex)) {
    config.showIndex = defaultConfig.showIndex;
  }

  // 验证 uploadDir
  if (config.uploadDir && typeof config.uploadDir !== 'string') {
    issues.push('uploadDir 需为字符串路径，已移除');
    delete config.uploadDir;
  }

  // 验证 assets
  if (config.assets) {
    const mount = String(config.assets.mount || '').trim();
    const pathVal = config.assets.path;
    const reserved = ['/upload', '/delete', '/api', '/ws'];

    if (!mount.startsWith('/')) {
      issues.push(`assets.mount 必须以 / 开头，已回退为 ${defaultConfig.assets.mount}`);
      config.assets.mount = defaultConfig.assets.mount;
    }

    if (!pathVal || typeof pathVal !== 'string') {
      issues.push('assets.path 必须为有效字符串，已回退默认');
      config.assets.path = defaultConfig.assets.path;
    }

    if (reserved.includes(mount)) {
      issues.push(`assets.mount ${mount} 与保留路由冲突，已禁用静态资源映射`);
      config.assets.enabled = false;
    }
  }

  // 验证 TLS 证书存在性（开启才检查）
  if (config.tls && config.tls.enabled) {
    const pfxPathRaw = config.tls.pfx || '';
    const keyPathRaw = config.tls.key || '';
    const certPathRaw = config.tls.cert || '';

    const pfxPath = pfxPathRaw ? (path.isAbsolute(pfxPathRaw) ? pfxPathRaw : path.join(appRoot, pfxPathRaw)) : '';
    const keyPath = keyPathRaw ? (path.isAbsolute(keyPathRaw) ? keyPathRaw : path.join(appRoot, keyPathRaw)) : '';
    const certPath = certPathRaw ? (path.isAbsolute(certPathRaw) ? certPathRaw : path.join(appRoot, certPathRaw)) : '';

    const hasPfx = pfxPath && fs.existsSync(pfxPath);
    const hasKeyCert = keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath);

    if (!hasPfx && !hasKeyCert) {
      const errMsg = '启用 TLS 但未找到有效证书文件（pfx 或 key/cert）';
      if (logger) logger('ERROR', errMsg);
      throw new Error(errMsg);
    }
  }

  // 验证 systemMetrics
  if (config.services && config.services.systemMetrics) {
    const sysCfg = config.services.systemMetrics;
    const toNumberOrDefault = (val, def) => (typeof val === 'number' && val > 0 ? val : def);

    sysCfg.sampleIntervalMs = toNumberOrDefault(sysCfg.sampleIntervalMs, defaultConfig.services.systemMetrics.sampleIntervalMs);
    sysCfg.historySeconds = toNumberOrDefault(sysCfg.historySeconds, defaultConfig.services.systemMetrics.historySeconds);
    sysCfg.topN = toNumberOrDefault(sysCfg.topN, defaultConfig.services.systemMetrics.topN);

    const mountRaw = String(sysCfg.mount || '').trim();
    if (!mountRaw.startsWith('/')) {
      issues.push('systemMetrics.mount 必须以 / 开头，已回退默认值');
      sysCfg.mount = defaultConfig.services.systemMetrics.mount;
    }
  }

  // 记录验证问题
  if (issues.length > 0 && logger) {
    issues.forEach(issue => {
      logger('WARN', '配置验证警告', issue);
    });
  }

  return config;
}

/**
 * 获取配置的摘要信息（用于日志）
 * 
 * @param {Object} config - 配置对象
 * @returns {string} 配置摘要
 */
function getConfigSummary(config) {
  const summary = {
    host: config.host,
    port: config.port,
    directories: config.directories.map(d => `${d.route} -> ${d.path}`),
    uploadDir: config.uploadDir || '（未配置）',
    cors: config.cors ? '启用' : '禁用',
    showIndex: config.showIndex ? '启用' : '禁用',
    markdown: config.markdown?.enabled ? '启用' : '禁用',
    telegram: config.services?.telegram?.enabled ? '启用' : '禁用',
    systemMetrics: config.services?.systemMetrics?.enabled ? '启用' : '禁用',
    notifications: (config.services?.notifications || []).length
  };
  
  return JSON.stringify(summary, null, 2);
}

module.exports = {
  loadConfig,
  getConfigSummary,
  defaultConfig,
  validationRules
};
