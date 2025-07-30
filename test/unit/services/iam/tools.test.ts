/**
 * Tests for IAM service tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { mockResourceManagerClient } from '../../../mocks/google-cloud-mocks.js';
import { createMockMcpServer, createMockIamPolicy } from '../../../utils/test-helpers.js';

describe('IAM Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
    
    // Reset mock implementations
    mockResourceManagerClient.getIamPolicy.mockResolvedValue([createMockIamPolicy()]);
    mockResourceManagerClient.testIamPermissions.mockResolvedValue([{ permissions: ['test.permission'] }]);
  });

  describe('registerIamTools', () => {
    it('should register IAM tools with MCP server', async () => {
      const { registerIamTools } = await import('../../../../src/services/iam/tools.js');
      
      registerIamTools(mockServer as any);
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-iam-get-project-policy',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-iam-test-project-permissions',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-iam-test-resource-permissions',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-iam-validate-deployment-permissions',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle get-project-iam-policy tool execution', async () => {
      const { registerIamTools } = await import('../../../../src/services/iam/tools.js');
      
      registerIamTools(mockServer as any);
      
      // Get the registered tool handler
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-get-project-policy'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ project: 'test-project' });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Project IAM Policy');
    });

    it('should handle test-project-permissions tool execution', async () => {
      const { registerIamTools } = await import('../../../../src/services/iam/tools.js');
      
      registerIamTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-test-project-permissions'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        permissions: ['test.permission', 'missing.permission'] 
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Project IAM Permissions Test');
      expect(result.content[0].text).toContain('✅ Granted Permissions');
    });

    it('should handle validate-deployment-permissions tool execution', async () => {
      const { registerIamTools } = await import('../../../../src/services/iam/tools.js');
      
      // Mock successful permissions response
      mockResourceManagerClient.testIamPermissions.mockResolvedValue([{
        permissions: ['run.services.create', 'run.services.update', 'run.services.get']
      }]);
      
      registerIamTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-validate-deployment-permissions'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        service: 'cloud-run',
        project: 'test-project'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Cloud Run Deployment Validation');
      expect(result.content[0].text).toContain('Required Permissions');
    });

    it('should handle unknown service in validate-deployment-permissions', async () => {
      const { registerIamTools } = await import('../../../../src/services/iam/tools.js');
      
      registerIamTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-validate-deployment-permissions'
      );
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        service: 'unknown-service'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid Service');
    });

    it('should handle analyse-permission-gaps tool execution', async () => {
      const { registerIamTools } = await import('../../../../src/services/iam/tools.js');
      
      registerIamTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-analyse-permission-gaps'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        requiredPermissions: ['test.permission', 'another.permission'],
        operationDescription: 'Test operation'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Permission Gap Analysis');
      expect(result.content[0].text).toContain('Test operation');
    });

    it('should handle errors gracefully', async () => {
      const { registerIamTools } = await import('../../../../src/services/iam/tools.js');
      
      // Mock error
      mockResourceManagerClient.getIamPolicy.mockRejectedValue(new Error('API Error'));
      
      registerIamTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-get-project-policy'
      );
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ project: 'test-project' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error Getting Project IAM Policy');
    });
  });
});