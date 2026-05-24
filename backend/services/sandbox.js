import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * DockerSandboxManager handles the secure, sandboxed execution of contestant binaries.
 * Built using SOLID principles to isolate docker orchestration concerns.
 */
class DockerSandboxManager {
  // Strict Resource Limits (As per IICPC guidelines)
  static MEMORY_LIMIT = '512m';
  static CPU_LIMIT = '1';
  // static BASE_IMAGE = 'ubuntu:22.04';
   static BASE_IMAGE = 'iicpc-sandbox-base:latest'; 

  /**
   * Programmatically spins up a resource-constrained docker container using volume mounting.
   * Safe from Shell Injection Attacks by using spawn instead of exec.
   * 
   * @param {string} teamName - The name of the submitting team
   * @param {string} submissionId - A unique ID for the test run
   * @param {string} hostBinaryPath - Path to the statically compiled Linux binary
   * @returns {Promise<{containerName: string, containerId: string}>}
   */
  static async runContainer(teamName, submissionId, hostBinaryPath) {
    // 1. Sanitize the team name to create a safe, unique container ID
    const cleanTeamName = teamName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const containerName = `sandbox-${cleanTeamName}-${submissionId}`;

    // 2. Strict Check: Verify that the binary actually exists
    if (!fs.existsSync(hostBinaryPath)) {
      throw new Error(`Execution error: Binary not found at path: ${hostBinaryPath}`);
    }

    // 3. Security Check: Apply executable permissions (+x / 0755) on the host file
    try {
      fs.chmodSync(hostBinaryPath, 0o755); 
    } catch (chmodError) {
      console.warn(`[SANDBOX WARNING] Failed to set +x permission on host file. Running container might fail:`, chmodError);
    }

    // 4. Prepare Docker arguments as an array to guarantee parameter safety
    const args = [
      'run',
      '-d', // Background execution
      '--name', containerName,
      '--memory', this.MEMORY_LIMIT,
      '--cpus', this.CPU_LIMIT,
      '-v', `${path.resolve(hostBinaryPath)}:/app/my_engine`, // Injected volume
      this.BASE_IMAGE,
      '/app/my_engine' // Execute instantly
    ];

    return new Promise((resolve, reject) => {
      console.log(`[SANDBOX] Initializing isolated run: ${containerName}`);
      
      // Spawning the docker process securely
      const dockerProcess = spawn('docker', args);
      let stdout = '';
      let stderr = '';

      dockerProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      dockerProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      dockerProcess.on('close', (code) => {
        if (code === 0) {
          const containerId = stdout.trim();
          console.log(`[SANDBOX] Container started. Container ID: ${containerId}`);
          resolve({ containerName, containerId });
        } else {
          console.error(`[SANDBOX] Process failed. Code: ${code}. Error: ${stderr}`);
          reject(new Error(`Sandbox startup error: ${stderr.trim()}`));
        }
      });
    });
  }

  /**
   * Cleanly destroys and deletes the container to free RAM & CPU cores.
   * @param {string} containerName 
   */
  static async stopAndCleanup(containerName) {
    return new Promise((resolve) => {
      console.log(`[SANDBOX] Destroying resource limits cage: ${containerName}`);
      
      // Forcefully remove the container (-f stops and removes at the same time)
      const dockerProcess = spawn('docker', ['rm', '-f', containerName]);
      
      dockerProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`[SANDBOX] Cleanup complete for: ${containerName}`);
          resolve(true);
        } else {
          console.warn(`[SANDBOX] Failed to completely remove container: ${containerName}. May require manual docker cleanup.`);
          resolve(false);
        }
      });
    });
  }
}

export default DockerSandboxManager;