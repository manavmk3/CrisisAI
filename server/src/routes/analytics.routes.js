import { Router } from 'express';
import {
  getOverview,
  getSeverity,
  getResources,
  getResponseTimes,
  getCategories,
  getDashboard,
} from '../controllers/analytics.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate, authorize('authority', 'admin'));

router.get('/overview', getOverview);
router.get('/severity', getSeverity);
router.get('/resources', getResources);
router.get('/response-times', getResponseTimes);
router.get('/categories', getCategories);
router.get('/dashboard', getDashboard);
router.get('/', getDashboard);

export default router;

