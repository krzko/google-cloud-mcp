# Google Cloud MCP Server

A Model Context Protocol server that connects to Google Cloud services to provide context and tools for interacting with your Google Cloud resources.

<a href="https://glama.ai/mcp/servers/@krzko/google-cloud-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@krzko/google-cloud-mcp/badge" alt="Google Cloud Server MCP server" />
</a>

## Services

Supported Google Cloud services:

- [x] [Billing](https://cloud.google.com/billing)
- [x] [Error Reporting](https://cloud.google.com/error-reporting)
- [x] [Identity and Access Management (IAM)](https://cloud.google.com/iam)
- [x] [Logging](https://cloud.google.com/logging)
- [x] [Monitoring](https://cloud.google.com/monitoring)
- [x] [Profiler](https://cloud.google.com/profiler)
- [x] [Spanner](https://cloud.google.com/spanner)
- [x] [Trace](https://cloud.google.com/trace)

### Billing

Manage and analyse Google Cloud billing with cost optimisation insights:

**Tools:** `gcp-billing-list-accounts`, `gcp-billing-get-account-details`, `gcp-billing-list-projects`, `gcp-billing-get-project-info`, `gcp-billing-list-services`, `gcp-billing-list-skus`, `gcp-billing-analyse-costs`, `gcp-billing-detect-anomalies`, `gcp-billing-cost-recommendations`, `gcp-billing-service-breakdown`

*Example prompts:*
- "Show me all my billing accounts"
- "Analyse costs for project my-app-prod-123 for the last 30 days"
- "Generate cost recommendations for billing account billingAccounts/123456-789ABC-DEF012"
- "Check for billing anomalies in project my-ecommerce-456"

### Error Reporting

Monitor and analyse application errors with automated investigation and remediation suggestions:

**Tools:** `gcp-error-reporting-list-groups`, `gcp-error-reporting-get-group-details`, `gcp-error-reporting-analyse-trends`

*Example prompts:*
- "Show me error groups from project my-webapp-prod-789 for the last hour"
- "Get details for error group projects/my-app-123/groups/xyz789"
- "Analyse error trends for service my-api in project analytics-prod-456"

### IAM

Query and analyse IAM policies and permissions:

**Tools:** `gcp-iam-get-project-policy`, `gcp-iam-test-project-permissions`, `gcp-iam-test-resource-permissions`, `gcp-iam-validate-deployment-permissions`, `gcp-iam-list-deployment-services`, `gcp-iam-analyse-permission-gaps`

*Example prompts:*
- "Get IAM policy for project my-webapp-prod-123"
- "Test if I have storage.buckets.create permission on project data-lake-456"
- "Check deployment permissions for Cloud Run in project microservices-789"
- "Analyse permission gaps for deploying to GKE cluster in project k8s-prod-321"

### Logging

Query and filter log entries from Google Cloud Logging:

**Tools:** `gcp-logging-query-logs`, `gcp-logging-query-time-range`, `gcp-logging-search-comprehensive`

*Example prompts:*
- "Show me logs from project my-app-prod-123 from the last hour with severity ERROR"
- "Search for logs containing 'timeout' from service my-api in project backend-456"
- "Query logs for resource type gce_instance in project compute-prod-789"

### Spanner

Interact with Google Cloud Spanner databases:

**Tools:** `gcp-spanner-execute-query`, `gcp-spanner-list-tables`, `gcp-spanner-list-instances`, `gcp-spanner-list-databases`, `gcp-spanner-query-natural-language`, `gcp-spanner-query-count`

*Example prompts:*
- "List all databases in Spanner instance my-instance in project ecommerce-prod-123"
- "Execute SQL: SELECT COUNT(*) FROM users in database user-db in project my-app-456"
- "Show me table structure for orders in database inventory-db in project retail-789"

### Monitoring

Retrieve and analyse metrics from Google Cloud Monitoring:

**Tools:** `gcp-monitoring-query-metrics`, `gcp-monitoring-list-metric-types`, `gcp-monitoring-query-natural-language`

*Example prompts:*
- "Show me CPU utilisation metrics for project web-app-prod-123 for the last 6 hours"
- "List available metric types for Compute Engine in project infrastructure-456"
- "Query memory usage for instances in project backend-services-789"

### Profiler

Analyse application performance with Google Cloud Profiler:

**Tools:** `gcp-profiler-list-profiles`, `gcp-profiler-analyse-performance`, `gcp-profiler-compare-trends`

*Example prompts:*
- "List CPU profiles from project my-java-app-123 for the last 24 hours"
- "Analyse performance bottlenecks in service my-api in project backend-prod-456"
- "Compare heap profiles for deployment v1.2 vs v1.3 in project performance-test-789"

### Trace

Analyse distributed traces from Google Cloud Trace:

**Tools:** `gcp-trace-get-trace`, `gcp-trace-list-traces`, `gcp-trace-find-from-logs`, `gcp-trace-query-natural-language`

*Example prompts:*
- "Get trace details for ID abc123def456 in project distributed-app-789"
- "Show me failed traces from project microservices-prod-123 from the last hour"
- "Find logs related to trace xyz789 in project web-backend-456"
- "Query traces for service checkout-api in project ecommerce-prod-321"

## Quick Start

Once configured, you can interact with Google Cloud services using natural language:

```
"What are my current billing costs for project my-webapp-prod-123?"
"Show me errors from project ecommerce-api-456 in the last hour"
"Check if I have permission to deploy to Cloud Run in project microservices-789"
"Find logs containing 'database timeout' from project backend-prod-321 yesterday"
"List Spanner databases in instance prod-db for project data-store-654"
"What's the CPU usage of Compute Engine instances in project infrastructure-987?"
```

## Authentication

This server supports two methods of authentication with Google Cloud:

1. **Service Account Key File** (Recommended): Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of your service account key file. This is the standard Google Cloud authentication method.

2. **Environment Variables**: Set `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` environment variables directly. This is useful for environments where storing a key file is not practical.

The server will also use the `GOOGLE_CLOUD_PROJECT` environment variable if set, otherwise it will attempt to determine the project ID from the authentication credentials.

## Installation

### Option 1: Using Docker (Recommended)

The easiest way to run this MCP server is using Docker. Ensure you have your
application default credentials set up with the Google Cloud SDK before doing
this.
```bash
# Set your project ID
gcloud auth application-default login
```

**Configure your MCP client to use the Docker container:**

```json
{
  "mcpServers": {
    "google-cloud-mcp": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "GOOGLE_CLOUD_PROJECT=your-project-id",
        "-v", "/Users/foo/.config/gcloud/application_default_credentials.json:/app/credentials/key.json:ro",
        "-e", "GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/key.json",
        "ghcr.io/krzko/google-cloud-mcp:latest"
      ]
    }
  }
}
```

### Option 2: Local Installation

```bash
# Clone the repository
git clone https://github.com/krzko/google-cloud-mcp.git
cd google-cloud-mcp

# Install dependencies
pnpm install

# Build
pnpm build
```

Authenticate to Google Cloud:

```bash
gcloud auth application-default login
```

Configure the `mcpServers` in your client:

```json
{
  "mcpServers": {
      "google-cloud-mcp": {
          "command": "node",
          "args": [
              "/Users/foo/code/google-cloud-mcp/dist/index.js"
          ],
          "env": {
              "GOOGLE_APPLICATION_CREDENTIALS": "/Users/foo/.config/gcloud/application_default_credentials.json"
          }
      }
  }
}
```

## Docker Usage

### Quick Start

```bash
# Run with minimal configuration
docker run --rm -e GOOGLE_CLOUD_PROJECT=your-project ghcr.io/krzko/google-cloud-mcp:latest

# Run with debug logging
docker run --rm \
  -e GOOGLE_CLOUD_PROJECT=your-project \
  -e DEBUG=true \
  ghcr.io/krzko/google-cloud-mcp:latest
```

### Authentication Methods

**Method 1: Service Account Key File (Recommended)**
```bash
docker run --rm \
  -e GOOGLE_CLOUD_PROJECT=your-project \
  -v /path/to/service-account-key.json:/app/credentials/key.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/key.json \
  ghcr.io/krzko/google-cloud-mcp:latest
```

**Method 2: Environment Variables**
```bash
docker run --rm \
  -e GOOGLE_CLOUD_PROJECT=your-project \
  -e GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com \
  -e GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..." \
  ghcr.io/krzko/google-cloud-mcp:latest
```

**Method 3: Application Default Credentials**
```bash
docker run --rm \
  -e GOOGLE_CLOUD_PROJECT=your-project \
  -v ~/.config/gcloud/application_default_credentials.json:/app/credentials/key.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/key.json \
  ghcr.io/krzko/google-cloud-mcp:latest
```

### Docker Compose

Use the included `docker-compose.yml` for easier local development:

```yaml
# Set environment variables
export GOOGLE_CLOUD_PROJECT=your-project-id
export DEBUG=false

# Run the production service
docker-compose up google-cloud-mcp

# Run the development service with live reload
docker-compose --profile dev up google-cloud-mcp-dev
```

### Building Locally

```bash
# Build the Docker image
docker build -t google-cloud-mcp .

# Run your locally built image
docker run --rm -e GOOGLE_CLOUD_PROJECT=your-project google-cloud-mcp

# Build for development with live reload
docker build --target development -t google-cloud-mcp:dev .
docker run --rm -v $(pwd):/app -e GOOGLE_CLOUD_PROJECT=your-project google-cloud-mcp:dev
```

## Development

### Starting the server

```bash
# Build the project
pnpm build

# Start the server
pnpm start
```

### Development mode

```bash
# Build the project
pnpm build

# Start the server and inspector
npx -y @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

### Server Timeout Issues

If you encounter timeout issues when running the server with Smithery, try the following:

1. Enable debug logging by setting `debug: true` in your configuration
2. Ensure `lazyAuth: true` is set to defer authentication until it's actually needed
3. Ensure your credentials file is accessible and valid
4. Check the logs for any error messages

**Important**: Authentication is still required for operation, but with lazy loading enabled, the server will start immediately and authenticate when needed rather than during initialization.

### Authentication Issues

The server supports two methods of authentication:

1. **Service Account Key File**: Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of your service account key file
2. **Environment Variables**: Set `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` environment variables

If you're having authentication issues, make sure:

- Your service account has the necessary permissions
- The key file is properly formatted and accessible
- Environment variables are correctly set
