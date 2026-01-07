/**
 * 文件服务类
 * 
 * 原首页功能迁移到此服务，提供：
 * - 目录映射展示
 * - 文件浏览和下载
 * - Markdown 渲染
 * - 文件上传/删除 API
 */

const path = require('path');

/**
 * 文件服务类
 */
class FileService {
  constructor(config, appRoot, logger) {
    this.config = config;
    this.appRoot = appRoot;
    this.logger = logger;
  }
  
  /**
   * 获取配置数据（供前端使用）
   * 
   * @returns {Object} 配置对象
   */
  getConfig() {
    return {
      projectName: this.config.projectName || '本地文件服务器',
      directories: this.config.directories || []
    };
  }
}

module.exports = FileService;
