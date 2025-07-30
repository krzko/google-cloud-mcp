/**
 * Google Cloud Spanner resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import { getSpannerClient, getSpannerConfig } from "./types.js";
import { formatSchemaAsMarkdown, getSpannerSchema } from "./schema.js";
import { logger } from "../../utils/logger.js";

/**
 * Registers Google Cloud Spanner resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerSpannerResources(server: McpServer): void {
  // Register a resource for database schema
  server.resource(
    "gcp-spanner-database-schema",
    new ResourceTemplate(
      "gcp-spanner://{projectId}/{instanceId}/{databaseId}/schema",
      { list: undefined },
    ),
    async (uri, { projectId, instanceId, databaseId }, _extra) => {
      try {
        // Enhanced project ID detection with better error handling
        let actualProjectId: string;
        try {
          // Handle case where projectId might be an array
          const projectIdValue = Array.isArray(projectId)
            ? projectId[0]
            : projectId;
          actualProjectId = projectIdValue || (await getProjectId());
          if (!actualProjectId) {
            throw new Error("Project ID could not be determined");
          }
          logger.debug(
            `Using project ID: ${actualProjectId} for spanner-schema resource`,
          );
        } catch (error) {
          logger.error(
            `Error detecting project ID: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw new GcpMcpError(
            "Unable to detect a Project ID in the current environment.\nTo learn more about authentication and Google APIs, visit:\nhttps://cloud.google.com/docs/authentication/getting-started",
            "UNAUTHENTICATED",
            401,
          );
        }

        const config = await getSpannerConfig(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
          Array.isArray(databaseId) ? databaseId[0] : databaseId,
        );

        const schema = await getSpannerSchema(
          config.instanceId,
          config.databaseId,
        );
        const markdown = formatSchemaAsMarkdown(schema);

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Spanner Database Schema\n\nProject: ${actualProjectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\n${markdown}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error fetching Spanner schema: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },
  );

  // Register a resource for table data preview
  server.resource(
    "gcp-spanner-table-preview",
    new ResourceTemplate(
      "gcp-spanner://{projectId}/{instanceId}/{databaseId}/tables/{tableName}/preview",
      { list: undefined },
    ),
    async (uri, { projectId, instanceId, databaseId, tableName }, _extra) => {
      try {
        // Enhanced project ID detection with better error handling
        let actualProjectId: string;
        try {
          // Handle case where projectId might be an array
          const projectIdValue = Array.isArray(projectId)
            ? projectId[0]
            : projectId;
          actualProjectId = projectIdValue || (await getProjectId());
          if (!actualProjectId) {
            throw new Error("Project ID could not be determined");
          }
          logger.debug(
            `Using project ID: ${actualProjectId} for table-preview resource`,
          );
        } catch (error) {
          logger.error(
            `Error detecting project ID: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw new GcpMcpError(
            "Unable to detect a Project ID in the current environment.\nTo learn more about authentication and Google APIs, visit:\nhttps://cloud.google.com/docs/authentication/getting-started",
            "UNAUTHENTICATED",
            401,
          );
        }

        const config = await getSpannerConfig(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
          Array.isArray(databaseId) ? databaseId[0] : databaseId,
        );

        if (!tableName) {
          throw new GcpMcpError(
            "Table name is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        const spanner = await getSpannerClient();
        logger.debug(
          `Using Spanner client with project ID: ${spanner.projectId} for spanner-tables`,
        );
        const instance = spanner.instance(config.instanceId);
        const database = instance.database(config.databaseId);

        // Get a preview of the table data (first 10 rows)
        const [result] = await database.run({
          sql: `SELECT * FROM ${tableName} LIMIT 10`,
        });

        if (!result || result.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Table Preview: ${tableName}\n\nNo data found in the table.`,
              },
            ],
          };
        }

        // Convert to markdown table
        const columns = Object.keys(result[0]);

        let markdown = `# Table Preview: ${tableName}\n\n`;

        // Table header
        markdown += "| " + columns.join(" | ") + " |\n";
        markdown += "| " + columns.map(() => "---").join(" | ") + " |\n";

        // Table rows
        for (const row of result) {
          const rowValues = columns.map((col) => {
            const value = (row as any)[col];
            if (value === null || value === undefined) return "NULL";
            if (typeof value === "object") return JSON.stringify(value);
            return String(value);
          });

          markdown += "| " + rowValues.join(" | ") + " |\n";
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Table Preview: ${tableName}\n\nProject: ${actualProjectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\n${markdown}`,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error fetching table preview: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },
  );

  // Register a resource for listing available tables
  server.resource(
    "gcp-spanner-database-tables",
    new ResourceTemplate(
      "gcp-spanner://{projectId}/{instanceId}/{databaseId}/tables",
      { list: undefined },
    ),
    async (uri, { projectId, instanceId, databaseId }, _extra) => {
      try {
        // Enhanced project ID detection with better error handling
        let actualProjectId: string;
        try {
          // Handle case where projectId might be an array
          const projectIdValue = Array.isArray(projectId)
            ? projectId[0]
            : projectId;
          actualProjectId = projectIdValue || (await getProjectId());
          if (!actualProjectId) {
            throw new Error("Project ID could not be determined");
          }
          logger.debug(
            `Using project ID: ${actualProjectId} for spanner-tables resource`,
          );
        } catch (error) {
          logger.error(
            `Error detecting project ID: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw new GcpMcpError(
            "Unable to detect a Project ID in the current environment.\nTo learn more about authentication and Google APIs, visit:\nhttps://cloud.google.com/docs/authentication/getting-started",
            "UNAUTHENTICATED",
            401,
          );
        }

        const config = await getSpannerConfig(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
          Array.isArray(databaseId) ? databaseId[0] : databaseId,
        );

        const spanner = await getSpannerClient();
        logger.debug(
          `Using Spanner client with project ID: ${spanner.projectId} for spanner-tables`,
        );
        const instance = spanner.instance(config.instanceId);
        const database = instance.database(config.databaseId);

        // Query for tables with column count
        const [tablesResult] = await database.run({
          sql: `SELECT t.table_name, 
                    (SELECT COUNT(1) FROM information_schema.columns 
                     WHERE table_name = t.table_name) as column_count
              FROM information_schema.tables t
              WHERE t.table_catalog = '' AND t.table_schema = ''
              ORDER BY t.table_name`,
        });

        if (!tablesResult || tablesResult.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Spanner Tables\n\nProject: ${actualProjectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\nNo tables found in the database.`,
              },
            ],
          };
        }

        let markdown = `# Spanner Tables\n\nProject: ${actualProjectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\n`;

        // Table header
        markdown += "| Table Name | Column Count |\n";
        markdown += "|------------|-------------|\n";

        // Table rows
        for (const row of tablesResult) {
          const tableName = (row as any).table_name as string;
          const columnCount = (row as any).column_count as number;

          markdown += `| ${tableName} | ${columnCount} |\n`;
        }

        // Add links to each table's schema and preview
        markdown += "\n## Available Resources\n\n";
        for (const row of tablesResult) {
          const tableName = (row as any).table_name as string;
          markdown += `- **${tableName}**\n`;
          markdown += `  - Schema: \`gcp-spanner://${actualProjectId}/${config.instanceId}/${config.databaseId}/schema\`\n`;
          markdown += `  - Preview: \`gcp-spanner://${actualProjectId}/${config.instanceId}/${config.databaseId}/tables/${tableName}/preview\`\n\n`;
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error listing Spanner tables: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },
  );

  // Register a resource for listing available instances
  server.resource(
    "gcp-spanner-list-instances",
    new ResourceTemplate("gcp-spanner://{projectId}/instances", {
      list: undefined,
    }),
    async (uri, { projectId }, _extra) => {
      try {
        // Enhanced project ID detection with better error handling
        let actualProjectId: string;
        try {
          // Handle case where projectId might be an array
          const projectIdValue = Array.isArray(projectId)
            ? projectId[0]
            : projectId;
          actualProjectId = projectIdValue || (await getProjectId());
          if (!actualProjectId) {
            throw new Error("Project ID could not be determined");
          }
          logger.debug(
            `Using project ID: ${actualProjectId} for spanner-instances resource`,
          );
        } catch (error) {
          logger.error(
            `Error detecting project ID: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw new GcpMcpError(
            "Unable to detect a Project ID in the current environment.\nTo learn more about authentication and Google APIs, visit:\nhttps://cloud.google.com/docs/authentication/getting-started",
            "UNAUTHENTICATED",
            401,
          );
        }

        const spanner = await getSpannerClient();
        logger.debug(
          `Using Spanner client with project ID: ${spanner.projectId}`,
        );

        const [instances] = await spanner.getInstances();

        if (!instances || instances.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Spanner Instances\n\nProject: ${actualProjectId}\n\nNo instances found in the project.`,
              },
            ],
          };
        }

        let markdown = `# Spanner Instances\n\nProject: ${actualProjectId}\n\n`;

        // Table header
        markdown += "| Instance ID | State | Config | Nodes |\n";
        markdown += "|-------------|-------|--------|-------|\n";

        // Table rows
        for (const instance of instances) {
          const metadata = instance.metadata || {};
          markdown += `| ${instance.id || "unknown"} | ${metadata.state || "unknown"} | ${metadata.config?.split("/").pop() || "unknown"} | ${metadata.nodeCount || "unknown"} |\n`;
        }

        // Add links to each instance's databases
        markdown += "\n## Available Resources\n\n";
        for (const instance of instances) {
          markdown += `- **${instance.id}**\n`;
          markdown += `  - Databases: \`gcp-spanner://${actualProjectId}/${instance.id}/databases\`\n\n`;
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error listing Spanner instances: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },
  );

  // Register a resource for listing available databases
  server.resource(
    "gcp-spanner-list-databases",
    new ResourceTemplate("gcp-spanner://{projectId}/{instanceId}/databases", {
      list: undefined,
    }),
    async (uri, { projectId, instanceId }, _extra) => {
      try {
        // Enhanced project ID detection with better error handling
        let actualProjectId: string;
        try {
          // Handle case where projectId might be an array
          const projectIdValue = Array.isArray(projectId)
            ? projectId[0]
            : projectId;
          actualProjectId = projectIdValue || (await getProjectId());
          if (!actualProjectId) {
            throw new Error("Project ID could not be determined");
          }
          logger.debug(
            `Using project ID: ${actualProjectId} for spanner-databases resource`,
          );
        } catch (error) {
          logger.error(
            `Error detecting project ID: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw new GcpMcpError(
            "Unable to detect a Project ID in the current environment.\nTo learn more about authentication and Google APIs, visit:\nhttps://cloud.google.com/docs/authentication/getting-started",
            "UNAUTHENTICATED",
            401,
          );
        }

        if (!instanceId) {
          throw new GcpMcpError(
            "Instance ID is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        const spanner = await getSpannerClient();
        logger.debug(
          `Using Spanner client with project ID: ${spanner.projectId} for spanner-databases`,
        );
        const instance = spanner.instance(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
        );

        const [databases] = await instance.getDatabases();

        if (!databases || databases.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Spanner Databases\n\nProject: ${actualProjectId}\nInstance: ${Array.isArray(instanceId) ? instanceId[0] : instanceId}\n\nNo databases found in the instance.`,
              },
            ],
          };
        }

        let markdown = `# Spanner Databases\n\nProject: ${actualProjectId}\nInstance: ${Array.isArray(instanceId) ? instanceId[0] : instanceId}\n\n`;

        // Table header
        markdown += "| Database ID | State |\n";
        markdown += "|-------------|-------|\n";

        // Table rows
        for (const database of databases) {
          const metadata = database.metadata || {};
          markdown += `| ${database.id || "unknown"} | ${metadata.state || "unknown"} |\n`;
        }

        // Add links to each database's tables
        markdown += "\n## Available Resources\n\n";
        for (const database of databases) {
          markdown += `- **${database.id}**\n`;
          markdown += `  - Tables: \`gcp-spanner://${actualProjectId}/${Array.isArray(instanceId) ? instanceId[0] : instanceId}/${database.id}/tables\`\n`;
          markdown += `  - Schema: \`gcp-spanner://${actualProjectId}/${Array.isArray(instanceId) ? instanceId[0] : instanceId}/${database.id}/schema\`\n\n`;
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error listing Spanner databases: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },
  );
}
