import { Router } from 'express';
import { getOpsMetrics, exportOpsMetrics } from '../controllers/opsController';

const router = Router();

router.get('/api/ops', getOpsMetrics);
router.get('/api/ops/export', exportOpsMetrics);

export default router;
