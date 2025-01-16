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

// Middleware configuration
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
      tls: {
        rejectUnauthorized: true, // Enable SSL certificate verification in production
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
        `Retry attempt ${retryCount + 1} of ${
          serviceState.maxReconnectAttempts
        }`
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
    from: '"Pension Pilot" <${SMTP_CONFIG.user}>',
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

// Generate status page HTML
function generateStatusPage(data) {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pension Pilot Mail Service Status</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900">
        <div class="min-h-screen flex flex-col items-center justify-center p-4">
            <div class="max-w-lg w-full bg-gray-800 rounded-lg shadow-lg p-8 mb-8">
                <div class="flex justify-center mb-6">
                    <img src="https://www.pension-pilot.co.uk/assets/logo-pension-pilot-CpOZGJ54.png" alt="Pension Pilot Logo" class="h-16">
                </div>
                <div class="text-center">
                    <h1 class="text-3xl font-bold text-white mb-4">Mail Service Status</h1>
                    
                    <div class="flex items-center justify-center mb-6">
                        <div class="h-6 w-6 ${
                          data.isConnected ? "bg-green-500" : "bg-red-500"
                        } rounded-full mr-2 animate-pulse"></div>
                        <span class="${
                          data.isConnected ? "text-green-400" : "text-red-400"
                        } font-medium text-xl">
                            Status: ${data.currentStatus}
                        </span>
                    </div>
                    
                    <div class="bg-gray-700 rounded p-6 mb-6">
                        <p class="text-gray-300 mb-2">
                            <span class="font-medium text-blue-400">SMTP Host:</span> ${
                              SMTP_CONFIG.host
                            }
                        </p>
                        <p class="text-gray-300 mb-2">
                            <span class="font-medium text-blue-400">Port:</span> ${
                              SMTP_CONFIG.port
                            }
                        </p>
                        <p class="text-gray-300">
                            <span class="font-medium text-blue-400">From:</span> ${
                              SMTP_CONFIG.user
                            }
                        </p>
                    </div>

                    ${
                      data.errorMessage
                        ? `
                    <div class="bg-red-800 rounded p-4 mb-6">
                        <p class="text-red-300">Error: ${data.errorMessage}</p>
                    </div>
                    `
                        : ""
                    }

                    <div class="bg-blue-800 rounded p-4 mb-6">
                        <p class="text-blue-300 mb-2">
                            <span class="font-medium">Environment:</span> ${
                              data.environment
                            }
                        </p>
                        <p class="text-blue-300">
                            <span class="font-medium">Password Set:</span> ${
                              data.passwordSet ? "Yes" : "No"
                            }
                        </p>
                    </div>

                    <p class="text-gray-400 text-sm mb-4">
                        Last checked: ${
                          data.lastChecked?.toLocaleString() || "Never"
                        }
                    </p>
                    
                    <button onclick="location.reload()" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 transition duration-150 ease-in-out">
                        Retry Connection
                    </button>
                </div>
            </div>
            <p class="text-gray-500 text-sm">Powered by Pension Pilot</p>
        </div>
    </body>
    </html>`;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
