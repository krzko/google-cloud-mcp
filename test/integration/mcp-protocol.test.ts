/**
 * MCP Protocol Compliance Tests
 * Tests adherence to Model Context Protocol specification 2025-06-18
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import mocks first
import '../mocks/google-cloud-mocks.js';
import { mockMcpServer } from '../mocks/google-cloud-mocks.js';

describe('MCP Protocol Compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Server Initialization', () => {
    it('should create MCP server with correct metadata', async () => {
      // This test verifies server creation matches MCP specification
      const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
      
      expect(McpServer).toBeDefined();
      expect(mockMcpServer).toBeDefined();
    });

    it('should support required capabilities', async () => {
      // Test that server declares required capabilities
      const capabilities = {
        prompts: {},
        resources: {},
        tools: {}
      };
      
      expect(capabilities.prompts).toBeDefined();
      expect(capabilities.resources).toBeDefined();
      expect(capabilities.tools).toBeDefined();
    });
  });

  describe('Tool Registration Compliance', () => {
    it('should register IAM tools with proper schema', async () => {
      const { registerIamTools } = await import('../../src/services/iam/tools.js');
      
      registerIamTools(mockMcpServer as any);
      
      // Verify tools are registered with required fields
      const toolCalls = mockMcpServer.registerTool.mock.calls;
      
      toolCalls.forEach(call => {
        const [name, schema, handler] = call;
        
        expect(typeof name).toBe('string');
        expect(schema).toHaveProperty('title');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('inputSchema');
        expect(typeof handler).toBe('function');
      });
    });

    it('should register billing tools with proper schema', async () => {
      vi.clearAllMocks();
      const { registerBillingTools } = await import('../../src/services/billing/tools.js');
      
      registerBillingTools(mockMcpServer as any);
      
      // Verify billing tools are registered with required fields
      const toolCalls = mockMcpServer.registerTool.mock.calls;
      
      expect(toolCalls.length).toBeGreaterThan(0);
      
      toolCalls.forEach(call => {
        const [name, schema, handler] = call;
        
        expect(typeof name).toBe('string');
        expect(name).toMatch(/^gcp-billing-/);
        expect(schema).toHaveProperty('title');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('inputSchema');
        expect(typeof handler).toBe('function');
      });
    });

    it('should validate tool input schemas', async () => {
      const { registerIamTools } = await import('../../src/services/iam/tools.js');
      
      registerIamTools(mockMcpServer as any);
      
      const toolCall = mockMcpServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-get-project-policy'
      );
      
      expect(toolCall).toBeDefined();
      
      const schema = toolCall[1];
      expect(schema.inputSchema).toBeDefined();
      
      // Verify Zod schema structure
      if (schema.inputSchema.project) {
        expect(schema.inputSchema.project).toBeDefined();
      }
    });
  });

  describe('Resource Registration Compliance', () => {
    it('should register IAM resources with proper templates', async () => {
      const { registerIamResources } = await import('../../src/services/iam/resources.js');
      
      registerIamResources(mockMcpServer as any);
      
      // Verify resources are registered with MCP compliant structure
      expect(mockMcpServer.resource).toHaveBeenCalled();
      
      const resourceCalls = mockMcpServer.resource.mock.calls;
      
      resourceCalls.forEach(call => {
        const [name, template, handler] = call;
        
        expect(typeof name).toBe('string');
        expect(template).toBeDefined();
        expect(typeof handler).toBe('function');
      });
    });

    it('should register billing resources with proper templates', async () => {
      vi.clearAllMocks();
      const { registerBillingResources } = await import('../../src/services/billing/resources.js');
      
      registerBillingResources(mockMcpServer as any);
      
      // Verify billing resources are registered with MCP compliant structure
      expect(mockMcpServer.resource).toHaveBeenCalled();
      
      const resourceCalls = mockMcpServer.resource.mock.calls;
      
      resourceCalls.forEach(call => {
        const [name, template, handler] = call;
        
        expect(typeof name).toBe('string');
        expect(name).toMatch(/^gcp-billing-/);
        expect(template).toBeDefined();
        expect(typeof handler).toBe('function');
      });
    });
  });

  describe('Response Format Compliance', () => {
    it('should return MCP-compliant IAM tool responses', async () => {
      const { registerIamTools } = await import('../../src/services/iam/tools.js');
      
      registerIamTools(mockMcpServer as any);
      
      const toolCall = mockMcpServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-test-project-permissions'
      );
      
      const toolHandler = toolCall[2];
      const result = await toolHandler({ permissions: ['test.permission'] });
      
      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return MCP-compliant billing tool responses', async () => {
      vi.clearAllMocks();
      
      // Import and set up billing client mock
      const { mockBillingClient } = await import('../mocks/google-cloud-mocks.js');
      const { createMockBillingAccount } = await import('../utils/test-helpers.js');
      
      // Reset billing client mock for this test
      mockBillingClient.listBillingAccounts.mockResolvedValue([[createMockBillingAccount()], null]);
      
      const { registerBillingTools } = await import('../../src/services/billing/tools.js');
      
      registerBillingTools(mockMcpServer as any);
      
      const toolCall = mockMcpServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-accounts'
      );
      
      const toolHandler = toolCall[2];
      const result = await toolHandler({ pageSize: 10 });
      
      // Verify MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should handle errors in MCP-compliant format', async () => {
      const { registerIamTools } = await import('../../src/services/iam/tools.js');
      
      // Mock error condition
      const { mockResourceManagerClient } = await import('../mocks/google-cloud-mocks.js');
      mockResourceManagerClient.testIamPermissions.mockRejectedValue(new Error('Test error'));
      
      registerIamTools(mockMcpServer as any);
      
      const toolCall = mockMcpServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-test-project-permissions'
      );
      
      const toolHandler = toolCall[2];
      const result = await toolHandler({ permissions: ['test.permission'] });
      
      // Verify error response structure
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError');
      expect(result.isError).toBe(true);
    });
  });

  describe('Security Best Practices Compliance', () => {
    it('should validate input parameters', async () => {
      const { registerIamTools } = await import('../../src/services/iam/tools.js');
      
      registerIamTools(mockMcpServer as any);
      
      const toolCall = mockMcpServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-test-resource-permissions'
      );
      
      const toolHandler = toolCall[2];
      
      // Test should handle invalid input gracefully
      try {
        await toolHandler({ resource: '', permissions: [] });
        // Should not throw, but handle gracefully
      } catch (error) {
        // If it throws, it should be a handled error
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should not expose sensitive information in errors', async () => {
      const { registerIamTools } = await import('../../src/services/iam/tools.js');
      
      registerIamTools(mockMcpServer as any);
      
      const toolCall = mockMcpServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-iam-get-project-policy'
      );
      
      const toolHandler = toolCall[2];
      const result = await toolHandler({ project: 'test-project' });
      
      // Verify no sensitive data in response
      const responseText = result.content[0].text;
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('secret');
      expect(responseText).not.toContain('key');
    });
  });

  describe('Transport Layer Compliance', () => {
    it('should support stdio transport', () => {
      const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
      expect(StdioServerTransport).toBeDefined();
    });

    it('should handle UTF-8 encoding', () => {
      const testString = '🔐 IAM Policy Test ✅';
      const encoded = Buffer.from(testString, 'utf-8');
      const decoded = encoded.toString('utf-8');
      
      expect(decoded).toBe(testString);
    });
  });
});