const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

const sendConfirmationEmail = async (user, confirmationToken) => {
  const confirmationUrl = `${process.env.CLIENT_URL}/auth/confirm/${confirmationToken}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: user.email,
    subject: 'Confirm Your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 5px;">
        <h2>Welcome to SeeYa!</h2>
        <p>Hello ${user.name},</p>
        <p>Thank you for registering. Please confirm your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${confirmationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Confirm Email</a>
        </div>
        <p>If the button doesn't work, you can also click on the link below or copy it into your browser:</p>
        <p><a href="${confirmationUrl}">${confirmationUrl}</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>Best regards,<br>SeeYa</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return false;
  }
};

module.exports = { sendConfirmationEmail };