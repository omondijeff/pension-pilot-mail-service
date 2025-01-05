const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

// Enable CORS and JSON parsing
app.use(
  cors({
    origin: ["http://localhost:5173", "https://pension-pilot.co.uk"],
  })
);
app.use(express.json());

// Create transporter with Namecheap Private Email settings
const transporter = nodemailer.createTransport({
  host: "mail.privateemail.com",
  port: 465,
  secure: true, // true for port 465
  auth: {
    user: "noreply@pension-pilot.co.uk",
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Send email endpoint
app.post("/send", async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    console.log("Sending email:", { to, subject });

    const info = await transporter.sendMail({
      from: '"Pension Pilot" <noreply@pension-pilot.co.uk>',
      to,
      subject,
      text: body,
    });

    console.log("Email sent successfully:", {
      messageId: info.messageId,
      to,
      subject,
    });

    res.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("Failed to send email:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Start server if not running as serverless
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for serverless
module.exports = app;
