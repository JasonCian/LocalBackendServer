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
  cors: true,
  showIndex: true,
  markdown: {
    enabled: true,
    theme: 'anonymous-dark.css'
  },
  telegram: {
    enabled: false
  },
  notifications: [],
  projectName: '本地轻量级后端'
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
  let config;

  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
    
    if (logger) {
      logger('INFO', '配置文件加载成功', configPath);
    }
  } catch (err) {
    if (logger) {
      logger('ERROR', '配置文件读取失败，使用默认配置', err.message);
    }
    config = { ...defaultConfig };
  }

  // 合并默认配置（确保所有必需字段存在）
  config = {
    ...defaultConfig,
    ...config,
    markdown: {
      ...defaultConfig.markdown,
      ...(config.markdown || {})
    }
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
  config = _validateConfig(config, logger);

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

  // 确保 notifications 是数组
  if (!Array.isArray(config.services.notifications)) {
    config.services.notifications = [];
  }

  return config;
}

/**
 * 私有方法：验证配置
 */
function _validateConfig(config, logger) {
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
