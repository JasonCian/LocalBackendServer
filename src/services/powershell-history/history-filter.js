/**
 * PowerShell 命令历史过滤引擎
 * 
 * 提供命令过滤、掩盖、去重等功能
 */

/**
 * 历史过滤器类
 */
class HistoryFilter {
  constructor(rules) {
    this.rules = rules || [];
  }

  /**
   * 更新规则
   * 
   * @param {Array} rules - 规则数组
   */
  updateRules(rules) {
    this.rules = rules;
  }

  /**
   * 应用所有过滤规则
   * 
   * @param {Array} commands - 命令列表
   * @returns {Object} {filtered, removed, masked}
   */
  applyFilters(commands) {
    let filtered = [...commands];
    const removed = [];
    const masked = [];

    // 遍历每条命令，应用所有启用的规则
    filtered = filtered.map(cmd => {
      // 检查是否需要移除
      for (const rule of this.rules) {
        if (!rule.enabled || rule.action !== 'remove') continue;
        
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(cmd)) {
            removed.push({ command: cmd, rule: rule.name, ruleId: rule.id });
            return null; // 标记为待移除
          }
        } catch (err) {
          console.error(`规则 ${rule.name} 的正则表达式无效:`, err.message);
        }
      }
      
      // 检查是否需要掩盖（复用 filterCommand 的逻辑）
      const filterResult = this.filterCommand(cmd);
      if (filterResult.mask) {
        masked.push({
          original: cmd,
          masked: filterResult.maskedCommand,
          rule: filterResult.ruleName,
          ruleId: filterResult.ruleId,
          maskMode: filterResult.maskMode
        });
        return filterResult.maskedCommand;
      }
      
      return cmd;
    }).filter(cmd => cmd !== null); // 移除标记为 null 的命令

    return { filtered, removed, masked };
  }

  /**
   * 去重处理
   * 
   * @param {Array} commands - 命令列表
   * @param {Object} dedupConfig - 去重配置
   * @returns {Array} 去重后的命令列表
   */
  deduplicate(commands, dedupConfig) {
    if (!dedupConfig || !dedupConfig.enabled) {
      return commands;
    }

    const patterns = dedupConfig.patterns || [];
    const seen = new Map();
    const result = [];

    for (const cmd of commands) {
      // 检查是否匹配去重模式
      const matchedPattern = patterns.find(p => {
        try {
          return new RegExp(p, 'i').test(cmd);
        } catch (e) {
          return false;
        }
      });

      const key = matchedPattern ? matchedPattern : cmd;

      if (!seen.has(key)) {
        seen.set(key, true);
        result.push(cmd);
      }
    }

    return result;
  }

  /**
   * 过滤单条命令
   * 
   * @param {string} command - 命令字符串
   * @returns {Object} {mask: boolean, maskedCommand?: string, maskReason?: string}
   */
  filterCommand(command) {
    for (const rule of this.rules) {
      if (!rule.enabled || rule.action !== 'mask') continue;

      try {
        const regex = new RegExp(rule.pattern, 'i');
        const match = regex.exec(command);
        
        if (match) {
          const maskMode = rule.maskMode || 'strong'; // weak=用*, strong=[MASKED]
          const maskGroup = rule.maskGroup || 0; // 0=全匹配，1+=指定分组
          
          let maskedCommand;
          if (maskMode === 'weak') {
            // 弱掩盖：用*替换，保留位数
            maskedCommand = command.replace(regex, (matched, ...groups) => {
              const target = maskGroup > 0 && groups[maskGroup - 1] ? groups[maskGroup - 1] : matched;
              const stars = '*'.repeat(target.length);
              if (maskGroup > 0 && groups[maskGroup - 1]) {
                // 只替换指定分组
                return matched.replace(groups[maskGroup - 1], stars);
              }
              return stars;
            });
          } else {
            // 强掩盖：用[MASKED]替换整段
            maskedCommand = command.replace(regex, (matched, ...groups) => {
              if (maskGroup > 0 && groups[maskGroup - 1]) {
                // 只替换指定分组
                return matched.replace(groups[maskGroup - 1], '[MASKED]');
              }
              return '[MASKED]';
            });
          }
          
          return { 
            mask: true, 
            maskedCommand, 
            maskReason: rule.name,
            maskMode: maskMode,
            ruleId: rule.id,
            ruleName: rule.name 
          };
        }
      } catch (err) {
        // 正则表达式错误，跳过此规则
        console.error(`规则 ${rule.name} 的正则表达式无效:`, err.message);
      }
    }

    // 没有匹配任何规则
    return { mask: false };
  }

  /**
   * 测试单个命令是否匹配规则
   * 
   * @param {string} command - 命令
   * @param {string} ruleId - 规则ID
   * @returns {Object} {matched, action, result}
   */
  testRule(command, ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    
    if (!rule) {
      return { matched: false, error: '规则不存在' };
    }

    try {
      const regex = new RegExp(rule.pattern, 'i');
      const matched = regex.test(command);

      let result = command;
      if (matched) {
        if (rule.action === 'remove') {
          result = '[REMOVED]';
        } else if (rule.action === 'mask') {
          result = command.replace(regex, '[MASKED]');
        }
      }

      return { matched, action: rule.action, result };
    } catch (err) {
      return { matched: false, error: err.message };
    }
  }
}

module.exports = HistoryFilter;
