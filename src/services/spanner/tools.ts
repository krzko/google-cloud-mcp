/**
 * Google Cloud Spanner tools for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId } from "../../utils/auth.js";
import { getSpannerClient, getSpannerConfig } from "./types.js";
import { getSpannerSchema } from "./schema.js";
import { stateManager } from "../../utils/state-manager.js";
import { logger } from "../../utils/logger.js";

/**
 * Get detailed schema information for a Spanner database in a format suitable for query generation
 *
 * @param instanceId Spanner instance ID
 * @param databaseId Spanner database ID
 * @returns Detailed schema information with table relationships
 */
async function getDetailedSchemaForQueryGeneration(
  instanceId: string,
  databaseId: string,
): Promise<string> {
  const schema = await getSpannerSchema(instanceId, databaseId);

  // Format the schema in a way that's useful for SQL generation
  let schemaText = `Database: ${databaseId}\n\nTables:\n`;

  for (const table of schema.tables) {
    schemaText += `\nTable: ${table.name}\n`;
    schemaText += `Columns:\n`;

    for (const column of table.columns) {
      schemaText += `  - ${column.name}: ${column.type}${column.nullable ? " (nullable)" : ""}\n`;
    }

    if (table.indexes && table.indexes.length > 0) {
      schemaText += `Indexes:\n`;
      for (const index of table.indexes) {
        schemaText += `  - ${index.name}: ${index.columns.join(", ")}${index.unique ? " (unique)" : ""}\n`;
      }
    }

    if (table.foreignKeys && table.foreignKeys.length > 0) {
      schemaText += `Foreign Keys:\n`;
      for (const fk of table.foreignKeys) {
        schemaText += `  - ${fk.name}: ${fk.columns.join(", ")} → ${fk.referencedTable}(${fk.referencedColumns.join(", ")})\n`;
      }
    }
  }

  return schemaText;
}

