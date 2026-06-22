const SystemLog = require('../models/SystemLog');

const writeSystemLog = async (payload, options = {}) => {
  const [log] = await SystemLog.create(
    [
      {
        action: payload.action,
        message: payload.message,
        actor: payload.actor,
        actorName: payload.actorName,
        recipient: payload.recipient,
        entityType: payload.entityType,
        entityId: payload.entityId,
        severity: payload.severity || 'info',
        metadata: payload.metadata || {},
      },
    ],
    options
  );

  return log;
};

module.exports = { writeSystemLog };
