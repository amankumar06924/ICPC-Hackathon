import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import upload from '../middleware/upload.js'; 
import FileSanitizer from '../utils/sanitizer.js';
import { verifyToken } from '../auth/middleware.js'; 

// Import your newly created Sandbox Manager
import DockerSandboxManager from '../services/sandbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

/**
 * POST /api/v1/submissions/submit
 * Accepts compiled binary, sanitizes it, and spins up a Docker Sandbox for testing.
 */
router.post('/submit', verifyToken, upload.single('submission_file'), async (req, res) => {
  let tempPath;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No binary file uploaded.' });
    }

    tempPath = req.file.path;
    let safeName;

    try {
      // 1. Sanitize file name
      safeName = FileSanitizer.sanitizeFilename(req.file.originalname);
    } catch (sanitizationError) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      return res.status(400).json({ success: false, error: sanitizationError.message });
    }

    const finalPath = path.join(__dirname, '..', 'uploads', safeName);

    // 2. Save binary permanently
    fs.renameSync(tempPath, finalPath);

    const teamId = req.user?.uid || 'anonymous';
    const submissionId = Date.now().toString(); // Temporary mock submission ID

    // 3. TRIGGER DOCKER SANDBOX (Non-blocking background run)
    // We don't block the HTTP response. We start the container and instantly return success.
    DockerSandboxManager.runContainer(teamId, submissionId, finalPath)
      .then(async (sandboxResult) => {
        console.log(`[SYSTEM] Testing started on sandbox: ${sandboxResult.containerName}`);
        
        // TODO: Iske baad humara Bot Fleet is containerName ke port par orders bhejega.
        
        // Simulating 10 seconds benchmark run, then we cleanup the container automatically
        setTimeout(async () => {
          await DockerSandboxManager.stopAndCleanup(sandboxResult.containerName);
        }, 10000); // 10 seconds of evaluation cage
      })
      .catch((sandboxError) => {
        console.error(`[CRITICAL ERROR] Failed to run binary inside sandbox:`, sandboxError.message);
      });

    // Instant response to frontend for highly interactive UI
    return res.status(201).json({
      success: true,
      message: 'Binary successfully submitted, verified and spawned in a secure Sandbox.',
      payload: {
        filename: safeName,
        teamId: teamId,
        submittedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Upload & Spawning route error:', error);
    // Cleanup on failures
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    return res.status(500).json({ success: false, error: 'Internal sandbox processing error.' });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

export default router;