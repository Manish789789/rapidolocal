#!/usr/bin/env bun

/**
 * Memory Monitoring Script for RapidoRide Backend
 * 
 * Usage: bun run monitor-memory.ts [--interval=5000] [--threshold=80]
 */

interface MemoryStats {
  timestamp: Date;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  heapUtilization: number;
}

class MemoryMonitor {
  private stats: MemoryStats[] = [];
  private interval: number;
  private thresholdPercent: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(interval = 5000, thresholdPercent = 80) {
    this.interval = interval;
    this.thresholdPercent = thresholdPercent;
  }

  start() {
    console.log(`🔍 Starting memory monitoring (interval: ${this.interval}ms, threshold: ${this.thresholdPercent}%)`);
    
    this.intervalId = setInterval(() => {
      this.collectStats();
    }, this.interval);

    // Collect initial stats
    this.collectStats();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('📊 Memory monitoring stopped');
    }
  }

  private collectStats() {
    const memUsage = process.memoryUsage();
    const heapUtilization = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    const stats: MemoryStats = {
      timestamp: new Date(),
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      heapUtilization
    };

    this.stats.push(stats);

    // Keep only last 100 records to prevent memory buildup in monitor
    if (this.stats.length > 100) {
      this.stats.shift();
    }

    this.logStats(stats);
    this.checkThresholds(stats);
  }

  private logStats(stats: MemoryStats) {
    const { timestamp, heapUtilization } = stats;
    const rss = this.formatBytes(stats.rss);
    const heapTotal = this.formatBytes(stats.heapTotal);
    const heapUsed = this.formatBytes(stats.heapUsed);
    const external = this.formatBytes(stats.external);

    console.log(
      `[${timestamp.toISOString()}] RSS: ${rss} | Heap: ${heapUsed}/${heapTotal} (${heapUtilization.toFixed(1)}%) | External: ${external}`
    );
  }

  private checkThresholds(stats: MemoryStats) {
    if (stats.heapUtilization > this.thresholdPercent) {
      console.warn(`⚠️  HIGH MEMORY USAGE: ${stats.heapUtilization.toFixed(1)}% (threshold: ${this.thresholdPercent}%)`);
      
      // Trigger garbage collection if available
      if ((globalThis as any).gc) {
        console.log('🗑️  Triggering garbage collection...');
        (globalThis as any).gc();
      } else {
        console.log('💡 Tip: Run with --expose-gc flag to enable manual garbage collection');
      }
    }
  }

  private formatBytes(bytes: number): string {
    const MB = bytes / (1024 * 1024);
    return `${MB.toFixed(1)}MB`;
  }

  getAverageStats(): Partial<MemoryStats> | null {
    if (this.stats.length === 0) return null;

    const totals = this.stats.reduce(
      (acc, stat) => ({
        rss: acc.rss + stat.rss,
        heapTotal: acc.heapTotal + stat.heapTotal,
        heapUsed: acc.heapUsed + stat.heapUsed,
        external: acc.external + stat.external,
        heapUtilization: acc.heapUtilization + stat.heapUtilization
      }),
      { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, heapUtilization: 0 }
    );

    const count = this.stats.length;
    return {
      rss: totals.rss / count,
      heapTotal: totals.heapTotal / count,
      heapUsed: totals.heapUsed / count,
      external: totals.external / count,
      heapUtilization: totals.heapUtilization / count
    };
  }

  printSummary() {
    const avg = this.getAverageStats();
    if (!avg) {
      console.log('No stats collected yet');
      return;
    }

    console.log('\n📈 MEMORY USAGE SUMMARY:');
    console.log('========================');
    console.log(`Average RSS: ${this.formatBytes(avg.rss!)}`);
    console.log(`Average Heap Total: ${this.formatBytes(avg.heapTotal!)}`);
    console.log(`Average Heap Used: ${this.formatBytes(avg.heapUsed!)}`);
    console.log(`Average External: ${this.formatBytes(avg.external!)}`);
    console.log(`Average Heap Utilization: ${avg.heapUtilization!.toFixed(1)}%`);
    
    if (this.stats.length > 1) {
      const first = this.stats[0];
      const last = this.stats[this.stats.length - 1];
      const growth = ((last.heapUsed - first.heapUsed) / first.heapUsed) * 100;
      
      console.log(`Heap Growth: ${growth.toFixed(2)}%`);
      
      if (growth > 10) {
        console.warn('⚠️  Potential memory leak detected (>10% growth)');
      }
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let interval = 5000;
let threshold = 80;

for (const arg of args) {
  if (arg.startsWith('--interval=')) {
    interval = parseInt(arg.split('=')[1]) || 5000;
  } else if (arg.startsWith('--threshold=')) {
    threshold = parseInt(arg.split('=')[1]) || 80;
  }
}

// Create and start monitor
const monitor = new MemoryMonitor(interval, threshold);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down memory monitor...');
  monitor.stop();
  monitor.printSummary();
  process.exit(0);
});

process.on('SIGTERM', () => {
  monitor.stop();
  monitor.printSummary();
  process.exit(0);
});

// Start monitoring
monitor.start();

// Print summary every 60 seconds
setInterval(() => {
  monitor.printSummary();
}, 60000);

console.log('Press Ctrl+C to stop monitoring and see summary');
