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
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`User not found: ${email}`);
    } else {
      console.log(`\n🔑 OTP for ${email}: ${user.otp}\n`);
    }
  } catch (error) {
    console.error('Error fetching OTP:', error);
  } finally {
    mongoose.connection.close();
  }
}
main();
