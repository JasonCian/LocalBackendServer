/**
 * 配置加载模块
 * - 读取 config.json
 * - 合并默认值
 * - 标准化并校验
 */

const fs = require('fs');
const path = require('path');

// 基础校验规则
const validationRules = {
  port: (val) => typeof val === 'number' && val > 0 && val < 65536,
  host: (val) => typeof val === 'string' && val.length > 0,
  directories: (val) => Array.isArray(val) && val.length > 0,
  cors: (val) => typeof val === 'boolean',
  showIndex: (val) => typeof val === 'boolean'
};

// 分组默认配置（结构与 config.json 保持一致）
const defaultConfig = {
  server: {
    port: 8080,
    host: '127.0.0.1',
    cors: true,
    showIndex: true,
    projectName: '本地轻量级后端',
    tls: null
  },
  paths: {
    directories: [{ route: '/', path: './public' }],
    uploadDir: undefined,
    assets: {
      enabled: true,
      mount: '/public',
      path: './public',
      cacheMaxAge: 3600
    }
  },
  features: {
    markdown: {
      enabled: true,
      theme: 'anonymous-dark.css'
    },
    startpage: {
      searchEngines: [],
      defaultSearchEngine: 0,
      bookmarks: [],
      useBingDaily: false,
      customBackground: ''
    }
  },
  services: {
    telegram: { enabled: false },
    powershellHistory: { enabled: false },
    fileService: { enabled: false },
    systemMetrics: {
      enabled: false,
      mount: '/metrics',
      sampleIntervalMs: 250,
      historySeconds: 60,
      topN: 5,
      allowSSE: true,
      token: '',
      netInterface: ''
    },
    notifications: []
  }
};

// 提供扁平化默认值的工厂（避免共享引用）
const clone = (obj) => JSON.parse(JSON.stringify(obj));
const createDefaultFlat = () => ({
  port: defaultConfig.server.port,
  host: defaultConfig.server.host,
  cors: defaultConfig.server.cors,
  showIndex: defaultConfig.server.showIndex,
  projectName: defaultConfig.server.projectName,
  directories: clone(defaultConfig.paths.directories),
  uploadDir: defaultConfig.paths.uploadDir,
  markdown: clone(defaultConfig.features.markdown),
  assets: clone(defaultConfig.paths.assets),
  startpage: clone(defaultConfig.features.startpage),
  services: clone(defaultConfig.services)
});

// 默认 TLS 配置
const defaultTls = {
  enabled: false,
  port: 443,
  redirectHttp: false,
  enableHttp: false,
  httpPort: 80
};

/**
 * 加载并返回标准化后的配置
 */
function loadConfig(appRoot, logger) {
  const raw = _readConfigFile(appRoot, logger);
  const merged = _mergeRawConfig(raw);
  const withExternalTelegram = _applyExternalTelegramConfig(merged, appRoot, logger);
  const normalized = _normalizeConfig(withExternalTelegram);
  return _validateConfig(normalized, appRoot, logger);
}

// 读取 config.json，失败则返回默认配置
function _readConfigFile(appRoot, logger) {
  const configPath = path.join(appRoot, 'config.json');
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(configData);
    if (logger) logger('INFO', '配置文件加载成功', configPath);
    return parsed;
  } catch (err) {
    if (logger) logger('ERROR', '配置文件读取失败，使用默认配置', err.message);
    return createDefaultFlat();
  }
}

// 合并分组字段与默认值
function _mergeRawConfig(raw) {
  const base = createDefaultFlat();
  const serverCfg = raw.server || {};
  const pathsCfg = raw.paths || {};
  const featuresCfg = raw.features || {};

  return {
    port: serverCfg.port ?? raw.port ?? base.port,
    host: serverCfg.host ?? raw.host ?? base.host,
    cors: serverCfg.cors ?? raw.cors ?? base.cors,
    showIndex: serverCfg.showIndex ?? raw.showIndex ?? base.showIndex,
    projectName: serverCfg.projectName ?? raw.projectName ?? base.projectName,
    directories: pathsCfg.directories ?? raw.directories ?? base.directories,
    uploadDir: pathsCfg.uploadDir ?? raw.uploadDir ?? base.uploadDir,
    markdown: {
      ...base.markdown,
      ...(featuresCfg.markdown || raw.markdown || {})
    },
    assets: {
      ...base.assets,
      ...(pathsCfg.assets || raw.assets || {})
    },
    tls: serverCfg.tls ?? raw.tls ?? null,
    startpage: {
      ...base.startpage,
      ...(featuresCfg.startpage || raw.startpage || {})
    },
    services: raw.services || {}
  };
}

