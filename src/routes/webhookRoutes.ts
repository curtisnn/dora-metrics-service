import { Router } from 'express';
import {
  handleGitHubWebhook,
  handleDeploymentEvent,
  handleIncidentEvent,
} from '../controllers/webhookController';
import {
  verifyGitHubSignature,
  extractGitHubMetadata,
} from '../middleware/githubWebhook';

const router = Router();

// GitHub webhook with signature verification and metadata extraction
router.post(
  '/webhooks/github',
  extractGitHubMetadata,
  verifyGitHubSignature,
  handleGitHubWebhook
);

// Custom event endpoints (no GitHub verification needed)
router.post('/events/deployment', handleDeploymentEvent);
router.post('/events/incident', handleIncidentEvent);

export default router;
