import { Router } from 'express';
import {
  createResource,
  getResources,
  getResourceById,
  updateResource,
  deleteResource,
} from '../controllers/resource.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const requireInventoryManager = (req, res, next) => {
  const allowed = ['authority', 'admin'];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Resource management requires one of the following roles: ${allowed.join(', ')}. Your current role is "${req.user?.role || 'unknown'}".`,
    });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only administrators can delete resources.',
    });
  }
  next();
};

const router = Router();

router.get('/', getResources);
router.get('/:id', getResourceById);

router.post('/', authenticate, requireInventoryManager, createResource);
router.patch('/:id', authenticate, requireInventoryManager, updateResource);

router.delete('/:id', authenticate, requireAdmin, deleteResource);

export default router;
