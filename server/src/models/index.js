module.exports = {
  User: require('./User'),
  Skill: require('./Skill'),
  Exchange: require('./Exchange'),
  Review: require('./Review'),
  Notification: require('./Notification'),
  CreditTransaction: require('./CreditTransaction'),
  ...require('./Chat'),
  ...require('./Assessment'),
  ...require('./Forum'),
  ...require('./Moderation'),
};
