const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

let lastError = null;
let connectionStatus = "Not initialized";

// Enable CORS and JSON parsing
app.use(
  cors({
    origin: ["http://localhost:5173", "https://pension-pilot.co.uk"],
  })
);
app.use(express.json());

// Function to create and verify transporter
async function initializeTransporter() {
  try {
    console.log("Initializing mail transporter...");
    connectionStatus = "Initializing...";

    if (!process.env.EMAIL_PASSWORD) {
      const error = new Error("EMAIL_PASSWORD environment variable is not set");
      lastError = error;
      throw error;
    }

    console.log("Creating transporter with config:", {
      host: "mail.privateemail.com",
      port: 465,
      secure: true,
      auth: {
        user: "noreply@pension-pilot.co.uk",
        // password is hidden for security
      },
    });

    const transporter = nodemailer.createTransport({
      host: "mail.privateemail.com",
      port: 465,
      secure: true,
      auth: {
        user: "noreply@pension-pilot.co.uk",
        pass: process.env.EMAIL_PASSWORD,
      },
      debug: true, // Enable debug logs
      logger: true, // Log to console
      tls: {
        rejectUnauthorized: false, // Disable SSL certificate verification (for troubleshooting only)
      },
    });

    // Verify the connection
    console.log("Verifying connection...");
    await transporter.verify();
    console.log("SMTP connection verified successfully");
    connectionStatus = "Connected";
    lastError = null;
    return transporter;
  } catch (error) {
    console.error("Failed to initialize mail transporter:", error);
    lastError = error;
    connectionStatus = "Failed";
    return null;
  }
}

// Initialize transporter
let transporter = null;
initializeTransporter().then((t) => {
  transporter = t;
});

// Status page route
app.get("/", async (req, res) => {
  const isConnected = transporter !== null;
  const currentStatus = connectionStatus;
  const errorMessage = lastError?.message || "";

  const html = `
    <!DOCTYPE html>
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
                          isConnected ? "bg-green-500" : "bg-red-500"
                        } rounded-full mr-2 animate-pulse"></div>
                        <span class="${
                          isConnected ? "text-green-400" : "text-red-400"
                        } font-medium text-xl">
                            Status: ${currentStatus}
                        </span>
                    </div>
                    
                    <div class="bg-gray-700 rounded p-6 mb-6">
                        <p class="text-gray-300 mb-2">
                            <span class="font-medium text-blue-400">SMTP Host:</span> mail.privateemail.com
                        </p>
                        <p class="text-gray-300 mb-2">
                            <span class="font-medium text-blue-400">Port:</span> 465
                        </p>
                        <p class="text-gray-300">
                            <span class="font-medium text-blue-400">From:</span> noreply@pension-pilot.co.uk  
                        </p>
                    </div>

                    ${
                      errorMessage
                        ? `
                    <div class="bg-red-800 rounded p-4 mb-6">
                        <p class="text-red-300">Error: ${errorMessage}</p>
                    </div>
                    `
                        : ""
                    }

                    <div class="bg-blue-800 rounded p-4 mb-6">
                        <p class="text-blue-300 mb-2">
                            <span class="font-medium">Environment:</span> ${
                              process.env.NODE_ENV || "development"
                            }
                        </p>
                        <p class="text-blue-300">
                            <span class="font-medium">Password Set:</span> ${
                              process.env.EMAIL_PASSWORD ? "Yes" : "No"
                            }
                        </p>
                    </div>

                    <p class="text-gray-400 text-sm mb-4">
                        Last checked: ${new Date().toLocaleString()}
                    </p>
                    
                    <button onclick="location.reload()" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 transition duration-150 ease-in-out">
                        Retry Connection
                    </button>
                </div>
            </div>
            <p class="text-gray-500 text-sm">Powered by Pension Pilot</p>
        </div>
    </body>
    </html>
  `;

  res.send(html);
});

// Send email test endpoint
app.post("/test-email", async (req, res) => {
  try {
    if (!transporter) {
      transporter = await initializeTransporter();
      if (!transporter) {
        throw new Error("Mail service not initialized");
      }
    }

    const testInfo = await transporter.sendMail({
      from: '"Pension Pilot" <noreply@pension-pilot.co.uk>',
      to: "noreply@pension-pilot.co.uk", // Send to self as test
      subject: "Mail Service Test",
      text: "This is a test email from the Pension Pilot mail service.",
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

// Regular email sending endpoint
app.post("/send", async (req, res) => {
  try {
    if (!transporter) {
      transporter = await initializeTransporter();
      if (!transporter) {
        throw new Error("Mail service not initialized");
      }
    }

    const { to, subject, body, replyTo } = req.body;
    console.log("Sending email:", { to, subject });

    const info = await transporter.sendMail({
      from: '"Pension Pilot" <noreply@pension-pilot.co.uk>',
      to,
      subject,
      text: body,
      replyTo: replyTo || "noreply@pension-pilot.co.uk",
      returnPath: "bounces@pension-pilot.co.uk",
      headers: {
        "List-Unsubscribe": "<mailto:unsubscribe@pension-pilot.co.uk>",
        "X-Mailer": "Pension Pilot Mail Service",
        Precedence: "bulk",
      },
    });

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
