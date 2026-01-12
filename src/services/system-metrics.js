/**
 * 系统监控服务（纯 Node 核心模块）
 *
 * 功能：周期采样 CPU/内存/磁盘/网速/温度（尽力）/Top 进程
 * 无第三方依赖，命令不可用时会自动降级为空数组/空值。
 */

const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

const platform = process.platform;

function execAsync(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true, timeout: 4000 }, (err, stdout) => {
      resolve({ err, stdout: stdout || '' });
    });
  });
}

class SystemMetricsService {
  constructor(config = {}, logger = null) {
    this.config = config;
    this.logger = logger;
    this.interval = null;
    this.listeners = new Set();
    this.history = [];
    this.lastNetSample = null;
    this.lastCpuSample = null;
    this.latest = null;
  }

  start() {
    if (this.interval) return;
    const ms = this.config.sampleIntervalMs || 1000;
    this._collectAndNotify();
    this.interval = setInterval(() => this._collectAndNotify(), ms);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.listeners.clear();
  }

  async getSnapshot() {
    if (this.latest) return this.latest;
    await this._collectAndNotify();
    return this.latest;
  }

  getHistory() {
    return this.history.slice();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    if (this.latest) {
      try { listener(this.latest); } catch (e) { /* ignore */ }
    }
    return () => this.listeners.delete(listener);
  }

  async _collectAndNotify() {
    try {
      const snapshot = await this._gatherMetrics();
      this.latest = snapshot;
      this._pushHistory(snapshot);
      this._notify(snapshot);
    } catch (err) {
      if (this.logger) {
        this.logger('WARN', '系统监控采样失败', err && err.message);
      }
    }
  }

