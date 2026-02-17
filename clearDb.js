const mongoose = require("mongoose");

// PASTE YOUR ACTUAL URI STRING BELOW
const MANUAL_URI = "mongodb+srv://user:loom@cluster0.pgmqyj9.mongodb.net/loom?retryWrites=true&w=majority&appName=Cluster0";

async function clearPosts() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MANUAL_URI);
    
    console.log("Connected! Looking for 'posts' collection...");

    // This drops the 'posts' collection specifically
    await mongoose.connection.db.dropCollection("posts");
    
    console.log("🧹 Success! The 'posts' collection has been cleared.");
  } catch (err) {
    if (err.codeName === "NamespaceNotFound" || err.message.includes("ns not found")) {
      console.log("Database is already clean (no 'posts' collection to delete).");
    } else {
      console.error("❌ Error:", err.message);
    }
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
}

clearPosts();