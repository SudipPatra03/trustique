const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');

async function main() {
  try {
    await connectDB();
    const email = process.argv[2];
    if (!email) {
      console.error('Please specify an email');
      process.exit(1);
    }
    const { hashSHA256 } = require('./utils/encryption');
    const user = await User.findOne({ emailHash: hashSHA256(email.toLowerCase()) });
    if (!user) {
      console.log(`User not found: ${email}`);
    } else {
      user.isVerified = true;
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      console.log(`\n✅ User ${email} is now VERIFIED in the database!\n`);
    }
  } catch (error) {
    console.error('Error verifying user:', error);
  } finally {
    mongoose.connection.close();
  }
}
main();
