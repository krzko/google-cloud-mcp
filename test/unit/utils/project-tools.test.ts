/**
 * Tests for project tools utilities
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../mocks/google-cloud-mocks.js';
import { createMockMcpServer } from '../../utils/test-helpers.js';

describe('Project Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
  });

  describe('registerProjectTools', () => {
    it('should register project tools with MCP server', async () => {
      const { registerProjectTools } = await import('../../../src/utils/project-tools.js');
      
      registerProjectTools(mockServer as any);
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-utils-set-project-id',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-utils-get-project-id',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle set-project-id tool execution', async () => {
      const { registerProjectTools } = await import('../../../src/utils/project-tools.js');
      
      registerProjectTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-utils-set-project-id'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ project_id: 'new-project-id' });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Project ID Updated');
    });

    it('should handle get-project-id tool execution', async () => {
      const { registerProjectTools } = await import('../../../src/utils/project-tools.js');
      
      registerProjectTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-utils-get-project-id'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({});
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Current Google Cloud Project');
    });

    it('should handle invalid project ID', async () => {
      const { registerProjectTools } = await import('../../../src/utils/project-tools.js');
      
      registerProjectTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-utils-set-project-id'
      );
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ project_id: '' });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Error');
    });
  });
});