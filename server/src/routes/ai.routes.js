import { Router } from 'express';
import { analyzeEmergencyReport } from '../controllers/ai.controller.js';

const router = Router();

router.post('/analyze', analyzeEmergencyReport);

export default router;
