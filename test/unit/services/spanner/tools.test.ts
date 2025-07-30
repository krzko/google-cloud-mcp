/**
 * Tests for Spanner service tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { mockSpannerClient } from '../../../mocks/google-cloud-mocks.js';
import { createMockMcpServer } from '../../../utils/test-helpers.js';

describe('Spanner Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
    
    // Reset mock implementations
    const mockDatabase = {
      run: vi.fn().mockResolvedValue([[], {}]),
      runStream: vi.fn().mockReturnValue({
        on: vi.fn(),
        pipe: vi.fn(),
      }),
      getSchema: vi.fn().mockResolvedValue([{
        name: 'test_table',
        columns: [
          { name: 'id', type: 'STRING(36)', nullable: false },
          { name: 'name', type: 'STRING(255)', nullable: true }
        ]
      }])
    };
    
    const mockInstance = {
      database: vi.fn().mockReturnValue(mockDatabase),
      getDatabases: vi.fn().mockResolvedValue([
        [{ name: 'test-database' }],
        {}
      ])
    };
    
    mockSpannerClient.instance.mockReturnValue(mockInstance);
  });

  describe('registerSpannerTools', () => {
    it('should register spanner tools with MCP server', async () => {
      const { registerSpannerTools } = await import('../../../../src/services/spanner/tools.js');
      
      registerSpannerTools(mockServer as any);
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-spanner-execute-query',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-spanner-list-databases',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle execute-spanner-query tool execution', async () => {
      const { registerSpannerTools } = await import('../../../../src/services/spanner/tools.js');
      
      registerSpannerTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-spanner-execute-query'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({
        instanceId: 'test-instance',
        databaseId: 'test-database',
        sql: 'SELECT * FROM test_table LIMIT 10'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should handle list-spanner-databases tool execution', async () => {
      const { registerSpannerTools } = await import('../../../../src/services/spanner/tools.js');
      
      registerSpannerTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-spanner-list-databases'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({
        instanceId: 'test-instance'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const { registerSpannerTools } = await import('../../../../src/services/spanner/tools.js');
      
      // Mock error in database operation
      const mockDatabase = {
        run: vi.fn().mockRejectedValue(new Error('Database error')),
        runStream: vi.fn(),
        getSchema: vi.fn()
      };
      
      const mockInstance = {
        database: vi.fn().mockReturnValue(mockDatabase)
      };
      
      mockSpannerClient.instance.mockReturnValue(mockInstance);
      
      registerSpannerTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-spanner-execute-query'
      );
      
      const toolHandler = toolCall![2];
      
      try {
        await toolHandler({
          instanceId: 'test-instance',
          databaseId: 'test-database',
          sql: 'SELECT * FROM test_table'
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Database error');
      }
    });
  });
});