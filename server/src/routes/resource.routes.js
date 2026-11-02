import { Router } from 'express';
import {
  createResource,
  getResources,
  getResourceById,
  updateResource,
  deleteResource,
} from '../controllers/resource.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.js';

const requireInventoryManager = authorize('authority', 'admin');
const requireAdmin = authorize('admin');

const router = Router();

router.get('/', getResources);
router.get('/:id', getResourceById);

router.post('/', authenticate, requireInventoryManager, createResource);
router.patch('/:id', authenticate, requireInventoryManager, updateResource);

router.delete('/:id', authenticate, requireAdmin, deleteResource);

export default router;
