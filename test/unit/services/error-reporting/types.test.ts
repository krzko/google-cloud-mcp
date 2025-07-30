/**
 * Tests for Error Reporting service types and utilities
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';

// Create specific Error Reporting auth mock
const mockErrorReportingAuth = {
  getClient: vi.fn().mockResolvedValue({
    getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' })
  }),
  getProjectId: vi.fn().mockResolvedValue('test-project'),
};

// Mock the auth module specifically for Error Reporting
vi.mock('../../../../src/utils/auth.js', () => ({
  initGoogleAuth: vi.fn().mockResolvedValue(mockErrorReportingAuth),
  getProjectId: vi.fn().mockResolvedValue('test-project'),
}));

describe('Error Reporting Types and Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockClient = { getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }) };
    mockErrorReportingAuth.getClient.mockResolvedValue(mockClient);
    mockErrorReportingAuth.getProjectId.mockResolvedValue('test-project');
  });

  describe('formatErrorGroupSummary', () => {
    it('should format error group summary correctly', async () => {
      const { formatErrorGroupSummary } = await import('../../../../src/services/error-reporting/types.js');
      
      const mockErrorGroup = {
        group: {
          name: 'projects/test-project/groups/test-group-1',
          groupId: 'test-group-1',
          resolutionStatus: 'OPEN' as const,
          trackingIssues: [
            { url: 'https://github.com/test/issues/123' }
          ]
        },
        count: '42',
        affectedUsersCount: '5',
        timedCounts: [
          {
            count: '20',
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T11:00:00Z'
          }
        ],
        firstSeenTime: '2024-01-01T09:00:00Z',
        lastSeenTime: '2024-01-01T12:00:00Z',
        affectedServices: [
          {
            service: 'test-service',
            version: '1.0.0'
          }
        ],
        representative: {
          eventTime: '2024-01-01T12:00:00Z',
          serviceContext: {
            service: 'test-service',
            version: '1.0.0'
          },
          message: 'Test error message',
          context: {
            httpRequest: {
              method: 'GET',
              url: 'https://example.com/api',
              responseStatusCode: 500,
              userAgent: 'Test-Agent/1.0'
            },
            reportLocation: {
              filePath: 'src/test.ts',
              lineNumber: 42,
              functionName: 'testFunction'
            },
            user: 'test-user@example.com'
          }
        }
      };
      
      const formatted = formatErrorGroupSummary(mockErrorGroup);
      
      expect(formatted).toMatch(/^## Error Group:/); // Starts with ## Error Group:
      expect(formatted).toContain('test-group-1'); // Contains group ID
      expect(formatted).toContain('Test error message'); // Contains message
      expect(formatted).toContain('test-service'); // Contains service
      expect(formatted).toContain('v1.0.0'); // Contains version
      expect(formatted).toContain('Total occurrences: 42'); // Contains count
      expect(formatted).toContain('Affected users: 5'); // Contains affected users
      expect(formatted).toContain('**Resolution Status:** OPEN'); // Contains status
      expect(formatted).toContain('https://github.com/test/issues/123'); // Contains tracking issue
      expect(formatted).toContain('GET https://example.com/api'); // Contains HTTP request
      expect(formatted).toContain('Response status: 500'); // Contains status code
      expect(formatted).toContain('src/test.ts:42'); // Contains source location
      expect(formatted).toContain('testFunction'); // Contains function name
    });

    it('should handle error group with minimal data', async () => {
      const { formatErrorGroupSummary } = await import('../../../../src/services/error-reporting/types.js');
      
      const minimalErrorGroup = {
        group: {
          name: 'projects/test-project/groups/minimal-group',
          groupId: 'minimal-group'
        },
        count: '1',
        affectedUsersCount: '1',
        firstSeenTime: '2024-01-01T09:00:00Z',
        lastSeenTime: '2024-01-01T09:00:00Z',
        representative: {}
      };
      
      const formatted = formatErrorGroupSummary(minimalErrorGroup);
      
      expect(formatted).toContain('minimal-group');
      expect(formatted).toContain('No message'); // Default message
      expect(formatted).toContain('Unknown'); // Default service
      expect(formatted).toContain('Total occurrences: 1');
    });

    it('should handle error group with missing optional fields', async () => {
      const { formatErrorGroupSummary } = await import('../../../../src/services/error-reporting/types.js');
      
      const errorGroupWithoutOptionals = {
        group: {
          name: 'projects/test-project/groups/test-group',
          groupId: 'test-group'
          // No resolutionStatus or trackingIssues
        },
        count: '10',
        affectedUsersCount: '3',
        firstSeenTime: '2024-01-01T09:00:00Z',
        lastSeenTime: '2024-01-01T09:00:00Z',
        representative: {
          serviceContext: {
            service: 'minimal-service'
            // No version
          },
          message: 'Simple error'
          // No context
        }
      };
      
      const formatted = formatErrorGroupSummary(errorGroupWithoutOptionals);
      
      expect(formatted).toContain('test-group');
      expect(formatted).toContain('Simple error');
      expect(formatted).toContain('minimal-service');
      expect(formatted).not.toContain('Resolution Status'); // Should not appear
      expect(formatted).not.toContain('Tracking Issues'); // Should not appear
      expect(formatted).not.toContain('HTTP Request Context'); // Should not appear
    });

    it('should handle undefined/null representative and group safely', async () => {
      const { formatErrorGroupSummary } = await import('../../../../src/services/error-reporting/types.js');
      
      const errorGroupWithNulls = {
        group: null,
        count: '5',
        affectedUsersCount: '2',
        firstSeenTime: '2024-01-01T09:00:00Z',
        lastSeenTime: '2024-01-01T09:00:00Z',
        representative: null
      };
      
      const formatted = formatErrorGroupSummary(errorGroupWithNulls as any);
      
      expect(formatted).toContain('Unknown'); // Default group ID
      expect(formatted).toContain('No message'); // Default message
      expect(formatted).toContain('Total occurrences: 5');
    });
  });

  describe('analyseErrorPatternsAndSuggestRemediation', () => {
    it('should analyse error patterns and provide recommendations', async () => {
      const { analyseErrorPatternsAndSuggestRemediation } = await import('../../../../src/services/error-reporting/types.js');
      
      const mockErrorGroups = [
        {
          group: {
            groupId: 'group-1'
          },
          count: '100',
          affectedUsersCount: '10',
          lastSeenTime: new Date().toISOString(), // Recent error
          representative: {
            serviceContext: {
              service: 'api-service'
            },
            message: 'Database connection timeout',
            context: {
              httpRequest: {
                responseStatusCode: 500
              }
            }
          }
        },
        {
          group: {
            groupId: 'group-2'
          },
          count: '50',
          affectedUsersCount: '5',
          lastSeenTime: '2024-01-01T09:00:00Z', // Old error
          representative: {
            serviceContext: {
              service: 'auth-service'
            },
            message: 'Permission denied access',
            context: {
              httpRequest: {
                responseStatusCode: 403
              }
            }
          }
        }
      ];
      
      const analysis = analyseErrorPatternsAndSuggestRemediation(mockErrorGroups as any);
      
      expect(analysis).toContain('Error Analysis and Remediation Suggestions');
      expect(analysis).toContain('**Total Error Groups:** 2');
      expect(analysis).toContain('Total errors: 150'); // 100 + 50
      expect(analysis).toContain('Total affected users: 15'); // 10 + 5
      expect(analysis).toContain('Top Error Groups by Frequency');
      expect(analysis).toContain('api-service'); // Top service by count
      expect(analysis).toContain('Database connection timeout');
      expect(analysis).toContain('**Services Affected:** 2');
      expect(analysis).toContain('Recent Activity'); // Should detect recent errors
      
      // Check for specific remediation suggestions
      expect(analysis).toContain('**Timeout Issues:**'); // Based on message content
      expect(analysis).toContain('**Server Error (5xx):**'); // Based on 500 status
    });

    it('should handle empty error groups', async () => {
      const { analyseErrorPatternsAndSuggestRemediation } = await import('../../../../src/services/error-reporting/types.js');
      
      const analysis = analyseErrorPatternsAndSuggestRemediation([]);
      
      expect(analysis).toBe('No errors found in the specified time range.');
    });

    it('should group errors by service correctly', async () => {
      const { analyseErrorPatternsAndSuggestRemediation } = await import('../../../../src/services/error-reporting/types.js');
      
      const errorGroupsMultipleServices = [
        {
          group: { groupId: 'group-1' },
          count: '30',
          affectedUsersCount: '3',
          lastSeenTime: '2024-01-01T09:00:00Z',
          representative: {
            serviceContext: { service: 'service-a' },
            message: 'Error in service A'
          }
        },
        {
          group: { groupId: 'group-2' },
          count: '20',
          affectedUsersCount: '2',
          lastSeenTime: '2024-01-01T09:00:00Z',
          representative: {
            serviceContext: { service: 'service-a' },
            message: 'Another error in service A'
          }
        },
        {
          group: { groupId: 'group-3' },
          count: '10',
          affectedUsersCount: '1',
          lastSeenTime: '2024-01-01T09:00:00Z',
          representative: {
            serviceContext: { service: 'service-b' },
            message: 'Error in service B'
          }
        }
      ];
      
      const analysis = analyseErrorPatternsAndSuggestRemediation(errorGroupsMultipleServices as any);
      
      expect(analysis).toContain('**Services Affected:** 2');
      expect(analysis).toContain('service-a: 2 error groups, 50 total errors');
      expect(analysis).toContain('service-b: 1 error groups, 10 total errors');
    });

    it('should provide specific remediation suggestions based on error patterns', async () => {
      const { analyseErrorPatternsAndSuggestRemediation } = await import('../../../../src/services/error-reporting/types.js');
      
      const errorGroupsWithSpecificErrors = [
        {
          group: { groupId: 'memory-error' },
          count: '25',
          affectedUsersCount: '5',
          lastSeenTime: '2024-01-01T09:00:00Z',
          representative: {
            serviceContext: { service: 'memory-service' },
            message: 'OutOfMemoryError: Java heap space exceeded'
          }
        },
        {
          group: { groupId: 'auth-error' },
          count: '15',
          affectedUsersCount: '3',
          lastSeenTime: '2024-01-01T09:00:00Z',
          representative: {
            serviceContext: { service: 'auth-service' },
            message: 'Invalid API key provided',
            context: {
              httpRequest: { responseStatusCode: 401 }
            }
          }
        }
      ];
      
      const analysis = analyseErrorPatternsAndSuggestRemediation(errorGroupsWithSpecificErrors as any);
      
      expect(analysis).toContain('**Memory Issues:**'); // Should detect memory error
      expect(analysis).toContain('**Client Error (4xx):**'); // Should detect 401 error
      expect(analysis).toContain('**Authentication/Authorisation:**'); // Should detect auth error
    });
  });

  describe('getErrorReportingAuth', () => {
    it('should return authentication client and token', async () => {
      const { getErrorReportingAuth } = await import('../../../../src/services/error-reporting/types.js');
      
      const authResult = await getErrorReportingAuth();
      
      expect(authResult).toBeDefined();
      expect(authResult.auth).toBeDefined();
      expect(authResult.token).toBe('mock-token');
    });

    it('should handle authentication failure', async () => {
      const { getErrorReportingAuth } = await import('../../../../src/services/error-reporting/types.js');
      
      // Mock auth failure
      const mockClient = { getAccessToken: vi.fn().mockRejectedValue(new Error('Auth failed')) };
      mockErrorReportingAuth.getClient.mockResolvedValue(mockClient);
      
      await expect(getErrorReportingAuth()).rejects.toThrow('Auth failed');
    });

    it('should handle missing auth client', async () => {
      // Re-import the module with mocked auth returning null
      vi.doMock('../../../../src/utils/auth.js', () => ({
        initGoogleAuth: vi.fn().mockResolvedValue(null),
        getProjectId: vi.fn().mockResolvedValue('test-project'),
      }));
      
      // Need to re-import after mocking
      const { getErrorReportingAuth } = await import('../../../../src/services/error-reporting/types.js?timestamp=' + Date.now());
      
      await expect(getErrorReportingAuth()).rejects.toThrow('Google Cloud authentication not available');
    });
  });

  describe('ErrorGroupStats interface', () => {
    it('should handle error group stats structure', async () => {
      const { formatErrorGroupSummary } = await import('../../../../src/services/error-reporting/types.js');
      
      const errorGroupStats = {
        group: {
          name: 'projects/test/groups/test',
          groupId: 'test'
        },
        count: '42',
        affectedUsersCount: '5',
        firstSeenTime: '2024-01-01T09:00:00Z',
        lastSeenTime: '2024-01-01T12:00:00Z',
        representative: {
          message: 'Test message'
        }
      };
      
      // Should not throw when formatting valid structure
      expect(() => formatErrorGroupSummary(errorGroupStats as any)).not.toThrow();
    });
  });

  describe('Error context handling', () => {
    it('should handle various HTTP status codes in suggestions', async () => {
      const { analyseErrorPatternsAndSuggestRemediation } = await import('../../../../src/services/error-reporting/types.js');
      
      const errorGroupsWith404 = [
        {
          group: { groupId: 'not-found' },
          count: '10',
          affectedUsersCount: '2',
          lastSeenTime: '2024-01-01T09:00:00Z',
          representative: {
            serviceContext: { service: 'api-service' },
            message: 'Resource not found',
            context: {
              httpRequest: { responseStatusCode: 404 }
            }
          }
        }
      ];
      
      const analysis = analyseErrorPatternsAndSuggestRemediation(errorGroupsWith404 as any);
      
      expect(analysis).toContain('**404 Not Found:**');
      expect(analysis).toContain('Verify routing configuration');
    });

    it('should handle network and connection errors', async () => {
      const { analyseErrorPatternsAndSuggestRemediation } = await import('../../../../src/services/error-reporting/types.js');
      
      const networkErrors = [
        {
          group: { groupId: 'network-error' },
          count: '5',
          affectedUsersCount: '1',
          lastSeenTime: '2024-01-01T09:00:00Z',
          representative: {
            serviceContext: { service: 'external-api' },
            message: 'Connection refused to external service'
          }
        }
      ];
      
      const analysis = analyseErrorPatternsAndSuggestRemediation(networkErrors as any);
      
      expect(analysis).toContain('**Network Issues:**');
      expect(analysis).toContain('Check network connectivity');
      expect(analysis).toContain('circuit breaker pattern');
    });
  });
});