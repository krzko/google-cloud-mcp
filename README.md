# Google Cloud MCP Server

A Model Context Protocol server that connects to Google Cloud services to provide context and tools for interacting with your Google Cloud resources.

<a href="https://glama.ai/mcp/servers/@krzko/google-cloud-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@krzko/google-cloud-mcp/badge" alt="Google Cloud Server MCP server" />
</a>

## Services

Supported Google Cloud services:

- [x] [Error Reporting](https://cloud.google.com/error-reporting)
- [x] [Identity and Access Management (IAM)](https://cloud.google.com/iam)
- [x] [Logging](https://cloud.google.com/logging)
- [x] [Monitoring](https://cloud.google.com/monitoring)
- [x] [Profiler](https://cloud.google.com/profiler)
- [x] [Spanner](https://cloud.google.com/spanner)

### Error Reporting

Monitor and analyse application errors with automated investigation and remediation suggestions:

- List and analyse error groups with customisable time ranges (default 1h)
- Get detailed error group information with recent events and stack traces
- Analyse error trends over time to identify patterns and spikes
- Generate comprehensive remediation suggestions based on error patterns
- Investigate errors by service, time range, or severity

### IAM

Query and analyse IAM policies and permissions:

- Retrieve project-level IAM policies with detailed summaries
- Test IAM permissions on projects and specific resources
- Validate deployment permissions for common GCP services (Cloud Run, GKE, Compute Engine, etc.)
- Analyse permission gaps for specific operations
- Generate IAM policy analysis with security insights

### Logging

Query and filter log entries from Google Cloud Logging:

- Query logs with custom filters
- Search logs within specific time ranges
- Format and display log entries in a readable format

### Spanner

Interact with Google Cloud Spanner databases:

- Execute SQL queries against Spanner databases
- List available databases and tables
- Explore database schema

### Monitoring

Retrieve and analyse metrics from Google Cloud Monitoring:

- Query metrics with custom filters
- Visualise metric data over time
- List available metric types

### Profiler

Analyse application performance with Google Cloud Profiler:

- List and analyse profiles with filtering by type (CPU, Heap, Wall, etc.)
- Perform detailed performance analysis with bottleneck identification
- Compare profile trends over time to track performance changes
- Generate actionable recommendations for optimisation
- Support for multiple programming languages (Go, Java, Node.js, Python)
- Analyse CPU hotspots, memory allocation patterns, and execution timing

### Trace

Analyse distributed traces from Google Cloud Trace:

- Retrieve traces by ID
- List recent traces with filtering options
- Find traces associated with logs
- Identify failed traces
- Use natural language to query traces (e.g., "Show me failed traces from the last hour")

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

### Using with Smithery (soon)

This server can be deployed and used with Smithery. The server implements lazy loading of authentication, which means it will start immediately and defer authentication until it's actually needed. Authentication is still required for operation, but this approach prevents timeouts during server initialization.

NOTE: Smithery local server support is currently in development and may not yet available.

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
