const mongoose = require('mongoose');

async function connectDB(uri = process.env.MONGO_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}
module.exports = connectDB;
