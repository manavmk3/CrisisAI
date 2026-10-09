import { Router } from 'express';
import {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
} from '../controllers/incident.controller.js';
import {
  allocateToIncident,
  getIncidentAllocations,
  getCandidatesForIncident,
} from '../controllers/allocation.controller.js';
import { requireAuthorityOrAdmin } from './allocation.routes.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', authenticate, createIncident);
router.get('/', getIncidents);
router.get('/:id', getIncidentById);
router.patch('/:id', authenticate, updateIncident);

router.post('/:id/allocate', authenticate, requireAuthorityOrAdmin, allocateToIncident);
router.get('/:id/allocations', getIncidentAllocations);
router.get('/:id/candidates', getCandidatesForIncident);

export default router;
