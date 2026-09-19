import { Router } from 'express';
import {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
} from '../controllers/incident.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', authenticate, createIncident);
router.get('/', getIncidents);
router.get('/:id', getIncidentById);
router.patch('/:id', authenticate, updateIncident);

export default router;
