const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"MealGenie Support" <${process.env.SMTP_EMAIL}>`,
    to: options.email, // IMPORTANT!!!!!
    subject: options.subject,
    html: options.message,
  };

  await transporter.sendMail(mailOptions);
};


const resetEmailTemplate = (name, resetUrl) => `
  <div style="font-family: Arial, sans-serif; color:#333; padding:20px;">
    <div style="text-align:center;">
      <img src="https://i.postimg.cc/28d2Jw9p/mealgenie-logo-dark.png" alt="MealGenie" style="height:60px;margin-bottom:20px;" />
    </div>

    <h2 style="color:#16A34A;">Hello ${name}, 👋</h2>
    
    <p>You requested to reset your MealGenie password.</p>
    <p>Click the button below:</p>

    <a href="${resetUrl}"
      style="display:inline-block; background:#16A34A; color:white; 
      padding:12px 22px; border-radius:10px;
      font-size:16px; text-decoration:none; font-weight:bold;">
      Reset Password 🔐
    </a>

    <p style="margin-top:20px; font-size:14px;">
      If you didn’t request this, you can safely ignore it.
    </p>

    <br>
    <p style="font-size:12px; opacity:0.8;">MealGenie Team 🌟</p>
  </div>
`;

module.exports = {
  sendEmail,
  resetEmailTemplate
};

