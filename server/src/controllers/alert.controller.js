import alertService, { AlertServiceError } from '../services/alert.service.js';

export async function getUserAlerts(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No user identity found.',
      });
    }

    const alerts = await alertService.getUserAlerts(userId, req.query);

    return res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    if (error instanceof AlertServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving alerts.',
    });
  }
}

export async function getUnreadCount(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const count = await alertService.getUnreadCount(userId);

    return res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    if (error instanceof AlertServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while counting unread alerts.',
    });
  }
}

export async function markAlertAsRead(req, res) {
  try {
    const alertId = req.params.alertId || req.params.id;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const updatedAlert = await alertService.markAlertAsRead(alertId, userId);

    return res.status(200).json({
      success: true,
      message: 'Alert marked as read.',
      data: updatedAlert,
    });
  } catch (error) {
    if (error instanceof AlertServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while marking alert as read.',
    });
  }
}

export async function markAllAlertsAsRead(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const result = await alertService.markAllAlertsAsRead(userId);

    return res.status(200).json({
      success: true,
      message: 'All alerts marked as read.',
      modifiedCount: result.modifiedCount,
      readAt: result.readAt,
    });
  } catch (error) {
    if (error instanceof AlertServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while marking all alerts as read.',
    });
  }
}

export async function getAlertById(req, res) {
  try {
    const alertId = req.params.alertId || req.params.id;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const alert = await alertService.getAlertById(alertId, userId);

    return res.status(200).json({
      success: true,
      data: alert,
    });
  } catch (error) {
    if (error instanceof AlertServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving alert.',
    });
  }
}

export default {
  getUserAlerts,
  getUnreadCount,
  markAlertAsRead,
  markAllAlertsAsRead,
  getAlertById,
};