// 兼容外部 Telegram 配置（可选）
function _applyExternalTelegramConfig(config, appRoot, logger) {
  try {
    const extPath = path.join(appRoot, 'services', 'telegram-runner', 'telegram.config.json');
    if (fs.existsSync(extPath)) {
      const extTelegramConfig = JSON.parse(fs.readFileSync(extPath, 'utf8'));
      if (!config.services) config.services = {};
      if (!config.services.telegram) config.services.telegram = {};
      config.services.telegram = { ...config.services.telegram, ...extTelegramConfig, enabled: true };
      if (logger) logger('INFO', '加载外部 Telegram 配置', extPath);
    }
  } catch (e) {
    // 忽略外部配置加载错误
  }
  return config;
}

// 标准化配置形态
function _normalizeConfig(config) {
  const base = createDefaultFlat();
  if (!config.services || typeof config.services !== 'object') {
    config.services = {};
  }

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
    config.services.systemMetrics = clone(base.services.systemMetrics);
  } else {
    config.services.systemMetrics = {
      ...clone(base.services.systemMetrics),
      ...config.services.systemMetrics
    };
  }

  if (!Array.isArray(config.services.notifications)) {
    config.services.notifications = [];
  }

  if (!config.assets || typeof config.assets !== 'object') {
    config.assets = clone(base.assets);
  }

  if (config.tls && typeof config.tls === 'object') {
    const mergedTls = { ...defaultTls, ...config.tls };
    if (typeof mergedTls.httpPort !== 'number' || mergedTls.httpPort <= 0) {
      mergedTls.httpPort = config.port || base.port;
    }
    if (typeof mergedTls.port !== 'number' || mergedTls.port <= 0) {
      mergedTls.port = defaultTls.port;
    }
    config.tls = mergedTls;
  } else {
    config.tls = config.tls ? { ...defaultTls, ...config.tls } : null;
  }

  return config;
}

// 校验关键字段并输出警告
function _validateConfig(config, appRoot, logger) {
  const issues = [];
  const base = createDefaultFlat();

  if (!validationRules.port(config.port)) {
    issues.push(`port 值无效: ${config.port}，应为 1-65535 之间的数字`);
    config.port = base.port;
  }

  if (!validationRules.host(config.host)) {
    issues.push(`host 值无效: ${config.host}`);
    config.host = base.host;
  }

  if (!validationRules.directories(config.directories)) {
    issues.push('directories 配置无效或为空');
    config.directories = base.directories;
  }

  if (!validationRules.cors(config.cors)) {
    config.cors = base.cors;
  }

  if (!validationRules.showIndex(config.showIndex)) {
    config.showIndex = base.showIndex;
  }

  if (config.uploadDir && typeof config.uploadDir !== 'string') {
    issues.push('uploadDir 需为字符串路径，已移除');
    delete config.uploadDir;
  }

  if (config.assets) {
    const mount = String(config.assets.mount || '').trim();
    const pathVal = config.assets.path;
    const reserved = ['/upload', '/delete', '/api', '/ws'];

    if (!mount.startsWith('/')) {
      issues.push(`assets.mount 必须以 / 开头，已回退为 ${base.assets.mount}`);
      config.assets.mount = base.assets.mount;
    }

    if (!pathVal || typeof pathVal !== 'string') {
      issues.push('assets.path 必须为有效字符串，已回退默认');
      config.assets.path = base.assets.path;
    }

    if (reserved.includes(mount)) {
      issues.push(`assets.mount ${mount} 与保留路由冲突，已禁用静态资源映射`);
      config.assets.enabled = false;
    }
  }

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

    const toPort = (val, def) => (typeof val === 'number' && val > 0 && val < 65536 ? val : def);
    config.tls.port = toPort(config.tls.port, defaultTls.port);
    if (config.tls.enableHttp) {
      config.tls.httpPort = toPort(config.tls.httpPort, config.port || base.port);
    }

    if (config.tls.redirectHttp && config.tls.enableHttp && logger) {
      logger('WARN', '配置冲突: tls.redirectHttp 与 tls.enableHttp 同时开启，已忽略 redirectHttp');
      config.tls.redirectHttp = false;
    }
  }

  if (config.services && config.services.systemMetrics) {
    const sysCfg = config.services.systemMetrics;
    const toNumberOrDefault = (val, def) => (typeof val === 'number' && val > 0 ? val : def);

    sysCfg.sampleIntervalMs = toNumberOrDefault(sysCfg.sampleIntervalMs, base.services.systemMetrics.sampleIntervalMs);
    sysCfg.historySeconds = toNumberOrDefault(sysCfg.historySeconds, base.services.systemMetrics.historySeconds);
    sysCfg.topN = toNumberOrDefault(sysCfg.topN, base.services.systemMetrics.topN);

    const mountRaw = String(sysCfg.mount || '').trim();
    if (!mountRaw.startsWith('/')) {
      issues.push('systemMetrics.mount 必须以 / 开头，已回退默认值');
      sysCfg.mount = base.services.systemMetrics.mount;
    }
  }

  if (issues.length > 0 && logger) {
    issues.forEach(issue => logger('WARN', '配置验证警告', issue));
  }

  return config;
}

/**
 * 输出配置摘要（用于日志）
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
