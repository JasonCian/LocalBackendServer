/**
 * Multipart 表单解析中间件
 * 
 * 解析 multipart/form-data 格式的表单数据
 * 主要用于文件上传功能，支持：
 * - UTF-8 编码的文件名（RFC 5987）
 * - 多文件上传
 * - 表单字段解析
 */

const querystring = require('querystring');
const MAX_BODY_SIZE = 80 * 1024 * 1024; // 80MB 防御性上限

/**
 * 解析 JSON 或表单编码的请求体
 * 
 * @param {http.IncomingMessage} req - HTTP 请求对象
 * @returns {Promise<Object|string>} 解析后的数据对象或原始字符串
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // 防御：超过 10MB 直接拒绝
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        if (!body) return resolve({});

        const contentType = (req.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('application/x-www-form-urlencoded')) {
          return resolve(querystring.parse(body));
        }

        // 尝试 JSON 解析
        try {
          return resolve(JSON.parse(body));
        } catch (_) {
          // 如果是纯字符串，仍返回
          return resolve(body);
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * 解析 multipart/form-data 请求
 * 正确处理 UTF-8 编码的文件名
 * 
 * @param {http.IncomingMessage} req - HTTP 请求对象
 * @returns {Promise<Object>} 返回 {fields: Object, files: Array}
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];
    
    if (!boundary) {
      reject(new Error('无效的 boundary'));
      return;
    }
    
    let data = Buffer.alloc(0);
    
    req.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length > MAX_BODY_SIZE) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    
    req.on('end', () => {
      const parts = data.toString('binary').split('--' + boundary);
      const fields = {};
      const files = [];
      
      for (let i = 1; i < parts.length - 1; i++) {
        const part = parts[i];
        const isFile = part.includes('filename=');
        
        if (isFile) {
          let filename = 'unknown';
          
          // 尝试从 filename*= 获取 UTF-8 编码的文件名（RFC 5987）
          const filenameStarMatch = part.match(/filename\*=(?:UTF-8'')?([^\r\n;]+)/);
          if (filenameStarMatch) {
            try {
              // 解码百分比编码
              filename = decodeURIComponent(filenameStarMatch[1]);
            } catch (e) {
              // 如果解码失败，尝试直接使用
              filename = filenameStarMatch[1];
            }
          } else {
            // 尝试从标准 filename= 获取（可能是UTF-8编码的二进制数据）
            const filenameMatch = part.match(/filename="([^"]*)"/s);
            if (filenameMatch) {
              const rawFilename = filenameMatch[1];
              // 尝试将二进制字符串转换为UTF-8
              try {
                filename = Buffer.from(rawFilename, 'binary').toString('utf-8');
              } catch (e) {
                filename = rawFilename;
              }
            }
          }
          
          const fileContentStart = part.indexOf('\r\n\r\n') + 4;
          const fileContentEnd = part.lastIndexOf('\r\n');
          const fileContent = part.slice(fileContentStart, fileContentEnd);
          
          files.push({
            filename: filename,
            content: Buffer.from(fileContent, 'binary'),
            size: fileContent.length
          });
        } else {
          // 解析表单字段
          const nameMatch = part.match(/name="([^"]+)"/);
          if (nameMatch) {
            const fieldName = nameMatch[1];
            const fieldStart = part.indexOf('\r\n\r\n') + 4;
            const fieldEnd = part.lastIndexOf('\r\n');
            const fieldValue = part.slice(fieldStart, fieldEnd);
            fields[fieldName] = fieldValue;
          }
        }
      }
      
      resolve({ fields, files });
    });
    
    req.on('error', reject);
  });
}

module.exports = {
  parseJsonBody,
  parseMultipart
};