  _notify(snapshot) {
    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch (e) {
        // 忽略监听器错误
      }
    }
  }

  _pushHistory(snapshot) {
    const windowMs = (this.config.historySeconds || 60) * 1000;
    const step = this.config.sampleIntervalMs || 1000;
    const max = Math.max(1, Math.floor(windowMs / step));
    this.history.push(snapshot);
    if (this.history.length > max) {
      this.history.splice(0, this.history.length - max);
    }
  }

  async _gatherMetrics() {
    const ts = Date.now();
    const [cpu, mem, disks, net, temp, top] = await Promise.all([
      this._getCpuLoad(ts),
      this._getMemory(),
      this._getDisks(),
      this._getNetwork(ts),
      this._getTemperature(),
      this._getTopProcesses()
    ]);

    return {
      ts,
      cpu,
      mem,
      disks,
      net,
      temp,
      top
    };
  }

  async _getCpuLoad(timestamp) {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) return { total: 0, perCore: [] };

    const current = cpus.map(c => ({ ...c.times }));
    if (!this.lastCpuSample) {
      this.lastCpuSample = { timestamp, times: current };
      return { total: 0, perCore: new Array(cpus.length).fill(0) };
    }

    const perCore = [];
    let totalSum = 0;
    for (let i = 0; i < cpus.length; i++) {
      const prev = this.lastCpuSample.times[i];
      const now = current[i];
      const idle = now.idle - prev.idle;
      const total = (now.user - prev.user) + (now.nice - prev.nice) + (now.sys - prev.sys) + (now.irq - prev.irq) + idle;
      const usage = total > 0 ? ((total - idle) / total) * 100 : 0;
      perCore.push(Number(usage.toFixed(1)));
      totalSum += usage;
    }

    this.lastCpuSample = { timestamp, times: current };
    return {
      total: Number((totalSum / perCore.length).toFixed(1)),
      perCore
    };
  }

  async _getMemory() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return { total, free, used };
  }

  async _getDisks() {
    try {
      if (platform === 'win32') {
        const { err, stdout } = await execAsync('wmic logicaldisk get Caption,FreeSpace,Size /format:list');
        if (err || !stdout) return [];
        const blocks = stdout.trim().split(/\n{2,}/);
        const disks = [];
        for (const block of blocks) {
          const lines = block.split(/\r?\n/);
          let name = '';
          let free = 0;
          let size = 0;
          for (const line of lines) {
            const [k, v] = line.split('=');
            if (k === 'Caption') name = v;
            if (k === 'FreeSpace') free = Number(v || 0);
            if (k === 'Size') size = Number(v || 0);
          }
          if (name) {
            disks.push({ name, total: size, free, used: size - free });
          }
        }
        return disks;
      }

      const { err, stdout } = await execAsync('df -kP');
      if (err || !stdout) return [];
      const lines = stdout.trim().split(/\r?\n/);
      const disks = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts.length < 6) continue;
        const total = Number(parts[1]) * 1024;
        const used = Number(parts[2]) * 1024;
        const avail = Number(parts[3]) * 1024;
        disks.push({ name: parts[5], total, used, free: avail });
      }
      return disks;
    } catch (e) {
      return [];
    }
  }

  async _getNetwork(timestamp) {
    try {
      if (platform === 'win32') {
        const { err, stdout } = await execAsync('netstat -e');
        if (err || !stdout) return null;
        const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let rx = 0;
        let tx = 0;
        for (const line of lines) {
          if (/Bytes/i.test(line)) {
            const nums = line.split(/\s+/).map(n => Number(n));
            if (nums.length >= 3) {
              rx = nums[nums.length - 2];
              tx = nums[nums.length - 1];
              break;
            }
          }
        }
        return this._netDelta(timestamp, { iface: 'default', rx, tx });
      }

      const data = fs.readFileSync('/proc/net/dev', 'utf8');
      const lines = data.trim().split(/\n/).slice(2);
      let ifaceName = this.config.netInterface || '';
      let rx = 0;
      let tx = 0;
      if (ifaceName) {
        const line = lines.find(l => l.trim().startsWith(ifaceName + ':'));
        if (line) {
          const parts = line.replace(/:/, ' ').trim().split(/\s+/);
          rx = Number(parts[1]);
          tx = Number(parts[9]);
        }
      }
      if (!ifaceName) {
        for (const line of lines) {
          const parts = line.replace(/:/, ' ').trim().split(/\s+/);
          const name = parts[0];
          if (name === 'lo') continue;
          ifaceName = name;
          rx = Number(parts[1]);
          tx = Number(parts[9]);
          break;
        }
      }
      if (!ifaceName) return null;
      return this._netDelta(timestamp, { iface: ifaceName, rx, tx });
    } catch (e) {
      return null;
    }
  }

  _netDelta(timestamp, sample) {
    if (!this.lastNetSample) {
      this.lastNetSample = { ...sample, ts: timestamp };
      return { iface: sample.iface, rxKBps: 0, txKBps: 0 };
    }
    const deltaMs = Math.max(1, timestamp - this.lastNetSample.ts);
    const rxKBps = ((sample.rx - this.lastNetSample.rx) / deltaMs) * (1000 / 1024);
    const txKBps = ((sample.tx - this.lastNetSample.tx) / deltaMs) * (1000 / 1024);
    this.lastNetSample = { ...sample, ts: timestamp };
    return {
      iface: sample.iface,
      rxKBps: Number(rxKBps.toFixed(1)),
      txKBps: Number(txKBps.toFixed(1))
    };
  }

  async _getTemperature() {
    try {
      if (platform === 'win32') {
        const { err, stdout } = await execAsync('wmic /namespace:"\\\\root\\wmi" PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature');
        if (err || !stdout) return null;
        const lines = stdout.trim().split(/\r?\n/).slice(1).map(l => l.trim()).filter(Boolean);
        const temps = lines.map(v => {
          const val = Number(v);
          if (!val) return null;
          const c = (val / 10) - 273.15;
          return { label: 'CPU', celsius: Number(c.toFixed(1)) };
        }).filter(Boolean);
        return temps.length ? temps : null;
      }

      const base = '/sys/class/thermal';
      if (!fs.existsSync(base)) return null;
      const entries = fs.readdirSync(base).filter(name => name.startsWith('thermal_zone'));
      const temps = [];
      for (const zone of entries) {
        const tPath = `${base}/${zone}/temp`;
        if (!fs.existsSync(tPath)) continue;
        const raw = fs.readFileSync(tPath, 'utf8').trim();
        const v = Number(raw) / 1000;
        if (!Number.isNaN(v)) {
          temps.push({ label: zone, celsius: Number(v.toFixed(1)) });
        }
      }
      return temps.length ? temps : null;
    } catch (e) {
      return null;
    }
  }

  async _getTopProcesses() {
    const limit = this.config.topN || 5;
    try {
      if (platform === 'win32') {
        const { err, stdout } = await execAsync('wmic path Win32_PerfFormattedData_PerfProc_Process get IDProcess,Name,PercentProcessorTime,WorkingSet /format:csv');
        if (err || !stdout) return [];
        const lines = stdout.trim().split(/\r?\n/).slice(1);
        const rows = [];
        const cores = Math.max(1, os.cpus()?.length || 1);
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length < 4) continue;
          // CSV 顺序: Node,IDProcess,Name,PercentProcessorTime,WorkingSet
          const pid = Number(parts[1]);
          const name = parts[2];
          if (!name) continue;
          const lower = name.toLowerCase();
          if (lower === 'idle' || lower === '_total') continue;
          const cpuRaw = Number(parts[3]);
          const cpu = Number(((cpuRaw || 0) / cores).toFixed(1));
          const memBytes = Number(parts[4]);
          rows.push({ pid, name, cpu, memMB: Number(((memBytes || 0) / 1024 / 1024).toFixed(1)) });
        }
        rows.sort((a, b) => b.cpu - a.cpu);
        return rows.slice(0, limit);
      }

      const { err, stdout } = await execAsync(`ps -eo pid,comm,pcpu,pmem --sort=-pcpu | head -n ${limit + 1}`);
      if (err || !stdout) return [];
      const lines = stdout.trim().split(/\r?\n/).slice(1);
      const rows = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[0]);
        const name = parts[1];
        const cpu = Number(parts[2]);
        const mem = Number(parts[3]);
        return { pid, name, cpu: Number((cpu || 0).toFixed(1)), memMB: Number(mem || 0) };
      });
      return rows.slice(0, limit);
    } catch (e) {
      return [];
    }
  }
}

module.exports = SystemMetricsService;
