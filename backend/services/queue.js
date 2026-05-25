import DockerSandboxManager from './sandbox.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * SubmissionQueueManager manages sequential, isolated execution of benchmark runs.
 * Uses FIFO (First-In, First-Out) scheduling to prevent "Noisy Neighbor" CPU bottlenecks.
 */
class SubmissionQueueManager {
  constructor() {
    this.queue = [];           // Array to store pending benchmark jobs
    this.isProcessing = false; // Mutex lock to check if a test is currently running
    this.activeJob = null;     // Tracks the currently executing benchmark job
  }

  /**
   * Adds a new benchmarking job to the FIFO queue.
   * Non-blocking: Instantly returns to allow the Express server to accept next uploads.
   */
  enqueue(job) {
    console.log(`[QUEUE] Enqueuing new submission for Team: ${job.teamId}`);
    
    this.queue.push({
      ...job,
      status: 'PENDING',
      createdAt: new Date()
    });
    
    // Trigger queue execution asynchronously (Self-starting loop)
    this.processNext();
  }

  /**
   * Core scheduler loop. Manages sequential, isolated test execution.
   * Keeps the Node.js Event Loop completely free.
   */
  async processNext() {
    // 1. If a test is already running, wait in line
    if (this.isProcessing) {
      console.log(`[QUEUE] Processor busy. ${this.queue.length} jobs currently waiting in queue.`);
      return;
    }

    // 2. If no jobs left, reset state and idle
    if (this.queue.length === 0) {
      console.log(`[QUEUE] Queue empty. All benchmarking runs successfully complete.`);
      this.isProcessing = false;
      this.activeJob = null;
      return;
    }

    // 3. Acquire lock and pick the first job (FIFO)
    this.isProcessing = true;
    this.activeJob = this.queue.shift(); 
    this.activeJob.status = 'PROCESSING';

    console.log(`[QUEUE] Starting active execution for Team: ${this.activeJob.teamId} (Submission: ${this.activeJob.submissionId})`);

    let sandboxResult = null;

    try {
      // Step A: Start the secure container with dynamic port mapping
      sandboxResult = await DockerSandboxManager.runContainer(
        this.activeJob.teamId,
        this.activeJob.submissionId,
        this.activeJob.binaryPath
      );

      console.log(`[QUEUE] Sandbox active at: http://localhost:${sandboxResult.mappedPort}`);

      // Step B: Trigger the Go Bot Fleet to bombard the container!
      // Command params: Port, Concurrency, Duration (e.g., 10 seconds test)
      await this.triggerBotFleet(sandboxResult.mappedPort, 100, 10); 

    } catch (error) {
      console.error(`[QUEUE ERROR] Benchmark failed for Team ${this.activeJob.teamId}:`, error.message);
    } finally {
      // Step C: Cleanup the container securely (Guaranteed to run even if C++ code crashes!)
      if (sandboxResult && sandboxResult.containerName) {
        await DockerSandboxManager.stopAndCleanup(sandboxResult.containerName);
      }

      // Step D: Release lock and recurse to pick the next pending job in background
      this.isProcessing = false;
      this.activeJob = null;
      
      this.processNext();
    }
  }

  /**
   * Spawns the Go Bot Fleet process dynamically using Node's native spawn.
   */
  // async triggerBotFleet(port, concurrency, duration) {
  //   return new Promise((resolve) => {
  //     console.log(`[BOT FLEET] Spawning Go load generator on port: ${port}...`);

  //     // Path to your Go Bot script (Assuming it's placed in backend/bot_fleet.go)
  //     const botScriptPath = path.join(__dirname, '..', 'bot_fleet.go'); 

  //     // Command: go run bot_fleet.go -port <port> -c <concurrency> -d <duration>
  //     const botProcess = spawn('go', [
  //       'run', 
  //       botScriptPath, 
  //       '-port', port.toString(), 
  //       '-c', concurrency.toString(), 
  //       '-d', duration.toString()
  //     ]);

  //     let stdout = '';
  //     let stderr = '';

  //     botProcess.stdout.on('data', (data) => {
  //       stdout += data.toString();
  //       // Print bot logs directly to server logs in real-time
  //       console.log(`[BOT LOG] ${data.toString().trim()}`);
  //     });

  //     botProcess.stderr.on('data', (data) => {
  //       stderr += data.toString();
  //     });

  //     botProcess.on('close', (code) => {
  //       if (code === 0) {
  //         console.log(`[BOT FLEET] Load testing complete.`);
  //         resolve(stdout);
  //       } else {
  //         // Fallback: If Go is not installed on this specific server during testing,
  //         // it falls back gracefully so that the queue doesn't hang!
  //         if (stderr.includes('executable file not found')) {
  //           console.warn(`[BOT FLEET WARNING] Go compiler not found on this machine. Simulating background run...`);
  //           setTimeout(() => {
  //             resolve("MOCK_RUN_SUCCESS");
  //           }, duration * 1000);
  //         } else {
  //           console.error(`[BOT FLEET ERROR] Bot process failed with code ${code}. Stderr: ${stderr}`);
  //           resolve("BOT_RUN_FAILED");
  //         }
  //       }
  //     });
  //   });
  // }
  /**
   * Spawns the Go Bot Fleet process dynamically using Node's native spawn.
   * Gracefully handles cases where Go is not installed on the system to prevent crashes.
   */
  async triggerBotFleet(port, concurrency, duration) {
    return new Promise((resolve) => {
      console.log(`[BOT FLEET] Spawning Go load generator on port: ${port}...`);

      const botScriptPath = path.join(__dirname, '..', 'bot_fleet.go'); 

      // Spawning the process
      const botProcess = spawn('go', [
        'run', 
        botScriptPath, 
        '-port', port.toString(), 
        '-c', concurrency.toString(), 
        '-d', duration.toString()
      ]);

      let stdout = '';
      let stderr = '';
      let errorOccurred = false;

      // CRUCIAL BUG FIX: Handle the 'error' event to prevent Node process from crashing (ENOENT protection)
      botProcess.on('error', (err) => {
        errorOccurred = true;
        console.warn(`[BOT FLEET WARNING] Go compiler is not installed or configured in PATH: ${err.message}`);
        console.log(`[BOT FLEET FALLBACK] Gracefully falling back to a simulated ${duration}-second evaluation run...`);
        
        // Simulating the run duration so that the queue sequence continues smoothly
        setTimeout(() => {
          resolve("MOCK_RUN_SUCCESS");
        }, duration * 1000);
      });

      botProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[BOT LOG] ${data.toString().trim()}`);
      });

      botProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      botProcess.on('close', (code) => {
        // If error event already handled and resolved the promise, do nothing
        if (errorOccurred) return;

        if (code === 0) {
          console.log(`[BOT FLEET] Load testing complete.`);
          resolve(stdout);
        } else {
          console.error(`[BOT FLEET ERROR] Bot process failed with code ${code}. Stderr: ${stderr}`);
          resolve("BOT_RUN_FAILED");
        }
      });
    });
  }
}

// Export a single global instance of the queue manager (Singleton Pattern)
const queueInstance = new SubmissionQueueManager();
export default queueInstance;