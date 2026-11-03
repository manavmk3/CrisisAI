import { Router } from 'express';
import {
  createAssignment,
  getIncidentAssignments,
  getAssignmentById,
  updateAssignmentStatus,
  updateAssignment,
  updateResponderLocation,
  getMyAssignments,
  getAvailableResponders,
} from '../controllers/assignment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.get('/my', authenticate, authorize('volunteer', 'responder', 'authority', 'admin'), getMyAssignments);

router.get('/responders', authenticate, authorize('authority', 'admin'), getAvailableResponders);

router.post('/', authenticate, authorize('authority', 'admin'), createAssignment);

router.get('/:assignmentId', authenticate, getAssignmentById);

router.patch('/:assignmentId/status', authenticate, updateAssignmentStatus);

router.patch('/:assignmentId/location', authenticate, updateResponderLocation);

router.post('/:assignmentId/location', authenticate, updateResponderLocation);

router.patch('/:assignmentId', authenticate, authorize('authority', 'admin'), updateAssignment);

export default router;
