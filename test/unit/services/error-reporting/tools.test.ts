/**
 * Tests for Error Reporting service tools
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { createMockMcpServer } from '../../../utils/test-helpers.js';

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

// Mock global fetch
global.fetch = vi.fn();
const mockFetch = fetch as any;

// Mock error reporting data
const mockErrorGroupStats = [
  {
    group: {
      name: 'projects/test-project/groups/test-group-1',
      groupId: 'test-group-1',
      resolutionStatus: 'OPEN'
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
          responseStatusCode: 500
        },
        reportLocation: {
          filePath: 'src/test.ts',
          lineNumber: 42,
          functionName: 'testFunction'
        }
      }
    }
  }
];

const mockErrorEvents = [
  {
    eventTime: '2024-01-01T12:00:00Z',
    serviceContext: {
      service: 'test-service',
      version: '1.0.0'
    },
    message: 'Test error event message',
    context: {
      httpRequest: {
        method: 'POST',
        url: 'https://example.com/api/data',
        responseStatusCode: 500,
        userAgent: 'Test-Agent/1.0'
      },
      user: 'test-user@example.com'
    }
  }
];

const mockErrorGroup = {
  name: 'projects/test-project/groups/test-group-1',
  groupId: 'test-group-1',
  resolutionStatus: 'OPEN',
  trackingIssues: [
    { url: 'https://github.com/test/issues/123' }
  ]
};

describe('Error Reporting Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
    
    // Reset auth mock to ensure it always returns the mocked auth client
    const mockClient = { getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }) };
    mockErrorReportingAuth.getClient.mockResolvedValue(mockClient);
    mockErrorReportingAuth.getProjectId.mockResolvedValue('test-project');
    
    // Mock successful fetch responses by default
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        errorGroupStats: mockErrorGroupStats
      }),
      text: vi.fn().mockResolvedValue('{}')
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('registerErrorReportingTools', () => {
    it('should register error reporting tools with MCP server', async () => {
      // Mock the auth module to return our mock auth
      const authModule = await import('../../../../src/utils/auth.js');
      vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
      vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
      
      const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
      
      registerErrorReportingTools(mockServer as any);
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-error-reporting-list-groups',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-error-reporting-get-group-details',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-error-reporting-analyse-trends',
        expect.any(Object),
        expect.any(Function)
      );
    });

    describe('list-error-groups tool', () => {
      it('should handle successful error group listing', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-list-groups'
        );
        
        expect(toolCall).toBeDefined();
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          timeRange: '1h',
          order: 'COUNT_DESC',
          pageSize: 20
        });
        
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain('Error Groups Analysis');
        expect(result.content[0].text).toContain('test-service');
        expect(result.content[0].text).toContain('Test error message');
        
        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('projects/test-project/groupStats'),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-token'
            })
          })
        );
      });

      it('should handle empty error groups response', async () => {
        // Mock empty response
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ errorGroupStats: [] }),
          text: vi.fn().mockResolvedValue('{}')
        });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-list-groups'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          timeRange: '1h'
        });
        
        expect(result.content[0].text).toContain('No error groups found');
      });

      it('should handle API errors gracefully', async () => {
        // Mock API error
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: vi.fn().mockResolvedValue('Permission denied')
        });

        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-list-groups'
        );
        
        const toolHandler = toolCall![2];
        
        await expect(toolHandler({ timeRange: '1h' })).rejects.toThrow();
      });

      it('should handle optional parameters correctly', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-list-groups'
        );
        
        const toolHandler = toolCall![2];
        await toolHandler({
          timeRange: '24h',
          serviceFilter: 'my-service',
          order: 'LAST_SEEN_DESC',
          pageSize: 50
        });
        
        // Check that the URL contains the service filter
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('serviceFilter.service=my-service');
        expect(fetchCall[0]).toContain('timeRange.period=PERIOD_1_DAY');
        expect(fetchCall[0]).toContain('order=LAST_SEEN_DESC');
        expect(fetchCall[0]).toContain('pageSize=50');
      });
    });

    describe('get-error-group-details tool', () => {
      it('should fetch group details and events successfully', async () => {
        // Mock multiple fetch calls - first for group details, then for events
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue(mockErrorGroup),
            text: vi.fn().mockResolvedValue('{}')
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ errorEvents: mockErrorEvents }),
            text: vi.fn().mockResolvedValue('{}')
          });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-get-group-details'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          groupId: 'test-group-1',
          timeRange: '24h',
          pageSize: 10
        });
        
        expect(result.content[0].text).toContain('Error Group Details');
        expect(result.content[0].text).toContain('test-group-1');
        expect(result.content[0].text).toContain('Recent Error Events');
        expect(result.content[0].text).toContain('Test error event message');
        
        // Verify both API calls were made
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(1,
          'https://clouderrorreporting.googleapis.com/v1beta1/projects/test-project/groups/test-group-1',
          expect.any(Object)
        );
        expect(mockFetch).toHaveBeenNthCalledWith(2,
          expect.stringContaining('projects/test-project/events'),
          expect.any(Object)
        );
      });

      it('should handle no events found', async () => {
        // Mock group details success, but no events
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue(mockErrorGroup),
            text: vi.fn().mockResolvedValue('{}')
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ errorEvents: [] }),
            text: vi.fn().mockResolvedValue('{}')
          });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-get-group-details'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          groupId: 'test-group-1'
        });
        
        expect(result.content[0].text).toContain('No error events found');
      });

      it('should handle group not found error', async () => {
        // Mock group details 404
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          text: vi.fn().mockResolvedValue('Group not found')
        });

        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-get-group-details'
        );
        
        const toolHandler = toolCall![2];
        
        await expect(toolHandler({ groupId: 'non-existent' })).rejects.toThrow();
      });
    });

    describe('analyse-error-trends tool', () => {
      it('should analyse error trends successfully', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-analyse-trends'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          timeRange: '24h',
          resolution: '1h'
        });
        
        expect(result.content[0].text).toContain('Error Trends Analysis');
        expect(result.content[0].text).toContain('**Total Error Groups:** 1');
        expect(result.content[0].text).toContain('**Total Errors:**');
        expect(result.content[0].text).toContain('Top Contributing Error Groups');
        
        // Verify timedCountDuration parameter
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('timedCountDuration=3600s');
      });

      it('should handle different resolution settings', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-analyse-trends'
        );
        
        const toolHandler = toolCall![2];
        
        // Test 5-minute resolution
        await toolHandler({
          timeRange: '1h',
          resolution: '5m'
        });
        
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('timedCountDuration=300s');
        expect(fetchCall[0]).toContain('timeRange.period=PERIOD_1_HOUR');
      });

      it('should handle service filter', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-analyse-trends'
        );
        
        const toolHandler = toolCall![2];
        await toolHandler({
          timeRange: '7d',
          serviceFilter: 'my-service'
        });
        
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('serviceFilter.service=my-service');
        expect(fetchCall[0]).toContain('timeRange.period=PERIOD_1_WEEK');
      });

      it('should handle empty trends data', async () => {
        // Mock empty response
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ errorGroupStats: [] }),
          text: vi.fn().mockResolvedValue('{}')
        });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockErrorReportingAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
        
        registerErrorReportingTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-error-reporting-analyse-trends'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          timeRange: '24h'
        });
        
        expect(result.content[0].text).toContain('No error data found for trend analysis');
      });
    });

    it('should handle authentication errors', async () => {
      // Mock auth failure
      mockErrorReportingAuth.getClient.mockRejectedValue(new Error('Auth failed'));

      const { registerErrorReportingTools } = await import('../../../../src/services/error-reporting/tools.js');
      
      registerErrorReportingTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-error-reporting-list-groups'
      );
      
      const toolHandler = toolCall![2];
      
      await expect(toolHandler({ timeRange: '1h' })).rejects.toThrow();
    });
  });
});