import mongoose from 'mongoose';

export const ALERT_TYPES = [
  'critical_incident',
  'incident_verified',
  'assignment_created',
  'assignment_declined',
  'incident_resolved',
];

const alertSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient reference is required'],
      index: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: [true, 'Incident reference is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Alert type is required'],
      enum: {
        values: ALERT_TYPES,
        message: '{VALUE} is not a valid alert type',
      },
      index: true,
    },
    message: {
      type: String,
      required: [true, 'Alert message is required'],
      trim: true,
      minlength: [1, 'Alert message cannot be empty'],
      maxlength: [1000, 'Alert message cannot exceed 1000 characters'],
    },
    readStatus: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
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

alertSchema.index({ recipient: 1, readStatus: 1, createdAt: -1 });
alertSchema.index({ recipient: 1, incidentId: 1, type: 1 });
alertSchema.index({ createdAt: -1 });

export const Alert = mongoose.model('Alert', alertSchema);

export default Alert;

