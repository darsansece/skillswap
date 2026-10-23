const { AuditLog } = require('../models');

module.exports = (actor, action, targetType, targetId, meta) => AuditLog.create({ actor, action, targetType, targetId, meta }).catch(() => null);
