export const authorize = (...roles) => {
  const allowedRoles = roles.flat().map((r) => (typeof r === 'string' ? r.trim().toLowerCase() : r));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No user identity found.',
      });
    }

    const userRole = typeof req.user.role === 'string' ? req.user.role.trim().toLowerCase() : '';

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User has no assigned role.',
      });
    }

    const isMatch =
      allowedRoles.includes(userRole) ||
      (userRole === 'responder' && allowedRoles.includes('volunteer')) ||
      (userRole === 'volunteer' && allowedRoles.includes('responder'));

    if (!isMatch) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Operation requires one of the following roles: ${allowedRoles.join(', ')}. Your current role is "${userRole}".`,
      });
    }

    return next();
  };
};

export default authorize;
