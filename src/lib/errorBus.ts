type Listener = (msg: string) => void;

const listeners: Listener[] = [];
const buffer: string[] = [];

export function emitError(msg: string) {
  const entry = `[${new Date().toLocaleTimeString()}] ERROR: ${msg.slice(0, 500)}`;
  buffer.push(entry);
  listeners.forEach(fn => fn(entry));
}

export function onError(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function getBufferedErrors(): string[] {
  return [...buffer];
}

export function clearBufferedErrors(): void {
  buffer.length = 0;
}