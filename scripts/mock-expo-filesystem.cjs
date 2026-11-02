const files = new Map();

module.exports = {
  documentDirectory: null,
  writeAsStringAsync: async (path, content) => {
    files.set(path, content);
  },
  readAsStringAsync: async (path) => {
    if (!files.has(path)) {
      throw new Error(`File not found: ${path}`);
    }
    return files.get(path);
  },
  deleteAsync: async (path) => {
    files.delete(path);
  },
  moveAsync: async ({ from, to }) => {
    const data = files.get(from);
    files.set(to, data);
    files.delete(from);
  },
  getInfoAsync: async (path) => ({
    exists: files.has(path),
  }),
  makeDirectoryAsync: async () => {},
};

