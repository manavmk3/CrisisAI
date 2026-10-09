import mongoose from 'mongoose';
import Resource, { RESOURCE_TYPES, RESOURCE_STATUSES } from '../models/Resource.js';

const PROTECTED_FIELDS = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'managedBy'];

export const createResource = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Expected a JSON object.',
      });
    }

    const {
      name,
      type,
      description,
      quantity,
      availableQuantity,
      status,
      location,
      latitude,
      longitude,
    } = req.body;

    if (name === undefined || name === null) {
      return res.status(400).json({ success: false, message: 'Missing required field: name' });
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Field "name" must be a non-empty string' });
    }

    if (type === undefined || type === null) {
      return res.status(400).json({ success: false, message: 'Missing required field: type' });
    }
    if (!RESOURCE_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid resource type: "${type}". Allowed: ${RESOURCE_TYPES.join(', ')}`,
      });
    }

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({ success: false, message: 'Missing required field: quantity' });
    }
    const parsedQty = Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty < 0) {
      return res.status(400).json({
        success: false,
        message: 'Field "quantity" must be a non-negative integer',
      });
    }

    let parsedAvail;
    if (availableQuantity !== undefined && availableQuantity !== null) {
      parsedAvail = Number(availableQuantity);
      if (!Number.isInteger(parsedAvail) || parsedAvail < 0) {
        return res.status(400).json({
          success: false,
          message: 'Field "availableQuantity" must be a non-negative integer',
        });
      }
      if (parsedAvail > parsedQty) {
        return res.status(400).json({
          success: false,
          message: 'Available quantity cannot exceed total quantity',
        });
      }
    } else {
      parsedAvail = parsedQty;
    }

    if (status !== undefined && !RESOURCE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status: "${status}". Allowed: ${RESOURCE_STATUSES.join(', ')}`,
      });
    }

    let resolvedLat = null;
    let resolvedLon = null;
    if (latitude !== undefined && latitude !== null) {
      const lat = Number(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ success: false, message: 'Latitude must be a number between -90 and 90' });
      }
      resolvedLat = lat;
    }
    if (longitude !== undefined && longitude !== null) {
      const lon = Number(longitude);
      if (isNaN(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ success: false, message: 'Longitude must be a number between -180 and 180' });
      }
      resolvedLon = lon;
    }

    const resource = new Resource({
      name: name.trim(),
      type,
      description: typeof description === 'string' ? description.trim() : '',
      quantity: parsedQty,
      availableQuantity: parsedAvail,
      status: status || 'available',
      location: typeof location === 'string' ? location.trim() : '',
      latitude: resolvedLat,
      longitude: resolvedLon,
      managedBy: req.user._id,
    });

    await resource.save();

    return res.status(201).json({
      success: true,
      data: resource,
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('[Resource Controller] Error creating resource:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while creating resource.' });
  }
};

export const getResources = async (req, res) => {
  try {
    const filter = {};

    if (req.query.type) {
      if (!RESOURCE_TYPES.includes(req.query.type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid type filter: "${req.query.type}". Allowed: ${RESOURCE_TYPES.join(', ')}`,
        });
      }
      filter.type = req.query.type;
    }

    if (req.query.status) {
      if (!RESOURCE_STATUSES.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status filter: "${req.query.status}". Allowed: ${RESOURCE_STATUSES.join(', ')}`,
        });
      }
      filter.status = req.query.status;
    }

    const resources = await Resource.find(filter)
      .sort({ createdAt: -1 })
      .populate('managedBy', 'name email role');

    return res.status(200).json({
      success: true,
      count: resources.length,
      data: resources,
    });
  } catch (err) {
    console.error('[Resource Controller] Error getting resources:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while fetching resources.' });
  }
};

export const getResourceById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid resource ID format.' });
    }

    const resource = await Resource.findById(id).populate('managedBy', 'name email role');
    if (!resource) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }

    return res.status(200).json({ success: true, data: resource });
  } catch (err) {
    console.error('[Resource Controller] Error getting resource by ID:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while fetching resource.' });
  }
};

export const updateResource = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid resource ID format.' });
    }

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid request body.' });
    }

    for (const field of PROTECTED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        return res.status(400).json({
          success: false,
          message: `Field "${field}" cannot be modified.`,
        });
      }
    }

    const resource = await Resource.findById(id);
    if (!resource) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }

    const {
      name,
      type,
      description,
      quantity,
      availableQuantity,
      status,
      location,
      latitude,
      longitude,
    } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Field "name" must be a non-empty string' });
      }
      resource.name = name.trim();
    }

    if (type !== undefined) {
      if (!RESOURCE_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid resource type: "${type}". Allowed: ${RESOURCE_TYPES.join(', ')}`,
        });
      }
      resource.type = type;
    }

    if (description !== undefined) {
      resource.description = typeof description === 'string' ? description.trim() : '';
    }

    if (status !== undefined) {
      if (!RESOURCE_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status: "${status}". Allowed: ${RESOURCE_STATUSES.join(', ')}`,
        });
      }
      resource.status = status;
    }

    if (location !== undefined) {
      if (typeof location !== 'string') {
        return res.status(400).json({ success: false, message: 'Field "location" must be a string' });
      }
      resource.location = location.trim();
    }

    const newQty = quantity !== undefined ? Number(quantity) : resource.quantity;
    const newAvail = availableQuantity !== undefined ? Number(availableQuantity) : resource.availableQuantity;

    if (quantity !== undefined) {
      if (!Number.isInteger(newQty) || newQty < 0) {
        return res.status(400).json({
          success: false,
          message: 'Field "quantity" must be a non-negative integer',
        });
      }
    }

    if (availableQuantity !== undefined) {
      if (!Number.isInteger(newAvail) || newAvail < 0) {
        return res.status(400).json({
          success: false,
          message: 'Field "availableQuantity" must be a non-negative integer',
        });
      }
    }

    if (newAvail > newQty) {
      return res.status(400).json({
        success: false,
        message: 'Available quantity cannot exceed total quantity',
      });
    }

    if (quantity !== undefined) resource.quantity = newQty;
    if (availableQuantity !== undefined) resource.availableQuantity = newAvail;

    if (latitude !== undefined) {
      if (latitude === null) {
        resource.latitude = null;
      } else {
        const lat = Number(latitude);
        if (isNaN(lat) || lat < -90 || lat > 90) {
          return res.status(400).json({ success: false, message: 'Latitude must be a number between -90 and 90' });
        }
        resource.latitude = lat;
      }
    }

    if (longitude !== undefined) {
      if (longitude === null) {
        resource.longitude = null;
      } else {
        const lon = Number(longitude);
        if (isNaN(lon) || lon < -180 || lon > 180) {
          return res.status(400).json({ success: false, message: 'Longitude must be a number between -180 and 180' });
        }
        resource.longitude = lon;
      }
    }

    await resource.save();

    return res.status(200).json({ success: true, data: resource });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('[Resource Controller] Error updating resource:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while updating resource.' });
  }
};

export const deleteResource = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid resource ID format.' });
    }

    const resource = await Resource.findById(id);
    if (!resource) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }

    await Resource.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Resource deleted successfully.',
    });
  } catch (err) {
    console.error('[Resource Controller] Error deleting resource:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while deleting resource.' });
  }
};

export default {
  createResource,
  getResources,
  getResourceById,
  updateResource,
  deleteResource,
};
