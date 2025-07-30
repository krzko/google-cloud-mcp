/**
 * Test utilities and helpers
 */
import { vi } from 'vitest';

/**
 * Create a mock MCP server instance
 */
export function createMockMcpServer() {
  return {
    registerTool: vi.fn(),
    tool: vi.fn(),
    resource: vi.fn(),
    prompt: vi.fn(),
    registerPrompt: vi.fn(),
    connect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

/**
 * Create mock Google Cloud clients
 */
export function createMockGoogleCloudClients() {
  return {
    logging: {
      getEntries: vi.fn(),
      getMetrics: vi.fn(),
      createSink: vi.fn(),
    },
    monitoring: {
      listTimeSeries: vi.fn(),
      createTimeSeries: vi.fn(),
      listMetricDescriptors: vi.fn(),
    },
    spanner: {
      instance: vi.fn(() => ({
        database: vi.fn(() => ({
          run: vi.fn(),
          runStream: vi.fn(),
          getSchema: vi.fn(),
        })),
      })),
    },
    resourceManager: {
      getIamPolicy: vi.fn(),
      setIamPolicy: vi.fn(),
      testIamPermissions: vi.fn(),
    },
  };
}

/**
 * Create mock authentication client
 */
export function createMockAuthClient() {
  return {
    getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }),
    getProjectId: vi.fn().mockResolvedValue('test-project'),
    authorize: vi.fn(),
  };
}

/**
 * Wait for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create mock log entries
 */
export function createMockLogEntries(count: number = 5) {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date().toISOString(),
    severity: i % 2 === 0 ? 'INFO' : 'ERROR',
    textPayload: `Mock log entry ${i}`,
    resource: {
      type: 'gce_instance',
      labels: {
        instance_id: `instance-${i}`,
        zone: 'us-central1-a',
      },
    },
    labels: {
      service: 'test-service',
      version: '1.0.0',
    },
  }));
}

/**
 * Create mock IAM policy
 */
export function createMockIamPolicy() {
  return {
    bindings: [
      {
        role: 'roles/owner',
        members: ['user:test@example.com'],
      },
      {
        role: 'roles/viewer',
        members: ['serviceAccount:test@test-project.iam.gserviceaccount.com'],
      },
    ],
    etag: 'mock-etag',
    version: 1,
  };
}

/**
 * Create mock Spanner database schema
 */
export function createMockSpannerSchema() {
  return [
    {
      name: 'Users',
      columns: [
        { name: 'id', type: 'STRING(36)', nullable: false },
        { name: 'email', type: 'STRING(255)', nullable: false },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false },
      ],
      primaryKey: ['id'],
    },
    {
      name: 'Orders',
      columns: [
        { name: 'id', type: 'STRING(36)', nullable: false },
        { name: 'user_id', type: 'STRING(36)', nullable: false },
        { name: 'total', type: 'NUMERIC', nullable: false },
      ],
      primaryKey: ['id'],
    },
  ];
}

/**
 * Create mock Error Reporting error group stats
 */
export function createMockErrorGroupStats(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    group: {
      name: `projects/test-project/groups/error-group-${i}`,
      groupId: `error-group-${i}`,
      resolutionStatus: i % 2 === 0 ? 'OPEN' : 'ACKNOWLEDGED',
      trackingIssues: i === 0 ? [{ url: `https://github.com/test/issues/${i + 100}` }] : undefined
    },
    count: `${(i + 1) * 10}`,
    affectedUsersCount: `${i + 1}`,
    timedCounts: [
      {
        count: `${(i + 1) * 5}`,
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T11:00:00Z'
      }
    ],
    firstSeenTime: '2024-01-01T09:00:00Z',
    lastSeenTime: new Date().toISOString(),
    affectedServices: [
      {
        service: `test-service-${i}`,
        version: '1.0.0'
      }
    ],
    representative: {
      eventTime: new Date().toISOString(),
      serviceContext: {
        service: `test-service-${i}`,
        version: '1.0.0'
      },
      message: `Test error message ${i}`,
      context: {
        httpRequest: {
          method: 'GET',
          url: `https://example.com/api/endpoint${i}`,
          responseStatusCode: i % 2 === 0 ? 500 : 404,
          userAgent: 'Test-Agent/1.0'
        },
        reportLocation: {
          filePath: `src/service${i}.ts`,
          lineNumber: (i + 1) * 10,
          functionName: `testFunction${i}`
        },
        user: `test-user${i}@example.com`
      }
    }
  }));
}

/**
 * Create mock Error Reporting error events
 */
export function createMockErrorEvents(count: number = 5) {
  return Array.from({ length: count }, (_, i) => ({
    eventTime: new Date(Date.now() - i * 60000).toISOString(), // Spread over time
    serviceContext: {
      service: 'test-service',
      version: '1.0.0'
    },
    message: `Error event ${i}: ${i % 2 === 0 ? 'Database timeout' : 'Invalid request'}`,
    context: {
      httpRequest: {
        method: i % 2 === 0 ? 'POST' : 'GET',
        url: `https://example.com/api/data/${i}`,
        responseStatusCode: i % 2 === 0 ? 500 : 400,
        userAgent: 'Test-Agent/1.0',
        remoteIp: `192.168.1.${100 + i}`
      },
      user: `user${i}@example.com`,
      reportLocation: {
        filePath: 'src/handler.ts',
        lineNumber: 50 + i,
        functionName: 'processRequest'
      }
    }
  }));
}

/**
 * Create mock Error Reporting error group
 */
export function createMockErrorGroup() {
  return {
    name: 'projects/test-project/groups/test-group-1',
    groupId: 'test-group-1',
    resolutionStatus: 'OPEN',
    trackingIssues: [
      { url: 'https://github.com/test/issues/123' },
      { url: 'https://jira.company.com/browse/BUG-456' }
    ]
  };
}