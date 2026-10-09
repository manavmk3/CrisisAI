import { Router } from 'express';
import {
  allocateToIncident,
  getIncidentAllocations,
  getCandidatesForIncident,
  releaseAllocation,
} from '../controllers/allocation.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const requireAuthorityOrAdmin = (req, res, next) => {
  const allowed = ['authority', 'admin'];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Resource allocation requires one of the following roles: ${allowed.join(', ')}. Your current role is "${req.user?.role || 'unknown'}".`,
    });
  }
  next();
};

const router = Router();

router.post(
  '/incident/:id',
  authenticate,
  requireAuthorityOrAdmin,
  allocateToIncident
);

router.get('/incident/:id', authenticate, getIncidentAllocations);

router.get('/incident/:id/candidates', authenticate, getCandidatesForIncident);

router.post(
  '/:allocationId/release',
  authenticate,
  requireAuthorityOrAdmin,
  releaseAllocation
);

export default router;
export { requireAuthorityOrAdmin };
