type FrameworkState = {
  frameworkId: string;
  generatedContent: string;
  userPrompt: string;
  selectedDocIds: string[];
  outputName: string;
  selectedProvider: string;
  selectedModel: string;
  refinementMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

const cache = new Map<string, FrameworkState>();

function key(projectId: string, frameworkId: string) {
  return `${projectId}:${frameworkId}`;
}

export function getFrameworkState(projectId: string, frameworkId: string): FrameworkState | null {
  return cache.get(key(projectId, frameworkId)) || null;
}

export function setFrameworkState(projectId: string, frameworkId: string, state: FrameworkState) {
  cache.set(key(projectId, frameworkId), state);
}

export function clearFrameworkState(projectId: string, frameworkId: string) {
  cache.delete(key(projectId, frameworkId));
}
