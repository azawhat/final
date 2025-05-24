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

const sendQRCodeEmail = async (user, event, qrCodeImage) => {
  // Convert base64 to buffer for attachment
  const base64Data = qrCodeImage.replace(/^data:image\/png;base64,/, '');
  const qrBuffer = Buffer.from(base64Data, 'base64');

  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: user.email,
    subject: `Your QR Code for ${event.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 5px;">
        <h2>Event Registration Confirmed!</h2>
        <p>Hello ${user.name} ${user.surname},</p>
        <p>You have successfully joined the event: <strong>${event.name}</strong></p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Event Details</h3>
          <p><strong>Event:</strong> ${event.name}</p>
          <p><strong>Description:</strong> ${event.description || 'No description provided'}</p>
          <p><strong>Location:</strong> ${event.location}</p>
          <p><strong>Start Date:</strong> ${new Date(event.startDate).toLocaleString()}</p>
          ${event.endDate ? `<p><strong>End Date:</strong> ${new Date(event.endDate).toLocaleString()}</p>` : ''}
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <h3>Your Attendance QR Code</h3>
          <p>Your QR code for event attendance is attached to this email.</p>
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #856404;">
              <strong>QR Code Attached:</strong> Please download and save the attached QR code image. 
              Present this QR code at the event for attendance verification.
            </p>
          </div>
        </div>
        <p>We look forward to seeing you at the event!</p>
        <p>Best regards,<br>SeeYa Team</p>
      </div>
    `,
    attachments: [
      {
        filename: `QR-Code-${event.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        content: qrBuffer,
        encoding: 'base64',
        cid: 'qrcode' // Content ID for referencing in HTML if needed
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`QR code email sent to ${user.email} for event ${event.name}`);
    return true;
  } catch (error) {
    console.error('Error sending QR code email:', error);
    return false;
  }
};

const sendNewPasswordEmail = async (user, newPassword) => {
  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: user.email,
    subject: 'Your New SeeYa Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 5px;">
        <h2>Reset Password</h2>
        <p>Hello ${user.name},</p>
        <p>Your password has been reset. Here is your new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; font-size: 24px; letter-spacing: 2px; font-weight: bold;">${newPassword}</div>
        </div>
        <p>Please log in and change your password as soon as possible.</p>
        <p>Best regards,<br>SeeYa</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`New password email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Error sending new password email:', error);
    return false;
  }
};



module.exports = { sendVerificationCode, sendQRCodeEmail, sendNewPasswordEmail };