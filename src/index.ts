/**
 * Google Cloud MCP Server
 *
 * This server provides Model Context Protocol resources and tools for interacting
 * with Google Cloud services (Billing, Error Reporting, IAM, Logging, Monitoring, Profiler, Spanner, and Trace).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import dotenv from "dotenv";

// Import service modules
import {
  registerLoggingResources,
  registerLoggingTools,
} from "./services/logging/index.js";
import {
  registerSpannerResources,
  registerSpannerTools,
  registerSpannerQueryCountTool,
} from "./services/spanner/index.js";
import {
  registerMonitoringResources,
  registerMonitoringTools,
} from "./services/monitoring/index.js";
import { registerTraceService } from "./services/trace/index.js";
import {
  registerIamResources,
  registerIamTools,
} from "./services/iam/index.js";
import {
  registerErrorReportingResources,
  registerErrorReportingTools,
} from "./services/error-reporting/index.js";
import {
  registerProfilerResources,
  registerProfilerTools,
} from "./services/profiler/index.js";
import { registerBillingService } from "./services/billing/index.js";
import { registerPrompts } from "./prompts/index.js";
import { initGoogleAuth, authClient } from "./utils/auth.js";
import { registerResourceDiscovery } from "./utils/resource-discovery.js";
import { registerProjectTools } from "./utils/project-tools.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./utils/logger.js";

// Load environment variables
dotenv.config();

// Using imported structured logger from utils/logger.ts

/**
 * Main function to start the MCP server
 */