export function registerSpannerTools(server: McpServer): void {
  // Tool to execute SQL queries
  server.tool(
    "gcp-spanner-execute-query",
    {
      sql: z.string().describe("The SQL query to execute"),
      instanceId: z
        .string()
        .optional()
        .describe("Spanner instance ID (defaults to SPANNER_INSTANCE env var)"),
      databaseId: z
        .string()
        .optional()
        .describe("Spanner database ID (defaults to SPANNER_DATABASE env var)"),
      params: z
        .record(z.string(), z.any())
        .optional()
        .describe("Query parameters"),
    },
    async ({ sql, instanceId, databaseId, params }, _extra) => {
      try {
        const projectId = await getProjectId();
        const config = await getSpannerConfig(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
          Array.isArray(databaseId) ? databaseId[0] : databaseId,
        );

        const spanner = await getSpannerClient();
        logger.debug(
          `Using Spanner client with project ID: ${spanner.projectId} for execute-spanner-query`,
        );
        const instance = spanner.instance(config.instanceId);
        const database = instance.database(config.databaseId);

        // Execute the query
        const [result] = await database.run({
          sql,
          params: params || {},
        });

        if (!result || result.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Query Results\n\nProject: ${projectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\nQuery executed successfully. No results returned.`,
              },
            ],
          };
        }

        // Convert to markdown table
        const columns = Object.keys(result[0]);

        let markdown = `# Query Results\n\nProject: ${projectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\n`;
        markdown += `SQL: \`${sql}\`\n\n`;
        markdown += `Rows: ${result.length}\n\n`;

        // Table header
        markdown += "| " + columns.join(" | ") + " |\n";
        markdown += "| " + columns.map(() => "---").join(" | ") + " |\n";

        // Table rows (limit to 100 rows for display)
        const displayRows = result.slice(0, 100);
        for (const row of displayRows) {
          const rowValues = columns.map((col) => {
            const value = (row as any)[col];
            if (value === null || value === undefined) return "NULL";
            if (typeof value === "object") return JSON.stringify(value);
            return String(value);
          });

          markdown += "| " + rowValues.join(" | ") + " |\n";
        }

        if (result.length > 100) {
          markdown +=
            "\n*Results truncated. Showing 100 of " + result.length + " rows.*";
        }

        return {
          content: [
            {
              type: "text",
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error executing Spanner query: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },
  );

  // Tool to list tables
  server.tool(
    "gcp-spanner-list-tables",
    {
      instanceId: z
        .string()
        .optional()
        .describe("Spanner instance ID (defaults to SPANNER_INSTANCE env var)"),
      databaseId: z
        .string()
        .optional()
        .describe("Spanner database ID (defaults to SPANNER_DATABASE env var)"),
    },
    async ({ instanceId, databaseId }, _extra) => {
      try {
        const projectId = await getProjectId();
        const config = await getSpannerConfig(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
          Array.isArray(databaseId) ? databaseId[0] : databaseId,
        );

        const spanner = await getSpannerClient();
        logger.debug(
          `Using Spanner client with project ID: ${spanner.projectId} for execute-spanner-query`,
        );
        const instance = spanner.instance(config.instanceId);
        const database = instance.database(config.databaseId);

        // Query for tables
        // Execute query to list tables
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
            content: [
              {
                type: "text",
                text: `# Spanner Tables\n\nProject: ${projectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\nNo tables found in the database.`,
              },
            ],
          };
        }

        let markdown = `# Spanner Tables\n\nProject: ${projectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\n`;

        // Table header
        markdown += "| Table Name | Column Count |\n";
        markdown += "|------------|-------------|\n";

        // Table rows
        for (const row of tablesResult) {
          // Access the row properties directly

          // Extract table name and column count
          const tableName = ((row as any).table_name as string) || "unknown";
          const columnCount = ((row as any).column_count as number) || 0;

          markdown += `| ${tableName} | ${columnCount} |\n`;
        }

        // Add resource links for further exploration
        markdown += "\n## Available Resources\n\n";
        markdown += `- Schema: \`gcp-spanner://${projectId}/${config.instanceId}/${config.databaseId}/schema\`\n`;

        for (const row of tablesResult) {
          const tableName = ((row as any).table_name as string) || "unknown";
          markdown += `- Table Preview: \`gcp-spanner://${projectId}/${config.instanceId}/${config.databaseId}/tables/${tableName}/preview\`\n`;
        }

        return {
          content: [
            {
              type: "text",
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

  // Tool to list instances
  server.tool(
    "gcp-spanner-list-instances",
    // Define an empty schema with a dummy parameter that's optional
    // This ensures compatibility with clients that expect an object parameter
    {
      _dummy: z
        .string()
        .optional()
        .describe("Not used, just to ensure parameter compatibility"),
    },
    async (_params, _extra) => {
      try {
        // First try to get the project ID from the state manager
        let projectId = stateManager.getCurrentProjectId();

        if (projectId) {
          logger.debug(`Got project ID from state manager: ${projectId}`);
        } else {
          // If not in state manager, try to get it from environment
          const envProjectId = process.env.GOOGLE_CLOUD_PROJECT;

          if (envProjectId) {
            projectId = envProjectId;
            logger.debug(`Got project ID from environment: ${projectId}`);
            // Store in state manager for future use
            await stateManager.setCurrentProjectId(projectId);
          } else {
            // If not in environment, try to get it from our function
            projectId = await getProjectId();
            logger.debug(`Got project ID from getProjectId: ${projectId}`);
          }
        }

        if (!projectId) {
          throw new Error(
            "Project ID could not be determined. Please set a project ID using the set-project-id tool.",
          );
        }

        // Create Spanner client with explicit project ID
        const spanner = new (await import("@google-cloud/spanner")).Spanner({
          projectId: projectId,
        });

        logger.debug(
          `Using Spanner client with explicit project ID: ${projectId} for list-spanner-instances`,
        );

        const [instances] = await spanner.getInstances();

        if (!instances || instances.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Spanner Instances\n\nProject: ${projectId}\n\nNo instances found in the project.`,
              },
            ],
          };
        }

        let markdown = `# Spanner Instances\n\nProject: ${projectId}\n\n`;

        // Table header
        markdown += "| Instance ID | State | Config | Nodes |\n";
        markdown += "|-------------|-------|--------|-------|\n";

        // Table rows
        for (const instance of instances) {
          const metadata = instance.metadata || {};
          markdown += `| ${instance.id || "unknown"} | ${metadata.state || "unknown"} | ${metadata.config?.split("/").pop() || "unknown"} | ${metadata.nodeCount || "unknown"} |\n`;
        }

        // Add resource links for further exploration
        markdown += "\n## Available Resources\n\n";
        markdown += `- All Instances: \`gcp-spanner://${projectId}/instances\`\n`;

        for (const instance of instances) {
          markdown += `- Databases in ${instance.id}: \`gcp-spanner://${projectId}/${instance.id}/databases\`\n`;
        }

        return {
          content: [
            {
              type: "text",
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

  // Tool to list databases
  server.tool(
    "gcp-spanner-list-databases",
    {
      instanceId: z.string().describe("Spanner instance ID"),
    },
    async ({ instanceId }, _extra) => {
      try {
        // First try to get the project ID from the state manager
        let projectId = stateManager.getCurrentProjectId();

        if (!projectId) {
          // If not in state manager, try to get it from our function
          const authProjectId = await getProjectId();
          if (authProjectId) {
            projectId = authProjectId;
            logger.debug(`Got project ID from getProjectId: ${projectId}`);
          }
        } else {
          logger.debug(`Got project ID from state manager: ${projectId}`);
        }

        if (!projectId) {
          throw new Error(
            "Project ID could not be determined. Please set a project ID using the set-project-id tool.",
          );
        }

        // Create Spanner client with explicit project ID
        const spanner = new (await import("@google-cloud/spanner")).Spanner({
          projectId: projectId,
        });

        logger.debug(
          `Using Spanner client with project ID: ${projectId} for list-spanner-databases`,
        );
        const instance = spanner.instance(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
        );

        const [databases] = await instance.getDatabases();

        if (!databases || databases.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Spanner Databases\n\nProject: ${projectId}\nInstance: ${Array.isArray(instanceId) ? instanceId[0] : instanceId}\n\nNo databases found in the instance.`,
              },
            ],
          };
        }

        let markdown = `# Spanner Databases\n\nProject: ${projectId}\nInstance: ${Array.isArray(instanceId) ? instanceId[0] : instanceId}\n\n`;

        // Table header
        markdown += "| Database ID | State |\n";
        markdown += "|-------------|-------|\n";

        // Table rows
        for (const database of databases) {
          const metadata = database.metadata || {};
          markdown += `| ${database.id || "unknown"} | ${metadata.state || "unknown"} |\n`;
        }

        // Add resource links for further exploration
        markdown += "\n## Available Resources\n\n";

        for (const database of databases) {
          markdown += `- Tables in ${database.id}: \`gcp-spanner://${projectId}/${Array.isArray(instanceId) ? instanceId[0] : instanceId}/${database.id}/tables\`\n`;
          markdown += `- Schema for ${database.id}: \`gcp-spanner://${projectId}/${Array.isArray(instanceId) ? instanceId[0] : instanceId}/${database.id}/schema\`\n`;
        }

        return {
          content: [
            {
              type: "text",
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

  // Tool to execute natural language queries against Spanner
  server.tool(
    "gcp-spanner-query-natural-language",
    {
      query: z
        .string()
        .describe(
          "Natural language description of the query you want to execute",
        ),
      instanceId: z
        .string()
        .optional()
        .describe("Spanner instance ID (defaults to SPANNER_INSTANCE env var)"),
      databaseId: z
        .string()
        .optional()
        .describe("Spanner database ID (defaults to SPANNER_DATABASE env var)"),
    },
    async ({ query, instanceId, databaseId }, _extra) => {
      try {
        // First try to get the project ID from the state manager
        let projectId = stateManager.getCurrentProjectId();

        if (!projectId) {
          // If not in state manager, try to get it from our function
          const authProjectId = await getProjectId();
          if (authProjectId) {
            projectId = authProjectId;
            logger.debug(`Got project ID from getProjectId: ${projectId}`);
          }
        } else {
          logger.debug(`Got project ID from state manager: ${projectId}`);
        }

        if (!projectId) {
          throw new Error(
            "Project ID could not be determined. Please set a project ID using the set-project-id tool.",
          );
        }

        const config = await getSpannerConfig(
          Array.isArray(instanceId) ? instanceId[0] : instanceId,
          Array.isArray(databaseId) ? databaseId[0] : databaseId,
        );

        // Get the schema for the database
        const schemaInfo = await getDetailedSchemaForQueryGeneration(
          config.instanceId,
          config.databaseId,
        );

        // Create Spanner client with explicit project ID
        const spanner = new (await import("@google-cloud/spanner")).Spanner({
          projectId: projectId,
        });

        logger.debug(
          `Using Spanner client with project ID: ${projectId} for execute-spanner-query`,
        );
        const instance = spanner.instance(config.instanceId);
        const database = instance.database(config.databaseId);

        const [tablesResult] = await database.run({
          sql: `SELECT table_name FROM information_schema.tables 
                WHERE table_catalog = '' AND table_schema = ''
                ORDER BY table_name`,
        });

        const tableNames = tablesResult.map(
          (row: any) => row.table_name as string,
        );

        if (!tableNames || tableNames.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Query Error\n\nNo tables found in database ${config.databaseId}.`,
              },
            ],
          };
        }

        // Generate a SQL query based on the natural language query and schema
        let generatedSql = "";

        // For simple queries about table structure, generate SQL directly
        if (
          query.toLowerCase().includes("list tables") ||
          query.toLowerCase().includes("show tables") ||
          query.toLowerCase().includes("what tables")
        ) {
          generatedSql = `SELECT table_name FROM information_schema.tables 
                          WHERE table_catalog = '' AND table_schema = ''
                          ORDER BY table_name`;
        } else if (
          query.toLowerCase().includes("schema") ||
          query.toLowerCase().includes("structure") ||
          query.toLowerCase().includes("columns")
        ) {
          // Extract table name if specified
          let tableName = "";
          for (const name of tableNames) {
            if (query.toLowerCase().includes(name.toLowerCase())) {
              tableName = name;
              break;
            }
          }

          if (tableName) {
            generatedSql = `SELECT column_name, spanner_type, is_nullable 
                            FROM information_schema.columns 
                            WHERE table_catalog = '' AND table_schema = '' AND table_name = '${tableName}'
                            ORDER BY ordinal_position`;
          } else {
            generatedSql = `SELECT table_name, column_name, spanner_type 
                            FROM information_schema.columns 
                            WHERE table_catalog = '' AND table_schema = ''
                            ORDER BY table_name, ordinal_position`;
          }
        }
        // For simple 'show all data' queries
        else if (
          query.toLowerCase().includes("all data") ||
          query.toLowerCase().includes("all rows")
        ) {
          // Extract table name if specified
          let tableName = "";
          for (const name of tableNames) {
            if (query.toLowerCase().includes(name.toLowerCase())) {
              tableName = name;
              break;
            }
          }

          if (tableName) {
            generatedSql = `SELECT * FROM ${tableName} LIMIT 100`;
          } else {
            // If no specific table mentioned, return an error
            return {
              content: [
                {
                  type: "text",
                  text: `# Query Error\n\nPlease specify which table you want to see data from. Available tables: ${tableNames.join(", ")}`,
                },
              ],
            };
          }
        }
        // For count queries
        else if (
          query.toLowerCase().includes("count") ||
          query.toLowerCase().includes("how many")
        ) {
          // Extract table name if specified
          let tableName = "";
          for (const name of tableNames) {
            if (query.toLowerCase().includes(name.toLowerCase())) {
              tableName = name;
              break;
            }
          }

          if (tableName) {
            generatedSql = `SELECT COUNT(*) as count FROM ${tableName}`;
          } else {
            // If no specific table mentioned, count rows in all tables
            const countQueries = tableNames.map(
              (name) =>
                `SELECT '${name}' as table_name, COUNT(*) as row_count FROM ${name}`,
            );
            generatedSql = countQueries.join(" UNION ALL ");
          }
        }
        // For more complex queries, provide schema information and ask the user to use execute-spanner-query
        else {
          return {
            content: [
              {
                type: "text",
                text: `# Complex Query Detected\n\nYour query requires a custom SQL statement. Here's the database schema to help you formulate your query:\n\n\`\`\`\n${schemaInfo}\n\`\`\`\n\nPlease use the \`execute-spanner-query\` tool with a specific SQL statement to query this data.\n\nExample:\n\`\`\`sql\nSELECT * FROM [table_name] WHERE [condition] LIMIT 100\n\`\`\``,
              },
            ],
          };
        }

        // Execute the generated SQL query
        // Execute the generated SQL query
        const [result] = await database.run({
          sql: generatedSql,
        });

        if (!result || result.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Query Results\n\nProject: ${projectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\nNatural Language Query: ${query}\n\nGenerated SQL: \`${generatedSql}\`\n\nQuery executed successfully. No results returned.`,
              },
            ],
          };
        }

        // Convert to markdown table
        const columns = Object.keys(result[0]);

        let markdown = `# Query Results\n\nProject: ${projectId}\nInstance: ${config.instanceId}\nDatabase: ${config.databaseId}\n\n`;
        markdown += `Natural Language Query: ${query}\n\n`;
        markdown += `Generated SQL: \`${generatedSql}\`\n\n`;
        markdown += `Rows: ${result.length}\n\n`;

        // Table header
        markdown += "| " + columns.join(" | ") + " |\n";
        markdown += "| " + columns.map(() => "---").join(" | ") + " |\n";

        // Table rows (limit to 100 rows for display)
        const displayRows = result.slice(0, 100);
        for (const row of displayRows) {
          const rowValues = columns.map((col) => {
            const value = (row as any)[col];
            if (value === null || value === undefined) return "NULL";
            if (typeof value === "object") return JSON.stringify(value);
            return String(value);
          });

          markdown += "| " + rowValues.join(" | ") + " |\n";
        }

        if (result.length > 100) {
          markdown +=
            "\n*Results truncated. Showing 100 of " + result.length + " rows.*";
        }

        // Add a note about using execute-spanner-query for more complex queries
        markdown += "\n\n## Need a more complex query?\n\n";
        markdown +=
          "For more complex queries, use the `execute-spanner-query` tool with a specific SQL statement.";

        return {
          content: [
            {
              type: "text",
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error executing natural language Spanner query: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `# Query Error\n\nFailed to execute query: ${error.message}\n\nIf this is a complex query, please use the \`execute-spanner-query\` tool with a specific SQL statement.`,
            },
          ],
        };
      }
    },
  );
}
