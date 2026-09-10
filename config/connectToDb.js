const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let memoryServer;

module.exports = async () => {
  try {
    if (process.env.MONGO_URL) {
      await mongoose.connect(process.env.MONGO_URL);
    } else if (process.env.NODE_ENV === "development") {
      memoryServer = await MongoMemoryServer.create();
      await mongoose.connect(memoryServer.getUri());
      console.log("Connected to development in-memory MongoDB.");
      return;
    } else {
      throw new Error("MONGO_URL is not defined in environment variables.");
    }
    console.log("Connected to MongoDB.");
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      memoryServer = await MongoMemoryServer.create();
      await mongoose.connect(memoryServer.getUri());
      console.warn("External MongoDB unavailable; using development in-memory MongoDB.");
      return;
    }
    console.error("MongoDB connection failed:", error.message || error);
    throw error;
  }
};
