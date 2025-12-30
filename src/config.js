/**
 * 配置加载模块
 * 
 * 负责加载和验证服务器配置文件（config.json）
 * 提供默认配置和配置合并功能
 */

const fs = require('fs');
const path = require('path');

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
 * @returns {Object} 配置对象
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
    },
    telegram: {
      ...defaultConfig.telegram,
      ...(config.telegram || {})
    }
  };

  // 尝试加载外部 Telegram 配置（兼容性）
  try {
    const extTelegramConfigPath = path.join(appRoot, 'services', 'telegram-runner', 'telegram.config.json');
    if (fs.existsSync(extTelegramConfigPath)) {
      const extTelegramConfig = JSON.parse(fs.readFileSync(extTelegramConfigPath, 'utf8'));
      config.telegram = { ...config.telegram, ...extTelegramConfig, enabled: true };
      
      if (logger) {
        logger('INFO', '加载外部 Telegram 配置', extTelegramConfigPath);
      }
    }
  } catch (e) {
    // 忽略外部配置加载错误
  }

  // 确保 services 存在
  if (!config.services) {
    config.services = {};
  }
  
  // 确保 notifications 是数组
  if (!config.services.notifications) {
    config.services.notifications = [];
  }
  if (!Array.isArray(config.services.notifications)) {
    config.services.notifications = [];
  }

  // 验证必需的配置字段
  if (!config.port || !config.host) {
    if (logger) {
      logger('ERROR', '配置文件缺少必需字段（port 或 host）');
    }
  }

  if (!Array.isArray(config.directories) || config.directories.length === 0) {
    if (logger) {
      logger('ERROR', '配置文件缺少有效的目录映射（directories）');
    }
    config.directories = defaultConfig.directories;
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
  defaultConfig
};
