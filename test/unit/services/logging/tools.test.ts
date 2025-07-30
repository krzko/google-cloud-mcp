/**
 * Tests for Logging service tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { mockLoggingClient } from '../../../mocks/google-cloud-mocks.js';
import { createMockMcpServer, createMockLogEntries } from '../../../utils/test-helpers.js';

describe('Logging Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
    
    // Reset mock implementations
    mockLoggingClient.getEntries.mockResolvedValue([createMockLogEntries(), {}, {}]);
    mockLoggingClient.createSink.mockResolvedValue([{ name: 'test-sink' }]);
  });

  describe('registerLoggingTools', () => {
    it('should register logging tools with MCP server', async () => {
      const { registerLoggingTools } = await import('../../../../src/services/logging/tools.js');
      
      registerLoggingTools(mockServer as any);
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-logging-query-logs',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-logging-search-comprehensive',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle search-logs tool execution', async () => {
      const { registerLoggingTools } = await import('../../../../src/services/logging/tools.js');
      
      registerLoggingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-logging-query-logs'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({
        filter: 'severity>=ERROR',
        pageSize: 10
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Log Query Results');
    });

    it('should handle search-logs-comprehensive tool execution', async () => {
      const { registerLoggingTools } = await import('../../../../src/services/logging/tools.js');
      
      registerLoggingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-logging-search-comprehensive'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({
        searchTerm: 'error',
        searchFields: ['textPayload', 'jsonPayload'],
        timeRange: '1h'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Comprehensive Log Search Results');
    });

    it('should handle errors gracefully', async () => {
      const { registerLoggingTools } = await import('../../../../src/services/logging/tools.js');
      
      // Mock error
      mockLoggingClient.getEntries.mockRejectedValue(new Error('Logging API Error'));
      
      registerLoggingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-logging-query-logs'
      );
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({
        filter: 'severity>=ERROR'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error');
    });
  });
});