async function main(): Promise<void> {
  // Set up unhandled error handlers to prevent silent crashes
  process.on("uncaughtException", (error) => {
    logger.error(error);
    // Don't exit, just log the error
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    // Don't exit, just log the error
  });

  // Enhanced signal handlers for graceful shutdown
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal} signal, shutting down gracefully`);

    try {
      // Close any remaining connections
      logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.error(
        `Error during shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  // Debug environment variables
  if (process.env.DEBUG) {
    logger.debug("Environment variables:");
    logger.debug(
      `GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || "not set"}`,
    );
    logger.debug(
      `GOOGLE_CLOUD_PROJECT: ${process.env.GOOGLE_CLOUD_PROJECT || "not set"}`,
    );
    logger.debug(
      `GOOGLE_CLIENT_EMAIL: ${process.env.GOOGLE_CLIENT_EMAIL ? "set" : "not set"}`,
    );
    logger.debug(
      `GOOGLE_PRIVATE_KEY: ${process.env.GOOGLE_PRIVATE_KEY ? "set" : "not set"}`,
    );
    logger.debug(`LAZY_AUTH: ${process.env.LAZY_AUTH || "not set"}`);
    logger.debug(`DEBUG: ${process.env.DEBUG || "not set"}`);
  }

  try {
    logger.info("Starting Google Cloud MCP server...");

    // Create the MCP server first to ensure it's ready to handle requests
    // even if authentication is still initializing
    logger.info("Creating MCP server instance");
    const server = new McpServer(
      {
        name: "Google Cloud MCP",
        version: "0.1.0",
        description: "Model Context Protocol server for Google Cloud services",
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      },
    );

    // Initialize Google Cloud authentication in non-blocking mode
    // This allows the server to start even if credentials aren't available yet
    const lazyAuth = process.env.LAZY_AUTH !== "false"; // Default to true if not set
    logger.info(
      `Initializing Google Cloud authentication in lazy loading mode: ${lazyAuth}`,
    );

    // If LAZY_AUTH is true (default), we'll defer authentication until it's actually needed
    // This helps with Smithery which may time out during auth initialization
    if (!lazyAuth) {
      try {
        const auth = await initGoogleAuth(false);
        if (auth) {
          logger.info("Google Cloud authentication initialized successfully");
        } else {
          logger.warn(
            "Google Cloud authentication not available - will attempt lazy loading when needed",
          );
        }
      } catch (err) {
        logger.warn(
          `Auth initialization warning: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Register resources and tools for each Google Cloud service
    // These operations should not block server startup
    try {
      logger.info("Registering Google Cloud Logging services");
      registerLoggingResources(server);
      registerLoggingTools(server);
    } catch (error) {
      logger.warn(
        `Error registering Logging services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      logger.info("Registering Google Cloud Spanner services");
      registerSpannerResources(server);
      registerSpannerTools(server);
      registerSpannerQueryCountTool(server);
    } catch (error) {
      logger.warn(
        `Error registering Spanner services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      logger.info("Registering Google Cloud Monitoring services");
      registerMonitoringResources(server);
      await registerMonitoringTools(server);
    } catch (error) {
      logger.warn(
        `Error registering Monitoring services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register Google Cloud Trace service
      logger.info("Registering Google Cloud Trace services");
      await registerTraceService(server);
    } catch (error) {
      logger.warn(
        `Error registering Trace services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register Google Cloud IAM service
      logger.info("Registering Google Cloud IAM services");
      registerIamResources(server);
      registerIamTools(server);
    } catch (error) {
      logger.warn(
        `Error registering IAM services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register Google Cloud Error Reporting service
      logger.info("Registering Google Cloud Error Reporting services");
      registerErrorReportingResources(server);
      registerErrorReportingTools(server);
    } catch (error) {
      logger.warn(
        `Error registering Error Reporting services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register Google Cloud Profiler service
      logger.info("Registering Google Cloud Profiler services");
      registerProfilerResources(server);
      registerProfilerTools(server);
    } catch (error) {
      logger.warn(
        `Error registering Profiler services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register Google Cloud Billing service
      logger.info("Registering Google Cloud Billing services");
      registerBillingService(server);
    } catch (error) {
      logger.warn(
        `Error registering Billing services: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register additional tools
      logger.info("Registering additional tools");
      registerProjectTools(server);
    } catch (error) {
      logger.warn(
        `Error registering project tools: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register prompts
      logger.info("Registering prompts");
      registerPrompts(server);
    } catch (error) {
      logger.warn(
        `Error registering prompts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Register resource discovery endpoints
      logger.info("Registering resource discovery");
      await registerResourceDiscovery(server);
    } catch (error) {
      logger.warn(
        `Error registering resource discovery: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Initialize stdio transport for Claude Desktop compatibility
    logger.info("Initializing stdio transport for Claude Desktop");
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("Server started successfully and ready to handle requests");

    // Keep the process alive and periodically check auth status
    let heartbeatCount = 0;
    setInterval(() => {
      // Heartbeat to keep the process alive
      heartbeatCount++;
      if (process.env.DEBUG) {
        logger.debug(`Server heartbeat #${heartbeatCount}`);
      }

      // Check auth status periodically, but not on every heartbeat to reduce load
      // Only check auth every 5 heartbeats (approximately every 2.5 minutes)
      if (!authClient && heartbeatCount % 5 === 0) {
        logger.debug("Attempting delayed authentication check");
        initGoogleAuth(false)
          .then((auth) => {
            if (auth && !authClient) {
              logger.info(
                "Google Cloud authentication initialized successfully (delayed)",
              );
            }
          })
          .catch((authError) => {
            // Log but don't crash on auth errors
            logger.debug(
              `Delayed auth check failed: ${authError instanceof Error ? authError.message : String(authError)}`,
            );
          });
      }
    }, 30000);
  } catch (error) {
    // Log the error to stderr (won't interfere with stdio protocol)
    logger.error(
      `Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`,
    );
    logger.error(
      error instanceof Error
        ? error.stack || "No stack trace available"
        : "No stack trace available",
    );

    // Don't exit immediately, give time for logs to be seen
    // But also don't exit at all - let the server continue running even with errors
    // This is important for Smithery which expects the server to stay alive
    logger.info("Server continuing to run despite startup errors");
  }
}

// Start the server
main();
