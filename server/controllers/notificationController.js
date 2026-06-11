const SystemLog = require('../models/SystemLog');

const titlesByAction = {
  'approval.created': 'Approval Escalation',
  'approval.approved': 'Manager Approved Request',
  'approval.rejected': 'Manager Rejected Request',
  'approval.rejected.customer': 'Transfer Rejected',
  'customer.created': 'New Customer Registered',
  'overdraft.third_attempt': 'Third OD Attempt Reached',
  'tier.policy.updated.customer': 'Tier Policy Updated',
};

const typeBySeverity = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

const formatTime = (value) => {
  if (!value) return 'Recently';

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const serializeNotification = (log) => ({
  id: log._id,
  title: titlesByAction[log.action] || 'System Notification',
  message: log.message,
  type: typeBySeverity[log.severity] || 'info',
  time: formatTime(log.createdAt),
  createdAt: log.createdAt,
  action: log.action,
  entityType: log.entityType,
  entityId: log.entityId,
  metadata: log.metadata || {},
});

const getNotifications = async (req, res) => {
  const adminActions = [
    'approval.created',
    'approval.approved',
    'approval.rejected',
    'customer.created',
    'overdraft.third_attempt',
  ];
  const filter =
    req.user.role === 'admin'
      ? { action: { $in: adminActions } }
      : { actor: req.user._id };

  const logs = await SystemLog.find(filter).sort({ createdAt: -1 }).limit(50);

  res.json({
    notifications: logs.map(serializeNotification),
  });
};

module.exports = { getNotifications };
