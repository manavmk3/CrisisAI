import { Router } from 'express';
import { analyzeEmergencyReport } from '../controllers/ai.controller.js';
import {
  getSituationSummary,
  generateSituationSummary,
} from '../controllers/situationSummary.controller.js';
import { getRecommendedActions } from '../controllers/recommendedActions.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.post('/analyze', analyzeEmergencyReport);

router.get('/situation-summary', authenticate, authorize('authority', 'admin'), getSituationSummary);
router.post('/situation-summary/generate', authenticate, authorize('authority', 'admin'), generateSituationSummary);
router.get('/recommended-actions', authenticate, authorize('authority', 'admin'), getRecommendedActions);

export default router;
