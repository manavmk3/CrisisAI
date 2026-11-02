import { Router } from 'express';
import {
  allocateToIncident,
  getIncidentAllocations,
  getCandidatesForIncident,
  releaseAllocation,
} from '../controllers/allocation.controller.js';
import { getNearbyResources } from '../controllers/nearbyResource.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.js';

const requireAuthorityOrAdmin = authorize('authority', 'admin');

const router = Router();

router.post(
  '/incident/:id',
  authenticate,
  requireAuthorityOrAdmin,
  allocateToIncident
);

router.get('/incident/:id', authenticate, getIncidentAllocations);

router.get('/incident/:id/candidates', authenticate, getCandidatesForIncident);

router.get(
  '/incident/:id/nearby-resources',
  authenticate,
  requireAuthorityOrAdmin,
  getNearbyResources
);

router.post(
  '/:allocationId/release',
  authenticate,
  requireAuthorityOrAdmin,
  releaseAllocation
);

export default router;
export { requireAuthorityOrAdmin };
