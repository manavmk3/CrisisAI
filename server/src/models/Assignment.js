import mongoose from 'mongoose';

export const ASSIGNMENT_STATUSES = [
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'completed',
  'cancelled',
];

const assignmentSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: [true, 'Incident reference is required'],
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      default: null,
      index: true,
    },
    responderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned by user is required'],
    },
    allocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ResourceAllocation',
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ASSIGNMENT_STATUSES,
        message: '{VALUE} is not a valid assignment status',
      },
      default: 'assigned',
      index: true,
    },
    ETA: {
      type: Number,
      min: [0, 'ETA must be a non-negative number'],
      default: null,
    },
    notes: {
      type: String,
      default: '',
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

assignmentSchema.pre('validate', function () {
  if (!this.resourceId && !this.responderId) {
    this.invalidate('resourceId', 'An assignment must have at least a resource or a responder.');
  }
});

assignmentSchema.index({ incidentId: 1, status: 1 });
assignmentSchema.index({ responderId: 1, status: 1 });
assignmentSchema.index({ resourceId: 1, status: 1 });
assignmentSchema.index({ createdAt: -1 });

export const Assignment = mongoose.model('Assignment', assignmentSchema);

export default Assignment;
