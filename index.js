const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// Service state
const serviceState = {
  lastError: null,
  connectionStatus: "Not initialized",
  lastCheck: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
};

// Allowed origins configuration
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://pension-pilot.co.uk",
  "https://www.pension-pilot.co.uk",
  "https://mail.pension-pilot.co.uk",
];

// SMTP configuration
const SMTP_CONFIG = {
  host: "mail.privateemail.com",
  port: 465,
  secure: true,
  user: "noreply@pension-pilot.co.uk",
  bounceAddress: "bounces@pension-pilot.co.uk",
  defaultReplyTo: "noreply@pension-pilot.co.uk",
};

// Enable CORS and JSON parsing
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Validate environment variables
function validateConfig() {
  const requiredVars = ["EMAIL_PASSWORD"];
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
}

// Create and verify transporter with retry logic
async function initializeTransporter(retryCount = 0) {
  try {
    validateConfig();

    console.log("Initializing mail transporter...");
    serviceState.connectionStatus = "Initializing...";
    serviceState.lastCheck = new Date();

    const transporter = nodemailer.createTransport({
      host: SMTP_CONFIG.host,
      port: SMTP_CONFIG.port,
      secure: SMTP_CONFIG.secure,
      auth: {
        user: SMTP_CONFIG.user,
        pass: process.env.EMAIL_PASSWORD,
      },
      connectionTimeout: 10000, // sets timeout to 10 seconds
      debug: true, // Enable debug logs
      logger: true, // Log to console
      tls: {
        rejectUnauthorized: true, // Enable SSL certificate verification
        minVersion: "TLSv1.2", // Enforce minimum TLS version
      },
    });

    console.log("Verifying connection...");
    await transporter.verify();

    console.log("SMTP connection verified successfully");
    serviceState.connectionStatus = "Connected";
    serviceState.lastError = null;
    serviceState.reconnectAttempts = 0;

    return transporter;
  } catch (error) {
    serviceState.lastError = error;
    serviceState.connectionStatus = "Failed";
    serviceState.reconnectAttempts = retryCount + 1;

    if (retryCount < serviceState.maxReconnectAttempts) {
      console.log(
        `Retry attempt ${retryCount + 1} of ${serviceState.maxReconnectAttempts}`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, 5000 * (retryCount + 1))
      );
      return initializeTransporter(retryCount + 1);
    }

    console.error("Failed to initialize mail transporter:", error);
    return null;
  }
}

// Initialize transporter
let transporter = null;
initializeTransporter().then((t) => {
  transporter = t;
});

// Status page route with enhanced security headers
app.get("/", async (req, res) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  const statusData = {
    isConnected: transporter !== null,
    currentStatus: serviceState.connectionStatus,
    errorMessage: serviceState.lastError?.message || "",
    environment: process.env.NODE_ENV || "development",
    lastChecked: serviceState.lastCheck,
    passwordSet: !!process.env.EMAIL_PASSWORD,
  };

  const html = generateStatusPage(statusData);
  res.send(html);
});

// Email sending function with validation
async function sendEmail(options) {
  if (!transporter) {
    transporter = await initializeTransporter();
    if (!transporter) {
      throw new Error("Mail service not initialized");
    }
  }

  const emailConfig = {
    from: `"Pension Pilot" <${SMTP_CONFIG.user}>`,
    to: options.to,
    subject: options.subject,
    text: options.body,
    replyTo: options.replyTo || SMTP_CONFIG.defaultReplyTo,
    returnPath: SMTP_CONFIG.bounceAddress,
    headers: {
      "List-Unsubscribe": "<mailto:unsubscribe@pension-pilot.co.uk>",
      "X-Mailer": "Pension Pilot Mail Service",
      Precedence: "bulk",
    },
  };

  return await transporter.sendMail(emailConfig);
}

// Test email endpoint
app.post("/test-email", async (req, res) => {
  try {
    const testInfo = await sendEmail({
      to: SMTP_CONFIG.user,
      subject: "Mail Service Test",
      body: "This is a test email from the Pension Pilot mail service.",
    });

    res.json({
      success: true,
      messageId: testInfo.messageId,
      response: testInfo.response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Regular email sending endpoint with input validation
app.post("/send", async (req, res) => {
  try {
    const { to, subject, body, replyTo } = req.body;

    // Basic input validation
    if (!to || !subject || !body) {
      throw new Error(
        "Missing required fields: to, subject, and body are required"
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error("Invalid email address format");
    }

    console.log("Sending email:", { to, subject });

    const info = await sendEmail({ to, subject, body, replyTo });

    console.log("Email sent successfully:", {
      messageId: info.messageId,
      to,
      subject,
      response: info.response,
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
