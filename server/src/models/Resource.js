import mongoose from 'mongoose';

export const RESOURCE_TYPES = [
  'ambulance',
  'medical_team',
  'fire_rescue',
  'search_rescue',
  'food',
  'drinking_water',
  'shelter',
  'rescue_boat',
  'police',
  'evacuation_team',
];

export const RESOURCE_STATUSES = ['available', 'deployed', 'maintenance'];

const resourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Resource name is required'],
      trim: true,
      minlength: [2, 'Resource name must be at least 2 characters'],
      maxlength: [100, 'Resource name cannot exceed 100 characters'],
    },
    type: {
      type: String,
      required: [true, 'Resource type is required'],
      enum: {
        values: RESOURCE_TYPES,
        message: `{VALUE} is not a valid resource type. Allowed: ${RESOURCE_TYPES.join(', ')}`,
      },
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer',
      },
    },
    availableQuantity: {
      type: Number,
      min: [0, 'Available quantity cannot be negative'],
      validate: [
        {
          validator: Number.isInteger,
          message: 'Available quantity must be an integer',
        },
        {
          validator: function (value) {
            return value <= this.quantity;
          },
          message: 'Available quantity cannot exceed total quantity',
        },
      ],
    },
    status: {
      type: String,
      enum: {
        values: RESOURCE_STATUSES,
        message: `{VALUE} is not a valid status. Allowed: ${RESOURCE_STATUSES.join(', ')}`,
      },
      default: 'available',
      index: true,
    },
    location: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'Location cannot exceed 300 characters'],
    },
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
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

resourceSchema.pre('save', async function () {
  if (this.availableQuantity === undefined || this.availableQuantity === null) {
    this.availableQuantity = this.quantity;
  }
});

export const Resource = mongoose.model('Resource', resourceSchema);

export default Resource;
