#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import utility tools
import {
  detectProject,
  detectProjectTool,
} from './tools/utility/detect-project.js';
import {
  setJavaVersion,
  setJavaVersionTool,
} from './tools/utility/java-version.js';

// Import Java tools
import {
  compileProject,
  compileProjectTool,
} from './tools/java/compile.js';
import {
  buildProject,
  buildProjectTool,
} from './tools/java/build.js';
import {
  installProject,
  installProjectTool,
} from './tools/java/install.js';
import {
  runTests,
  runTestsTool,
} from './tools/java/test.js';

// Import Node tools
import {
  nodeBuildProject,
  nodeBuildProjectTool,
  nodeTypeCheckProject,
  nodeTypeCheckTool,
} from './tools/node/build.js';
import {
  nodeRunTests,
  nodeRunTestsTool,
} from './tools/node/test.js';

// Create the MCP server
const server = new Server(
  {
    name: 'build-runner',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all tools
const allTools = [
  // Utility tools
  detectProjectTool,
  setJavaVersionTool,
  // Java tools
  compileProjectTool,
  buildProjectTool,
  installProjectTool,
  runTestsTool,
  // Node tools
  nodeBuildProjectTool,
  nodeTypeCheckTool,
  nodeRunTestsTool,
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      // Utility tools
      case 'detect_project':
        result = await detectProject(args as { projectPath: string });
        break;

      case 'set_java_version':
        result = await setJavaVersion(args as { version: string; projectPath?: string });
        break;

      // Java tools
      case 'compile_project':
        result = await compileProject(args as {
          projectPath: string;
          javaVersion?: string;
          clean?: boolean;
          module?: string;
        });
        break;

      case 'build_project':
        result = await buildProject(args as {
          projectPath: string;
          javaVersion?: string;
          skipTests?: boolean;
          clean?: boolean;
          module?: string;
        });
        break;

      case 'install_project':
        result = await installProject(args as {
          projectPath: string;
          javaVersion?: string;
          skipTests?: boolean;
          clean?: boolean;
          module?: string;
        });
        break;

      case 'run_tests':
        result = await runTests(args as {
          projectPath: string;
          javaVersion?: string;
          testPattern?: string;
          module?: string;
          failFast?: boolean;
          clean?: boolean;
        });
        break;

      // Node tools
      case 'node_build':
        result = await nodeBuildProject(args as {
          projectPath: string;
          script?: string;
          packageManager?: 'npm' | 'pnpm' | 'yarn';
        });
        break;

      case 'node_typecheck':
        result = await nodeTypeCheckProject(args as {
          projectPath: string;
          packageManager?: 'npm' | 'pnpm' | 'yarn';
        });
        break;

      case 'node_test':
        result = await nodeRunTests(args as {
          projectPath: string;
          testPattern?: string;
          failFast?: boolean;
          coverage?: boolean;
          packageManager?: 'npm' | 'pnpm' | 'yarn';
          testFramework?: 'jest' | 'vitest' | 'mocha';
        });
        break;

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: errorMessage,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Build Runner MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
