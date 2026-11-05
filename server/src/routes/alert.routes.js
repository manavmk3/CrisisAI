import { Router } from 'express';
import {
  getUserAlerts,
  getUnreadCount,
  markAlertAsRead,
  markAllAlertsAsRead,
  getAlertById,
} from '../controllers/alert.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/unread-count', authenticate, getUnreadCount);

router.patch('/read-all', authenticate, markAllAlertsAsRead);

router.get('/', authenticate, getUserAlerts);

router.get('/:alertId', authenticate, getAlertById);

router.patch('/:alertId/read', authenticate, markAlertAsRead);

export default router;

