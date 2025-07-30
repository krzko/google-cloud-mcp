/**
 * Tests for Profiler service tools
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { createMockMcpServer } from '../../../utils/test-helpers.js';

// Create specific Profiler auth mock
const mockProfilerAuth = {
  getClient: vi.fn().mockResolvedValue({
    getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' })
  }),
  getProjectId: vi.fn().mockResolvedValue('test-project'),
};

// Mock the auth module specifically for Profiler
vi.mock('../../../../src/utils/auth.js', () => ({
  initGoogleAuth: vi.fn().mockResolvedValue(mockProfilerAuth),
  getProjectId: vi.fn().mockResolvedValue('test-project'),
}));

// Mock global fetch
global.fetch = vi.fn();
const mockFetch = fetch as any;

// Mock profiler data
const mockProfiles = [
  {
    name: 'projects/test-project/profiles/profile-123',
    profileType: 'CPU',
    deployment: {
      projectId: 'test-project',
      target: 'test-service',
      labels: {
        'version': '1.0.0'
      }
    },
    duration: 'PT60S',
    profileBytes: 'gzipped-profile-data',
    labels: {
      'language': 'go'
    },
    startTime: '2024-01-01T12:00:00Z'
  },
  {
    name: 'projects/test-project/profiles/profile-456',
    profileType: 'HEAP',
    deployment: {
      projectId: 'test-project',
      target: 'worker-service',
      labels: {
        'version': '2.0.0'
      }
    },
    duration: 'PT30S',
    profileBytes: 'gzipped-heap-data',
    labels: {
      'language': 'java'
    },
    startTime: '2024-01-01T11:00:00Z'
  }
];

describe('Profiler Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
    
    // Reset auth mock to ensure it always returns the mocked auth client
    const mockClient = { getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }) };
    mockProfilerAuth.getClient.mockResolvedValue(mockClient);
    mockProfilerAuth.getProjectId.mockResolvedValue('test-project');
    
    // Mock successful fetch responses by default
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        profiles: mockProfiles
      }),
      text: vi.fn().mockResolvedValue('{}')
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('registerProfilerTools', () => {
    it('should register profiler tools with MCP server', async () => {
      // Ensure auth mock is set up correctly for this test
      const authModule = await import('../../../../src/utils/auth.js');
      vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
      vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
      
      const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
      
      registerProfilerTools(mockServer as any);
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-profiler-list-profiles',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-profiler-analyse-performance',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-profiler-compare-trends',
        expect.any(Object),
        expect.any(Function)
      );
    });

    describe('list-profiles tool', () => {
      it('should handle successful profile listing', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-list-profiles'
        );
        
        expect(toolCall).toBeDefined();
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          pageSize: 50
        });
        
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain('Profiler Analysis');
        expect(result.content[0].text).toContain('test-service');
        expect(result.content[0].text).toContain('CPU Time');
        
        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('projects/test-project/profiles'),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-token'
            })
          })
        );
      });

      it('should handle empty profiles response', async () => {
        // Mock empty response
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ profiles: [] }),
          text: vi.fn().mockResolvedValue('{}')
        });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-list-profiles'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          pageSize: 50
        });
        
        expect(result.content[0].text).toContain('No profiles found');
      });

      it('should handle API errors gracefully', async () => {
        // Mock API error
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          text: vi.fn().mockResolvedValue('Permission denied')
        });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-list-profiles'
        );
        
        const toolHandler = toolCall![2];
        
        await expect(toolHandler({ pageSize: 50 })).rejects.toThrow();
      });

      it('should handle profile type filtering correctly', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-list-profiles'
        );
        
        const toolHandler = toolCall![2];
        await toolHandler({
          pageSize: 50,
          profileType: 'CPU',
          target: 'test-service'
        });
        
        // Check that the URL was built correctly
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('pageSize=50');
        
        // Note: Client-side filtering is applied after fetch, so we don't see filters in URL
      });
    });

    describe('analyse-profile-performance tool', () => {
      it('should analyse profile performance successfully', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-analyse-performance'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          profileType: 'CPU',
          pageSize: 100
        });
        
        expect(result.content[0].text).toContain('Profile Performance Analysis');
        expect(result.content[0].text).toContain('CPU Time - Shows where your application spends CPU time');
        expect(result.content[0].text).toContain('Performance Insights');
        expect(result.content[0].text).toContain('Actionable Recommendations');
        
        // Verify correct API call
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('pageSize=100');
      });

      it('should handle no profiles found for analysis', async () => {
        // Mock empty response
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ profiles: [] }),
          text: vi.fn().mockResolvedValue('{}')
        });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-analyse-performance'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          profileType: 'HEAP'
        });
        
        expect(result.content[0].text).toContain('No profiles found for analysis');
      });
    });

    describe('compare-profile-trends tool', () => {
      it('should compare profile trends successfully', async () => {
        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');
        
        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-compare-trends'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          target: 'test-service',
          pageSize: 200
        });
        
        expect(result.content[0].text).toContain('Profile Trend Analysis');
        expect(result.content[0].text).toContain('Analysed: 1 profiles'); // After filtering for test-service
        
        // Verify correct API call with larger page size for trends
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('pageSize=200');
      });

      it('should handle empty trends data', async () => {
        // Mock empty response
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ profiles: [] }),
          text: vi.fn().mockResolvedValue('{}')
        });

        // Ensure auth mock is set up correctly for this test
        const authModule = await import('../../../../src/utils/auth.js');
        vi.mocked(authModule.initGoogleAuth).mockResolvedValue(mockProfilerAuth);
        vi.mocked(authModule.getProjectId).mockResolvedValue('test-project');

        const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
        
        registerProfilerTools(mockServer as any);
        
        const toolCall = mockServer.tool.mock.calls.find(
          call => call[0] === 'gcp-profiler-compare-trends'
        );
        
        const toolHandler = toolCall![2];
        const result = await toolHandler({
          profileType: 'CPU'
        });
        
        expect(result.content[0].text).toContain('No profiles found for trend analysis');
      });
    });

    it('should handle authentication errors', async () => {
      // Mock auth failure
      mockProfilerAuth.getClient.mockRejectedValue(new Error('Auth failed'));

      const { registerProfilerTools } = await import('../../../../src/services/profiler/tools.js');
      
      registerProfilerTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-profiler-list-profiles'
      );
      
      const toolHandler = toolCall![2];
      
      await expect(toolHandler({ pageSize: 50 })).rejects.toThrow();
    });
  });
});