import mongoose from 'mongoose';
import {
  CATEGORIES,
  SEVERITY_LEVELS,
  URGENCY_LEVELS,
  REQUIRED_RESOURCES,
} from '../services/aiIncidentSchema.js';

export const INCIDENT_STATUSES = [
  'reported',
  'under_review',
  'assigned',
  'resolved',
  'cancelled',
];

const incidentSchema = new mongoose.Schema(
  {
    report: {
      type: String,
      required: [true, 'Report description is required'],
      trim: true,
      maxlength: [5000, 'Report cannot exceed 5000 characters'],
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporter reference is required'],
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: CATEGORIES,
        message: '{VALUE} is not a valid category',
      },
    },
    severity: {
      type: String,
      required: [true, 'Severity is required'],
      enum: {
        values: SEVERITY_LEVELS,
        message: '{VALUE} is not a valid severity level',
      },
    },
    peopleAffected: {
      type: Number,
      default: null,
      min: [0, 'peopleAffected cannot be negative'],
    },
    injuries: {
      type: Number,
      default: null,
      min: [0, 'injuries cannot be negative'],
    },
    urgency: {
      type: String,
      required: [true, 'Urgency is required'],
      enum: {
        values: URGENCY_LEVELS,
        message: '{VALUE} is not a valid urgency level',
      },
    },
    location: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Location cannot exceed 500 characters'],
    },
    locationClue: {
      type: String,
      default: null,
    },
    coordinates: {
      latitude: {
        type: Number,
        default: null,
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90'],
      },
      longitude: {
        type: Number,
        default: null,
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180'],
      },
    },
    requiredResources: [
      {
        type: String,
        enum: {
          values: REQUIRED_RESOURCES,
          message: '{VALUE} is not a valid resource',
        },
      },
    ],
    summary: {
      type: String,
      required: [true, 'Summary is required'],
      trim: true,
    },
    aiConfidence: {
      type: Number,
      required: [true, 'aiConfidence is required'],
      min: [0, 'aiConfidence must be between 0 and 1'],
      max: [1, 'aiConfidence must be between 0 and 1'],
    },
    priorityScore: {
      type: Number,
      required: [true, 'priorityScore is required'],
      min: [0, 'priorityScore must be between 0 and 100'],
      max: [100, 'priorityScore must be between 0 and 100'],
      index: true,
    },
    priorityBreakdown: {
      severity: { type: Number, default: 0 },
      affectedPopulation: { type: Number, default: 0 },
      vulnerability: { type: Number, default: 0 },
      resourceShortage: { type: Number, default: 0 },
      timeSensitivity: { type: Number, default: 0 },
      confidence: { type: Number, default: 0 },
      locationContext: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: {
        values: INCIDENT_STATUSES,
        message: '{VALUE} is not a valid incident status',
      },
      default: 'reported',
      index: true,
    },
    possibleDuplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
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

export const Incident = mongoose.model('Incident', incidentSchema);

export default Incident;
