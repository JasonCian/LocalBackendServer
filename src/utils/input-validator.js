/**
 * 输入验证工具
 * 
 * 功能：
 * - 常见数据类型验证
 * - 安全性检查
 * - 错误提示
 */

const path = require('path');

/**
 * 输入验证类
 */
class InputValidator {
  /**
   * 验证电话号码格式
   * 
   * @param {string} phone - 电话号码
   * @returns {string} 规范化后的电话号码
   * @throws {Error} 如果格式无效
   */
  static validatePhone(phone) {
    const phoneStr = String(phone || '').trim();

    // 允许的格式：数字、+、-、()、空格
    if (!/^[0-9+\-() ]{7,20}$/.test(phoneStr)) {
      throw new Error('电话号码格式无效（7-20 个字符，仅允许数字、+、-、() 和空格）');
    }

    // 检查至少有 7 个数字
    const digitCount = (phoneStr.match(/\d/g) || []).length;
    if (digitCount < 7) {
      throw new Error('电话号码至少需要 7 个数字');
    }

    return phoneStr;
  }

  /**
   * 验证 Cron 表达式（6 字段格式）
   * 
   * @param {string} cron - Cron 表达式
   * @returns {string} 验证通过的 Cron 表达式
   * @throws {Error} 如果格式无效
   */
  static validateCron(cron) {
    const cronStr = String(cron || '').trim();
    const fields = cronStr.split(' ');

    if (fields.length !== 6) {
      throw new Error('Cron 表达式必须是 6 个字段（秒 分 时 日 月 周）');
    }

    const [second, minute, hour, day, month, dow] = fields;

    // 验证每个字段
    const validations = [
      { field: second, name: '秒', min: 0, max: 59 },
      { field: minute, name: '分', min: 0, max: 59 },
      { field: hour, name: '时', min: 0, max: 23 },
      { field: day, name: '日', min: 1, max: 31 },
      { field: month, name: '月', min: 1, max: 12 },
      { field: dow, name: '周', min: 0, max: 6 }
    ];

    for (const { field, name, min, max } of validations) {
      if (!this._isValidCronField(field, min, max)) {
        throw new Error(`Cron ${name}字段无效（${field}）`);
      }
    }

    return cronStr;
  }

  /**
   * 验证单个 Cron 字段
   * @private
   */
  static _isValidCronField(field, min, max) {
    // 通配符
    if (field === '*' || field === '?') return true;

    // 单个数字
    if (/^\d+$/.test(field)) {
      const num = parseInt(field);
      return num >= min && num <= max;
    }

    // 范围（例：0-30）
    if (/^\d+-\d+$/.test(field)) {
      const [start, end] = field.split('-').map(Number);
      return start >= min && end <= max && start < end;
    }

    // 步长（例：*/5, 0-30/10）
    if (field.includes('/')) {
      const [range, step] = field.split('/');
      if (!/^\d+$/.test(step) || parseInt(step) <= 0) return false;

      if (range === '*') return true;

      if (/^\d+-\d+$/.test(range)) {
        const [start, end] = range.split('-').map(Number);
        return start >= min && end <= max && start < end;
      }

      return false;
    }

    // 列表（例：1,3,5）
    if (field.includes(',')) {
      return field.split(',').every(f => {
        const num = parseInt(f);
        return !isNaN(num) && num >= min && num <= max;
      });
    }

    return false;
  }

  /**
   * 验证文件路径（防止路径遍历）
   * 
   * @param {string} filePath - 文件路径
   * @param {string} baseDir - 基础目录
   * @returns {string} 规范化后的路径
   * @throws {Error} 如果存在安全风险
   */
  static validateFilePath(filePath, baseDir) {
    const normalized = path.normalize(filePath);
    const absolute = path.resolve(baseDir, normalized);
    const baseAbsolute = path.resolve(baseDir);

    // 检查是否试图跳出基础目录
    if (!absolute.startsWith(baseAbsolute)) {
      throw new Error('路径遍历攻击已阻止');
    }

    // 检查是否包含危险的特殊字符
    if (/[<>"|?*]/.test(normalized)) {
      throw new Error('文件路径包含非法字符');
    }

    return absolute;
  }

  /**
   * 验证 URL 和路径
   * 
   * @param {string} url - URL 或路径
   * @returns {string} 规范化后的 URL
   * @throws {Error} 如果格式无效
   */
  static validateURL(url) {
    const urlStr = String(url || '').trim();

    // 检查为空
    if (!urlStr) {
      throw new Error('URL 不能为空');
    }

    // 检查长度
    if (urlStr.length > 2048) {
      throw new Error('URL 过长（最多 2048 字符）');
    }

    // 基本 URL 格式检查
    try {
      new URL(urlStr, 'http://localhost');
    } catch (e) {
      // 允许相对路径
      if (!urlStr.startsWith('/') && !urlStr.startsWith('.')) {
        throw new Error('URL 格式无效');
      }
    }

    return urlStr;
  }

  /**
   * 验证频道名称（Telegram）
   * 
   * @param {string} channel - 频道名称
   * @returns {string} 规范化后的频道名称
   * @throws {Error} 如果格式无效
   */
  static validateTelegramChannel(channel) {
    const channelStr = String(channel || '').trim();

    // 检查为空
    if (!channelStr) {
      throw new Error('频道名称不能为空');
    }

    // 检查长度
    if (channelStr.length > 256) {
      throw new Error('频道名称过长');
    }

    // 检查格式：@ 开头或纯数字（频道 ID）
    if (!/^(@[a-zA-Z0-9_]+|-?\d+)$/.test(channelStr)) {
      throw new Error('频道名称格式无效（应为 @name 或数字 ID）');
    }

    return channelStr;
  }

  /**
   * 验证消息内容
   * 
   * @param {string} message - 消息
   * @param {number} maxLength - 最大长度
   * @returns {string} 规范化后的消息
   * @throws {Error} 如果格式无效
   */
  static validateMessage(message, maxLength = 4096) {
    const msgStr = String(message || '').trim();

    if (!msgStr) {
      throw new Error('消息不能为空');
    }

    if (msgStr.length > maxLength) {
      throw new Error(`消息过长（最多 ${maxLength} 字符）`);
    }

    return msgStr;
  }

  /**
   * 验证 JSON 字符串
   * 
   * @param {string} jsonStr - JSON 字符串
   * @returns {Object} 解析后的对象
   * @throws {Error} 如果 JSON 格式无效
   */
  static validateJSON(jsonStr) {
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`JSON 格式无效: ${e.message}`);
    }
  }

  /**
   * 验证整数
   * 
   * @param {any} value - 值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 验证通过的整数
   * @throws {Error} 如果验证失败
   */
  static validateInteger(value, min = -Infinity, max = Infinity) {
    const num = parseInt(value);

    if (isNaN(num)) {
      throw new Error('必须是整数');
    }

    if (num < min || num > max) {
      throw new Error(`值必须在 ${min} 和 ${max} 之间`);
    }

    return num;
  }

  /**
   * 验证布尔值
   * 
   * @param {any} value - 值
   * @returns {boolean} 验证通过的布尔值
   * @throws {Error} 如果验证失败
   */
  static validateBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;

    throw new Error('必须是布尔值（true/false）');
  }
}

module.exports = InputValidator;
