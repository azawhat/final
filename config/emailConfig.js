const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

const sendVerificationCode = async (user, verificationCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: user.email,
    subject: 'Your SeeYa Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 5px;">
        <h2>Welcome to SeeYa!</h2>
        <p>Hello ${user.name},</p>
        <p>Thank you for registering. Please verify your email address by entering the following code in the app:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; font-size: 24px; letter-spacing: 5px; font-weight: bold;">${verificationCode}</div>
        </div>
        <p>This code will expire in 30 minutes.</p>
        <p>Best regards,<br>SeeYa</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification code sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Error sending verification code email:', error);
    return false;
  }
};

module.exports = { sendVerificationCode };