import { Router } from 'express';
import { getDashboardData } from '../controllers/dashboardController';

const router = Router();

/**
 * GET /api/dashboard
 * Returns DORA metrics for dashboard visualization
 */
router.get('/', getDashboardData);

export default router;
