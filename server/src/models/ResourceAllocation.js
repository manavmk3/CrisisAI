import mongoose from 'mongoose';

export const ALLOCATION_STATUSES = ['active', 'released', 'cancelled'];

const resourceAllocationSchema = new mongoose.Schema(
  {
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: [true, 'Incident reference is required'],
      index: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'Resource reference is required'],
      index: true,
    },
    resourceType: {
      type: String,
      required: [true, 'Resource type is required'],
    },
    requestedType: {
      type: String,
      default: '',
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer',
      },
    },
    status: {
      type: String,
      enum: {
        values: ALLOCATION_STATUSES,
        message: '{VALUE} is not a valid allocation status',
      },
      default: 'active',
      index: true,
    },
    allocatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      maxlength: [500, 'Notes cannot exceed 500 characters'],
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

export const ResourceAllocation = mongoose.model(
  'ResourceAllocation',
  resourceAllocationSchema
);

export default ResourceAllocation;
